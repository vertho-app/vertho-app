#!/usr/bin/env node
/**
 * Updater de MATRÍCULAS do Censo Escolar (só a coluna `matriculas`).
 *
 * Por que script dedicado (e não o import-censo.mjs completo)?
 *   As matrículas (QT_MAT_BAS) só existem nos **Microdados da Educação
 *   Básica** (microdados_ed_basica_YYYY.csv, ~400 colunas) — NÃO no
 *   Catálogo de Escolas (Tabela_Escola), que é a fonte da infra já
 *   carregada. O ed_basica não tem endereço/bairro/CEP; rodar o import
 *   completo nele NULARIA esses campos. Este script faz UPSERT enviando
 *   só {codigo_inep, ano, matriculas} → o PostgREST (merge-duplicates)
 *   atualiza APENAS a coluna `matriculas` em linhas existentes; quantidades,
 *   endereço e infra ficam intactos. Linhas novas (escola só no ed_basica)
 *   entram com identidade + matrícula.
 *
 * Pré-requisito: migration 115 aplicada (coluna diag_censo_infra.matriculas).
 *
 * Uso:
 *   cd nextjs-app
 *   node scripts/import-censo-matriculas.mjs "<path>/microdados_ed_basica_2025.csv" --ano 2025 [--uf SP] [--limit N] [--dry]
 *
 * Lê .env.local pra NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createReadStream, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { argv, exit, stdout, stderr } from 'node:process';

// ── env ─────────────────────────────────────────────────────────────
const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  stderr.write('ERRO: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes em .env.local\n');
  exit(1);
}

// ── args ────────────────────────────────────────────────────────────
const inputPath = argv[2];
if (!inputPath || inputPath.startsWith('--')) {
  stderr.write('Uso: node scripts/import-censo-matriculas.mjs <microdados_ed_basica.csv> --ano 2025 [--uf SP] [--limit N] [--dry]\n');
  exit(1);
}
const flag = (name, fb = null) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fb; };
const has = (name) => argv.includes(name);
const ANO_FORCE = flag('--ano') ? Number(flag('--ano')) : null;
const UF = flag('--uf') ? String(flag('--uf')).toUpperCase() : null;
const LIMIT = flag('--limit') ? Number(flag('--limit')) : null;
const DRY = has('--dry');

const inputAbs = resolve(inputPath);
if (!existsSync(inputAbs)) { stderr.write(`ERRO: arquivo não encontrado: ${inputAbs}\n`); exit(1); }
const fileSize = statSync(inputAbs).size;

stderr.write(`Input:    ${inputAbs} (${(fileSize / 1024 / 1024).toFixed(1)}MB)\n`);
stderr.write(`Supabase: ${URL}\n`);
stderr.write(`Modo:     ${DRY ? 'DRY RUN (não grava)' : 'UPDATE só matriculas'}\n`);
if (UF) stderr.write(`UF:       ${UF}\n`);
if (LIMIT) stderr.write(`Limit:    ${LIMIT} linhas\n`);
if (ANO_FORCE) stderr.write(`Ano:      ${ANO_FORCE} (forçado)\n`);
stderr.write('\n');

// ── helpers ─────────────────────────────────────────────────────────
function splitCsvLine(line, sep) {
  const out = []; let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
    else if (c === sep && !inQuote) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function toMat(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  if ([8888, 88888, 9999, 99999, 999999].includes(n)) return null; // sentinelas INEP
  return Math.round(n);
}

async function postBatch(body) {
  return fetch(`${URL}/rest/v1/diag_censo_infra?on_conflict=codigo_inep,ano`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
}

// ── stream + parse ──────────────────────────────────────────────────
async function main() {
  const rl = createInterface({
    input: createReadStream(inputAbs, { encoding: 'latin1' }), // microdados INEP = ISO-8859-1
    crlfDelay: Infinity,
  });

  let header = null, sep = ';';
  let iInep = -1, iAno = -1, iUf = -1, iMat = -1;
  const totals = { processado: 0, comMat: 0, semMat: 0, gravado: 0, falha: 0, skip: 0, erros: [] };
  const seen = new Set();
  const batch = [];
  const BATCH = 500;
  const startedAt = Date.now();
  let lastReport = startedAt;

  async function flush() {
    if (batch.length === 0) return;
    if (DRY) { totals.gravado += batch.length; batch.length = 0; return; }
    try {
      const res = await postBatch(batch);
      if (!res.ok) {
        const t = await res.text();
        totals.falha += batch.length;
        if (totals.erros.length < 5) totals.erros.push(t.slice(0, 300));
        // Erro de coluna ausente → migration 115 não aplicada. Aborta cedo.
        if (/matriculas/.test(t) && /column/i.test(t)) {
          stderr.write(`\nFATAL: coluna 'matriculas' não existe — aplique a migration 115 antes.\n  ${t.slice(0, 200)}\n`);
          exit(4);
        }
      } else {
        totals.gravado += batch.length;
      }
    } catch (err) {
      totals.falha += batch.length;
      if (totals.erros.length < 5) totals.erros.push(err.message);
    }
    batch.length = 0;
  }

  for await (const line of rl) {
    if (!header) {
      sep = line.split(';').length > line.split(',').length ? ';' : ',';
      header = splitCsvLine(line, sep).map((h) => h.trim());
      iInep = header.indexOf('CO_ENTIDADE');
      iAno = header.indexOf('NU_ANO_CENSO');
      iUf = header.indexOf('SG_UF');
      iMat = header.indexOf('QT_MAT_BAS');
      const qtMatCols = header.filter((h) => /^QT_MAT/.test(h));
      stderr.write(`Header: sep="${sep}" · ${header.length} colunas · QT_MAT*: ${qtMatCols.length} (${qtMatCols.slice(0, 8).join(', ')}${qtMatCols.length > 8 ? '…' : ''})\n`);
      if (iInep < 0 || iAno < 0) { stderr.write('ERRO: CO_ENTIDADE/NU_ANO_CENSO ausentes\n'); exit(2); }
      if (iMat < 0) {
        stderr.write('ERRO: coluna QT_MAT_BAS ausente — este arquivo NÃO é o microdados ed_basica.\n        O Catálogo (Tabela_Escola) não tem matrícula. Baixe os Microdados da Educação Básica.\n');
        exit(3);
      }
      stderr.write('\n');
      continue;
    }
    if (LIMIT && totals.processado >= LIMIT) break;
    totals.processado++;

    const cells = splitCsvLine(line, sep);
    if (UF && iUf >= 0 && String(cells[iUf] || '').trim().toUpperCase() !== UF) { totals.skip++; continue; }

    const codigoInep = String(cells[iInep] || '').trim();
    const ano = ANO_FORCE || Number(cells[iAno]);
    if (codigoInep.length !== 8 || !Number.isFinite(ano)) { totals.skip++; continue; }
    const key = `${codigoInep}_${ano}`;
    if (seen.has(key)) { totals.skip++; continue; }
    seen.add(key);

    const matriculas = toMat(cells[iMat]);
    if (matriculas == null) { totals.semMat++; continue; } // sem matrícula válida → não mexe na linha
    totals.comMat++;

    batch.push({ codigo_inep: codigoInep, ano, matriculas });
    if (batch.length >= BATCH) await flush();

    const now = Date.now();
    if (now - lastReport > 2000) {
      const rate = totals.processado / ((now - startedAt) / 1000);
      stderr.write(`  ${totals.processado.toLocaleString('pt-BR')} linhas · ${totals.comMat.toLocaleString('pt-BR')} c/mat · ${totals.gravado.toLocaleString('pt-BR')} gravado · ${rate.toFixed(0)}/s\n`);
      lastReport = now;
    }
  }
  await flush();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  stdout.write(`\n${DRY ? '✓ DRY RUN' : '✓ Concluído'} em ${elapsed}s\n`);
  stdout.write(`  Processado:     ${totals.processado.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Com matrícula:  ${totals.comMat.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Sem matrícula:  ${totals.semMat.toLocaleString('pt-BR')} (não alteradas)\n`);
  stdout.write(`  Skip (filtro/dup): ${totals.skip.toLocaleString('pt-BR')}\n`);
  stdout.write(`  ${DRY ? 'Seriam gravadas' : 'Gravadas'}: ${totals.gravado.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Falha:          ${totals.falha.toLocaleString('pt-BR')}\n`);
  if (totals.erros.length) { stdout.write('\n  Erros:\n'); for (const e of totals.erros) stdout.write(`    ↳ ${e}\n`); }
}

main().catch((err) => { stderr.write(`\nFATAL: ${err?.stack || err}\n`); exit(5); });
