#!/usr/bin/env node
/**
 * Importa docentes do Censo Escolar a partir de Tabela_Docente_YYYY.csv.
 *
 * Uso:
 *   node scripts/import-censo-docentes.mjs "C:/dados/Tabela_Docente_2025.csv" --ano 2025 --dry
 *   node scripts/import-censo-docentes.mjs "C:/dados/Tabela_Docente_2025.csv" --ano 2025
 *   node scripts/import-censo-docentes.mjs "C:/dados/Tabela_Docente_2025.csv" --ano 2025 --uf RJ
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const inputArg = args.find((arg) => !arg.startsWith('--'));
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const ANO = Number(flag('--ano', '2025'));
const UF = flag('--uf');
const MUNICIPIO_IBGE = flag('--municipio-ibge');
const LIMIT_ROWS = Math.max(0, Number(flag('--limit-rows', '0')));
const DB_BATCH_SIZE = Math.max(1, Number(flag('--db-batch-size', '500')));
const DRY = has('--dry');
const NO_RUN = has('--no-run');

if (!inputArg) {
  console.error('ERRO: informe o arquivo Tabela_Docente_YYYY.csv');
  process.exit(1);
}
if (!Number.isFinite(ANO)) {
  console.error('ERRO: informe --ano 2025');
  process.exit(1);
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
if (!existsSync(inputPath)) {
  console.error(`ERRO: arquivo não encontrado: ${inputPath}`);
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(DRY ? '== DRY RUN CENSO DOCENTES ==' : '== IMPORT CENSO DOCENTES ==');
console.log(`ano: ${ANO}`);
console.log(`arquivo: ${inputPath}`);
console.log(`tamanho: ${(statSync(inputPath).size / (1024 * 1024)).toFixed(1)} MB`);
if (UF) console.log(`uf: ${UF}`);
if (MUNICIPIO_IBGE) console.log(`municipio_ibge: ${MUNICIPIO_IBGE}`);
if (LIMIT_ROWS) console.log(`limit-rows: ${LIMIT_ROWS}`);
console.log(`batch DB: ${DB_BATCH_SIZE}`);
console.log('');

const scopeCodes = await loadScopeCodes();

let runId = null;
if (!DRY && !NO_RUN) {
  const { data, error } = await sb.from('diag_ingest_runs')
    .insert({
      fonte: 'censo_docentes',
      escopo: { ano: ANO, arquivo: path.basename(inputPath), uf: UF || null, municipio_ibge: MUNICIPIO_IBGE || null },
      status: 'rodando',
      arquivo_origem: inputPath,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('Falha ao criar diag_ingest_runs:', error?.message || error);
    process.exit(1);
  }
  runId = data.id;
}

const result = {
  totalProcessado: 0,
  totalSucesso: 0,
  totalFalha: 0,
  totalSkipped: 0,
  erros: [],
};

const startedAt = Date.now();
const rows = [];
await processDocentesCsv(inputPath, (row) => {
  result.totalProcessado++;
  if (LIMIT_ROWS && result.totalProcessado > LIMIT_ROWS) return false;

  const codigoInep = normalizeSchoolCode(row.CO_ENTIDADE);
  if (!codigoInep || (scopeCodes && !scopeCodes.has(codigoInep))) {
    result.totalSkipped++;
    return true;
  }
  rows.push(normalizeDocenteRow(row, codigoInep, ANO, runId));
  return true;
});

if (DRY) {
  console.log(JSON.stringify(rows.slice(0, 5), null, 2));
  console.log('');
  console.log(`linhas lidas: ${result.totalProcessado}`);
  console.log(`escolas agregadas: ${rows.length}`);
  console.log(`skip: ${result.totalSkipped}`);
  process.exit(0);
}

for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
  const batch = rows.slice(i, i + DB_BATCH_SIZE);
  const { error } = await sb.from('diag_censo_docentes')
    .upsert(batch, { onConflict: 'codigo_inep,ano' });
  if (error) {
    result.totalFalha += batch.length;
    pushError(`batch_${i}`, error.message);
  } else {
    result.totalSucesso += batch.length;
  }
}

const durationMs = Date.now() - startedAt;
const status = result.totalFalha > 0 && result.totalSucesso > 0
  ? 'parcial'
  : result.totalFalha > 0
    ? 'erro'
    : 'sucesso';

if (!DRY && runId) {
  await sb.from('diag_ingest_runs')
    .update({
      status,
      total_processado: result.totalProcessado,
      total_sucesso: result.totalSucesso,
      total_falha: result.totalFalha,
      total_skipped: result.totalSkipped,
      erros: result.erros.slice(0, 50),
      finalizado_em: new Date().toISOString(),
      duracao_ms: durationMs,
    })
    .eq('id', runId);
}

console.log('');
console.log(`concluído em ${(durationMs / 1000).toFixed(1)}s - status:${status} escolas:${rows.length} ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped}`);
if (runId) console.log(`runId: ${runId}`);
if (result.erros.length) {
  console.log('\nprimeiros erros:');
  for (const e of result.erros.slice(0, 10)) console.log(`- ${e.key}: ${e.msg}`);
}

async function loadScopeCodes() {
  if (!UF && !MUNICIPIO_IBGE) return null;
  const out = new Set();
  for (let from = 0; ; from += 1000) {
    let q = sb.from('diag_escolas').select('codigo_inep').range(from, from + 999);
    if (UF) q = q.eq('uf', UF);
    if (MUNICIPIO_IBGE) q = q.eq('municipio_ibge', MUNICIPIO_IBGE);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data || []) out.add(row.codigo_inep);
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function processDocentesCsv(filePath, onRow) {
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  let header = null;
  for await (const line of rl) {
    if (!header) {
      header = splitCsvLine(line, ';').map((h) => h.trim());
      continue;
    }
    const cells = splitCsvLine(line, ';');
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? '';
    const keepGoing = onRow(row);
    if (keepGoing === false) break;
    if (result.totalProcessado % 20000 === 0) {
      console.log(`linhas:${result.totalProcessado} escolas:${rows.length} skip:${result.totalSkipped}`);
    }
  }
}

function normalizeDocenteRow(row, codigoInep, ano, ingestRunId) {
  const quantidades = {};
  const disciplinas = {};
  const especializacoes = {};
  for (const [key, raw] of Object.entries(row)) {
    if (!key.startsWith('QT_DOC_')) continue;
    const value = sanitizeQuantidadeDocente(toInt(raw));
    if (value == null) continue;
    quantidades[key] = value;
    if (key.startsWith('QT_DOC_BAS_DISC_')) disciplinas[key] = value;
    if (key.startsWith('QT_DOC_BAS_ESPEC_')) especializacoes[key] = value;
  }

  return {
    codigo_inep: codigoInep,
    ano,
    qt_doc_bas: quantidades.QT_DOC_BAS ?? null,
    qt_doc_inf: quantidades.QT_DOC_INF ?? null,
    qt_doc_inf_cre: quantidades.QT_DOC_INF_CRE ?? null,
    qt_doc_inf_pre: quantidades.QT_DOC_INF_PRE ?? null,
    qt_doc_fund: quantidades.QT_DOC_FUND ?? null,
    qt_doc_fund_ai: quantidades.QT_DOC_FUND_AI ?? null,
    qt_doc_fund_af: quantidades.QT_DOC_FUND_AF ?? null,
    qt_doc_med: quantidades.QT_DOC_MED ?? null,
    qt_doc_bas_docente: quantidades.QT_DOC_BAS_DOCENTE ?? null,
    qt_doc_bas_auxiliar: quantidades.QT_DOC_BAS_AUXILIAR ?? null,
    qt_doc_bas_profi_monitor: quantidades.QT_DOC_BAS_PROFI_MONITOR ?? null,
    qt_doc_bas_esco_sup_grad: quantidades.QT_DOC_BAS_ESCO_SUP_GRAD ?? null,
    qt_doc_bas_esco_sup_grad_licen: quantidades.QT_DOC_BAS_ESCO_SUP_GRAD_LICEN ?? null,
    qt_doc_bas_esco_sup_grad_slicen: quantidades.QT_DOC_BAS_ESCO_SUP_GRAD_SLICEN ?? null,
    qt_doc_bas_esco_sup_pos_espec: quantidades.QT_DOC_BAS_ESCO_SUP_POS_ESPEC ?? null,
    qt_doc_bas_esco_sup_pos_mestra: quantidades.QT_DOC_BAS_ESCO_SUP_POS_MESTRA ?? null,
    qt_doc_bas_esco_sup_pos_douto: quantidades.QT_DOC_BAS_ESCO_SUP_POS_DOUTO ?? null,
    qt_doc_bas_vinculo_concur: quantidades.QT_DOC_BAS_VINCULO_CONCUR ?? null,
    qt_doc_bas_vinculo_contra: quantidades.QT_DOC_BAS_VINCULO_CONTRA ?? null,
    qt_doc_bas_vinculo_terceir: quantidades.QT_DOC_BAS_VINCULO_TERCEIR ?? null,
    qt_doc_bas_vinculo_clt: quantidades.QT_DOC_BAS_VINCULO_CLT ?? null,
    qt_doc_bas_fem: quantidades.QT_DOC_BAS_FEM ?? null,
    qt_doc_bas_masc: quantidades.QT_DOC_BAS_MASC ?? null,
    qt_doc_bas_pcd: quantidades.QT_DOC_BAS_PCD ?? null,
    qt_doc_bas_0_24: quantidades.QT_DOC_BAS_0_24 ?? null,
    qt_doc_bas_25_29: quantidades.QT_DOC_BAS_25_29 ?? null,
    qt_doc_bas_30_39: quantidades.QT_DOC_BAS_30_39 ?? null,
    qt_doc_bas_40_49: quantidades.QT_DOC_BAS_40_49 ?? null,
    qt_doc_bas_50_54: quantidades.QT_DOC_BAS_50_54 ?? null,
    qt_doc_bas_55_59: quantidades.QT_DOC_BAS_55_59 ?? null,
    qt_doc_bas_60_mais: quantidades.QT_DOC_BAS_60_MAIS ?? null,
    disciplinas,
    especializacoes,
    quantidades,
    ingest_run_id: ingestRunId || null,
    atualizado_em: new Date().toISOString(),
  };
}

function splitCsvLine(line, sep = ';') {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (c === sep && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function toInt(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isInteger(n) ? n : null;
}

function sanitizeQuantidadeDocente(value) {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  if ([8888, 88888, 9999, 99999, 999999].includes(value)) return null;
  if (value > 10000) return null;
  return value;
}

function normalizeSchoolCode(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}

function pushError(key, msg) {
  if (result.erros.length < 100) result.erros.push({ key, msg });
}

function loadEnv() {
  const out = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(file, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch {}
  }
  return out;
}
