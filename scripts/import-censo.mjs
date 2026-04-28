#!/usr/bin/env node
/**
 * Importador local do Censo Escolar (Tabela_Escola_*.csv) direto pro Supabase.
 *
 * Por que script local em vez de upload via /admin/radar?
 *   O CSV nacional do Censo tem ~165MB. Server actions Next.js estão
 *   configuradas com bodySizeLimit '15mb' e mesmo aumentando, payloads
 *   gigantes em base64 estouram timeout/memória da função Vercel.
 *
 * Uso:
 *   cd nextjs-app
 *   node scripts/import-censo.mjs <caminho-do-csv> [--limit=N] [--ano=2025]
 *
 * Lê .env.local pra pegar SUPABASE_URL + SERVICE_ROLE_KEY.
 * Streaming linha-a-linha (memória constante) com upsert em batch de 100.
 */
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { argv, exit, stdout, stderr } from 'node:process';

// ── 1. Carrega env ──────────────────────────────────────────────────
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

// ── 2. Args ─────────────────────────────────────────────────────────
const inputPath = argv[2];
if (!inputPath) {
  stderr.write('Uso: node scripts/import-censo.mjs <input.csv> [--limit=N] [--ano=2025]\n');
  exit(1);
}
const limitArg = argv.find((a) => a.startsWith('--limit='));
const anoArg = argv.find((a) => a.startsWith('--ano='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null;
const ANO_FORCE = anoArg ? Number(anoArg.split('=')[1]) : null;
const inputAbs = resolve(inputPath);
const fileSize = statSync(inputAbs).size;

stderr.write(`Input:    ${inputAbs} (${(fileSize / 1024 / 1024).toFixed(1)}MB)\n`);
stderr.write(`Supabase: ${URL}\n`);
if (LIMIT) stderr.write(`Limit:    ${LIMIT} linhas\n`);
if (ANO_FORCE) stderr.write(`Ano:      ${ANO_FORCE} (forçado)\n`);
stderr.write('\n');

// ── 3. Helpers — equivalentes a censo-importer.ts ───────────────────
const SCORE_GROUPS = {
  basica: ['IN_AGUA_POTAVEL','IN_AGUA_REDE_PUBLICA','IN_ENERGIA_REDE_PUBLICA','IN_ESGOTO_REDE_PUBLICA','IN_BANHEIRO','IN_BANHEIRO_DENTRO_PREDIO','IN_LIXO_DESTINO_REDE_LIMPEZA_URBANA','IN_ALMOXARIFADO'],
  pedagogica: ['IN_BIBLIOTECA','IN_BIBLIOTECA_SALA_LEITURA','IN_LABORATORIO_INFORMATICA','IN_LABORATORIO_CIENCIAS','IN_AUDITORIO','IN_AREA_VERDE','IN_PARQUE_INFANTIL','IN_PATIO_COBERTO','IN_QUADRA_ESPORTES','IN_QUADRA_ESPORTES_COBERTA','IN_REFEITORIO'],
  acessibilidade: ['IN_ACESSIBILIDADE_RAMPAS','IN_ACESSIBILIDADE_CORRIMAO','IN_ACESSIBILIDADE_ELEVADOR','IN_ACESSIBILIDADE_PISOS_TATEIS','IN_ACESSIBILIDADE_VAO_LIVRE','IN_ACESSIBILIDADE_BARRAS_BANHEIRO','IN_ACESSIBILIDADE_BANHEIRO','IN_ACESSIBILIDADE_SINAL_SONORO','IN_ACESSIBILIDADE_SINAL_TATIL','IN_ACESSIBILIDADE_SINAL_VISUAL'],
  conectividade: ['IN_INTERNET','IN_INTERNET_APRENDIZAGEM','IN_INTERNET_ALUNOS','IN_INTERNET_ADMINISTRATIVO','IN_BANDA_LARGA'],
};

function calcularScores(indicadores) {
  const out = { basica: null, pedagogica: null, acessibilidade: null, conectividade: null };
  for (const [k, cols] of Object.entries(SCORE_GROUPS)) {
    let sum = 0, count = 0;
    for (const col of cols) {
      const v = indicadores[col];
      if (v == null || v === '') continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      sum += n > 0 ? 1 : 0;
      count++;
    }
    out[k] = count > 0 ? Math.round((sum / count) * 100 * 100) / 100 : null;
  }
  return out;
}

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQuote && line[i + 1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
    else if (c === sep && !inQuote) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseLocalizacao(tp) {
  const s = String(tp || '').trim();
  if (s === '1') return 'URBANA';
  if (s === '2') return 'RURAL';
  return null;
}
function parseSituacao(tp) {
  const s = String(tp || '').trim();
  if (s === '1') return 'ativa';
  if (s === '2') return 'paralisada';
  if (s === '3') return 'extinta';
  if (s === '4') return 'transferida';
  return null;
}
function parseRede(tp) {
  // TP_DEPENDENCIA: 1=Federal, 2=Estadual, 3=Municipal, 4=Privada
  const s = String(tp || '').trim();
  if (s === '1') return 'FEDERAL';
  if (s === '2') return 'ESTADUAL';
  if (s === '3') return 'MUNICIPAL';
  if (s === '4') return 'PRIVADA';
  return null;
}
function clamp(v, max) {
  const n = Number(String(v || '').replace(',', '.'));
  if (!Number.isFinite(n) || n > max || n < -max) return null;
  return n;
}
function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// ── 4. Iniciar ingest_run ───────────────────────────────────────────
async function rpc(path, init) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok && res.status !== 200 && res.status !== 201 && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  return res;
}

async function startIngestRun() {
  const res = await fetch(`${URL}/rest/v1/diag_ingest_runs`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      fonte: 'censo',
      escopo: { source: 'cli', script: 'import-censo.mjs' },
      arquivo_origem: inputAbs.split(/[\\/]/).pop(),
      status: 'rodando',
    }),
  });
  if (!res.ok) throw new Error(`startIngestRun: ${await res.text()}`);
  const json = await res.json();
  return json[0]?.id;
}

