#!/usr/bin/env node
/**
 * Recalcula score_basica/pedagogica/acessibilidade/conectividade em
 * diag_censo_infra usando a nova lógica de famílias (calcularScores em
 * lib/radar/censo-scores.ts replicado abaixo). Streama em batches de 500
 * pra evitar timeout do Postgres.
 *
 * Uso: node scripts/recompute-censo-scores.mjs
 */
import { readFileSync } from 'node:fs';
import { stderr } from 'node:process';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { stderr.write('Faltam env vars\n'); process.exit(1); }

const SCORE_GROUPS = {
  basica: [
    ['IN_AGUA_POTAVEL', 'IN_AGUA_REDE_PUBLICA'],
    ['IN_ENERGIA_REDE_PUBLICA'],
    ['IN_ESGOTO_REDE_PUBLICA'],
    ['IN_BANHEIRO', 'IN_BANHEIRO_DENTRO_PREDIO'],
    ['IN_LIXO_DESTINO_REDE_LIMPEZA_URBANA'],
    ['IN_ALMOXARIFADO'],
  ],
  pedagogica: [
    ['IN_BIBLIOTECA', 'IN_BIBLIOTECA_SALA_LEITURA', 'IN_SALA_LEITURA'],
    ['IN_LABORATORIO_INFORMATICA'],
    ['IN_LABORATORIO_CIENCIAS'],
    ['IN_AUDITORIO'],
    ['IN_AREA_VERDE'],
    ['IN_PARQUE_INFANTIL'],
    ['IN_QUADRA_ESPORTES', 'IN_QUADRA_ESPORTES_COBERTA', 'IN_PATIO_COBERTO'],
    ['IN_REFEITORIO', 'IN_COZINHA'],
  ],
  acessibilidade: [
    ['IN_ACESSIBILIDADE_RAMPAS'],
    ['IN_ACESSIBILIDADE_CORRIMAO'],
    ['IN_ACESSIBILIDADE_ELEVADOR'],
    ['IN_ACESSIBILIDADE_PISOS_TATEIS'],
    ['IN_ACESSIBILIDADE_VAO_LIVRE'],
    ['IN_ACESSIBILIDADE_BARRAS_BANHEIRO'],
    ['IN_ACESSIBILIDADE_BANHEIRO', 'IN_BANHEIRO_PNE'],
    ['IN_ACESSIBILIDADE_SINAL_SONORO'],
    ['IN_ACESSIBILIDADE_SINAL_TATIL'],
    ['IN_ACESSIBILIDADE_SINAL_VISUAL'],
  ],
  conectividade: [
    ['IN_INTERNET'],
    ['IN_INTERNET_APRENDIZAGEM', 'IN_INTERNET_ALUNOS'],
    ['IN_INTERNET_ADMINISTRATIVO'],
    ['IN_BANDA_LARGA'],
  ],
};

function calcularScores(indicadores) {
  const out = {};
  for (const [key, familias] of Object.entries(SCORE_GROUPS)) {
    let sum = 0, count = 0;
    for (const familia of familias) {
      let medido = false, temAlgum = false;
      for (const col of familia) {
        const v = indicadores?.[col];
        if (v == null || v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        medido = true;
        if (n > 0) { temAlgum = true; break; }
      }
      if (medido) { sum += temAlgum ? 1 : 0; count++; }
    }
    out[key] = count > 0 ? Math.round((sum / count) * 100 * 100) / 100 : null;
  }
  return out;
}

async function pgSelect(table, cols, range) {
  const r = await fetch(`${URL}/rest/v1/${table}?select=${cols}&order=codigo_inep&offset=${range[0]}&limit=${range[1]}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.json();
}

async function pgUpsert(rows) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(`${URL}/rest/v1/diag_censo_infra?on_conflict=codigo_inep,ano`, {
        method: 'POST',
        headers: {
          apikey: KEY, Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      });
      if (r.ok) return;
      if (r.status >= 500 && attempt < maxAttempts) {
        const wait = 2000 * attempt;
        await new Promise((res) => setTimeout(res, wait));
        continue;
      }
      const text = await r.text();
      throw new Error(`upsert falhou ${r.status}: ${text.slice(0, 200)}`);
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
}

async function main() {
  const BATCH = 500;
  let processed = 0, updated = 0;
  const t0 = Date.now();

  while (true) {
    const rows = await pgSelect('diag_censo_infra', 'codigo_inep,ano,indicadores', [processed, BATCH]);
    if (!Array.isArray(rows) || rows.length === 0) break;

    const upserts = rows.map((row) => {
      const scores = calcularScores(row.indicadores || {});
      return {
        codigo_inep: row.codigo_inep,
        ano: row.ano,
        indicadores: row.indicadores,
        score_basica: scores.basica,
        score_pedagogica: scores.pedagogica,
        score_acessibilidade: scores.acessibilidade,
        score_conectividade: scores.conectividade,
      };
    });

    await pgUpsert(upserts);
    updated += upserts.length;
    processed += rows.length;

    const elapsed = (Date.now() - t0) / 1000;
    const rate = (processed / elapsed).toFixed(0);
    stderr.write(`\r${processed} processadas · ${rate} rows/s`);

    if (rows.length < BATCH) break;
  }

  stderr.write(`\n\nConcluído: ${updated} escolas atualizadas em ${((Date.now()-t0)/1000).toFixed(1)}s\n`);
}

main().catch((e) => { stderr.write(`ERRO: ${e.message}\n`); process.exit(1); });