async function finishIngestRun(id, totals, status) {
  await fetch(`${URL}/rest/v1/diag_ingest_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      status,
      total_processado: totals.processado,
      total_sucesso: totals.sucesso,
      total_falha: totals.falha,
      total_skipped: totals.skipped,
      erros: totals.erros.slice(0, 50),
      finalizado_em: new Date().toISOString(),
    }),
  });
}

// ── 5. Stream + parse ───────────────────────────────────────────────
async function main() {
  const runId = await startIngestRun();
  stderr.write(`Run ID: ${runId}\n\n`);

  const rl = createInterface({
    input: createReadStream(inputAbs, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let header = null;
  let sep = ';';
  let idx = {};
  const inIdx = []; // [name, colIdx]
  const qtIdx = [];

  const totals = { processado: 0, sucesso: 0, falha: 0, skipped: 0, erros: [], escolasUpsert: 0 };
  const seen = new Set();
  const escolasSeen = new Set(); // dedup escolas dentro do upload (mesma escola aparece N vezes se múltiplos anos)
  const batchCenso = [];
  const batchEscolas = [];
  const BATCH_SIZE = 200;
  const startedAt = Date.now();
  let lastReport = startedAt;

  async function postBatch(table, conflict, body) {
    return fetch(`${URL}/rest/v1/${table}?on_conflict=${conflict}`, {
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

  async function flushCenso() {
    if (batchCenso.length === 0) return;
    try {
      const res = await postBatch('diag_censo_infra', 'codigo_inep,ano', batchCenso);
      if (!res.ok) {
        const t = await res.text();
        totals.falha += batchCenso.length;
        totals.erros.push({ key: 'censo_batch', msg: t.slice(0, 300) });
      } else {
        totals.sucesso += batchCenso.length;
      }
    } catch (err) {
      totals.falha += batchCenso.length;
      totals.erros.push({ key: 'censo_throw', msg: err.message });
    }
    batchCenso.length = 0;
  }

  async function flushEscolas() {
    if (batchEscolas.length === 0) return;
    try {
      const res = await postBatch('diag_escolas', 'codigo_inep', batchEscolas);
      if (res.ok) {
        totals.escolasUpsert += batchEscolas.length;
      } else {
        const t = await res.text();
        totals.erros.push({ key: 'escolas_batch', msg: t.slice(0, 300) });
      }
    } catch (err) {
      totals.erros.push({ key: 'escolas_throw', msg: err.message });
    }
    batchEscolas.length = 0;
  }

  for await (const line of rl) {
    if (!header) {
      sep = line.split(';').length > line.split(',').length ? ';' : ',';
      header = splitCsvLine(line, sep).map((h) => h.trim());
      idx.INEP = header.indexOf('CO_ENTIDADE');
      idx.NOME = header.indexOf('NO_ENTIDADE');
      idx.ANO = header.indexOf('NU_ANO_CENSO');
      idx.IBGE = header.indexOf('CO_MUNICIPIO');
      idx.MUNICIPIO_NOME = header.indexOf('NO_MUNICIPIO');
      idx.UF = header.indexOf('SG_UF');
      idx.MICRORREGIAO = header.indexOf('NO_MICRORREGIAO');
      idx.DEP = header.indexOf('TP_DEPENDENCIA');
      idx.LAT = header.indexOf('LATITUDE');
      idx.LNG = header.indexOf('LONGITUDE');
      idx.LOC = header.indexOf('TP_LOCALIZACAO');
      idx.LOC_DIF = header.indexOf('TP_LOCALIZACAO_DIFERENCIADA');
      idx.SIT = header.indexOf('TP_SITUACAO_FUNCIONAMENTO');
      idx.END = header.indexOf('DS_ENDERECO');
      idx.BAIRRO = header.indexOf('NO_BAIRRO');
      idx.CEP = header.indexOf('CO_CEP');
      for (let i = 0; i < header.length; i++) {
        if (header[i].startsWith('IN_')) inIdx.push([header[i], i]);
        else if (header[i].startsWith('QT_')) qtIdx.push([header[i], i]);
      }
      stderr.write(`Header: separador="${sep}" · ${header.length} colunas · ${inIdx.length} IN_* · ${qtIdx.length} QT_*\n\n`);
      if (idx.INEP < 0 || idx.ANO < 0 || idx.IBGE < 0) {
        stderr.write('ERRO: colunas obrigatórias ausentes (CO_ENTIDADE/NU_ANO_CENSO/CO_MUNICIPIO)\n');
        exit(2);
      }
      continue;
    }

    if (LIMIT && totals.processado >= LIMIT) break;
    totals.processado++;

    const cells = splitCsvLine(line, sep);
    const codigoInep = String(cells[idx.INEP] || '').trim();
    const ano = ANO_FORCE || Number(cells[idx.ANO]);
    if (!codigoInep || codigoInep.length !== 8 || !Number.isFinite(ano)) {
      totals.skipped++;
      continue;
    }
    const ibge = String(cells[idx.IBGE] || '').trim().padStart(7, '0');
    const key = `${codigoInep}_${ano}`;
    if (seen.has(key)) { totals.skipped++; continue; }
    seen.add(key);

    const indicadores = {};
    for (const [name, i] of inIdx) {
      const raw = cells[i];
      if (raw == null || raw === '') continue;
      const v = Number(raw);
      if (Number.isFinite(v)) indicadores[name] = v ? 1 : 0;
    }
    const quantidades = {};
    for (const [name, i] of qtIdx) {
      const v = toNum(cells[i]);
      if (v != null) quantidades[name] = v;
    }
    const scores = calcularScores(indicadores);

    batchCenso.push({
      codigo_inep: codigoInep,
      ano,
      situacao_funcionamento: parseSituacao(cells[idx.SIT]),
      zona_localizacao: parseLocalizacao(cells[idx.LOC]),
      zona_diferenciada: cells[idx.LOC_DIF] || null,
      latitude: idx.LAT >= 0 ? clamp(cells[idx.LAT], 90) : null,
      longitude: idx.LNG >= 0 ? clamp(cells[idx.LNG], 180) : null,
      endereco: idx.END >= 0 ? (cells[idx.END] || null) : null,
      bairro: idx.BAIRRO >= 0 ? (cells[idx.BAIRRO] || null) : null,
      cep: idx.CEP >= 0 ? (cells[idx.CEP] || null) : null,
      indicadores,
      quantidades,
      score_basica: scores.basica,
      score_pedagogica: scores.pedagogica,
      score_acessibilidade: scores.acessibilidade,
      score_conectividade: scores.conectividade,
      ingest_run_id: runId,
      atualizado_em: new Date().toISOString(),
    });

    // Upsert em diag_escolas — uma vez por INEP nesta sessão
    if (!escolasSeen.has(codigoInep)) {
      escolasSeen.add(codigoInep);
      const nome = idx.NOME >= 0 ? String(cells[idx.NOME] || '').trim() : '';
      const municipio = idx.MUNICIPIO_NOME >= 0 ? String(cells[idx.MUNICIPIO_NOME] || '').trim() : '';
      const uf = idx.UF >= 0 ? String(cells[idx.UF] || '').trim().toUpperCase() : '';
      batchEscolas.push({
        codigo_inep: codigoInep,
        nome: nome || codigoInep,
        rede: parseRede(cells[idx.DEP]),
        municipio: municipio || null,
        municipio_ibge: ibge || null,
        uf: uf || null,
        microrregiao: idx.MICRORREGIAO >= 0 ? (String(cells[idx.MICRORREGIAO] || '').trim() || null) : null,
        zona: parseLocalizacao(cells[idx.LOC]),
        ano_referencia: ano,
        atualizado_em: new Date().toISOString(),
      });
    }

    if (batchCenso.length >= BATCH_SIZE) await flushCenso();
    if (batchEscolas.length >= BATCH_SIZE) await flushEscolas();

    const now = Date.now();
    if (now - lastReport > 2000) {
      const elapsed = (now - startedAt) / 1000;
      const rate = totals.processado / elapsed;
      stderr.write(`  ${totals.processado.toLocaleString('pt-BR')} linhas · ${totals.sucesso.toLocaleString('pt-BR')} ok · ${totals.skipped.toLocaleString('pt-BR')} skip · ${rate.toFixed(0)} linhas/s\n`);
      lastReport = now;
    }
  }

  await flushCenso();
  await flushEscolas();

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const status = totals.falha > 0 && totals.sucesso > 0 ? 'parcial' : totals.falha > 0 ? 'erro' : 'sucesso';
  await finishIngestRun(runId, totals, status);

  // Refresh das materialized views (cards do admin/home + rankings UF)
  try {
    const refresh = await fetch(`${URL}/rest/v1/rpc/refresh_diag_mvs`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    stderr.write(`Refresh MVs: ${refresh.ok ? '✓' : 'falhou'}\n`);
  } catch {}

  stdout.write(`\n✓ Concluído em ${elapsed}s\n`);
  stdout.write(`  Processado: ${totals.processado.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Sucesso:    ${totals.sucesso.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Falha:      ${totals.falha.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Skipped:    ${totals.skipped.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Escolas upsert: ${totals.escolasUpsert.toLocaleString('pt-BR')}\n`);
  stdout.write(`  Status:     ${status}\n`);
  stdout.write(`  Run ID:     ${runId}\n`);
  if (totals.erros.length > 0) {
    stdout.write(`\n  Primeiros erros:\n`);
    for (const e of totals.erros.slice(0, 3)) stdout.write(`    ↳ ${e.key}: ${e.msg}\n`);
  }
}

main().catch((err) => {
  stderr.write(`\nFATAL: ${err?.stack || err}\n`);
  exit(3);
});
