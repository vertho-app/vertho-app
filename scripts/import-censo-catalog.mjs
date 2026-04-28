#!/usr/bin/env node
/**
 * Importa o cadastro base de escolas a partir da Tabela_Escola_*.csv do Censo Escolar.
 *
 * Uso:
 *   node scripts/import-censo-catalog.mjs "C:/dados/Tabela_Escola_2023.csv" --uf BA --limit 100 --dry
 *   node scripts/import-censo-catalog.mjs "C:/dados/Tabela_Escola_2023.csv" --uf BA
 *   node scripts/import-censo-catalog.mjs "C:/dados/Tabela_Escola_2023.csv" --all
 *
 * Depois:
 *   node scripts/import-saeb-api.mjs --ano 2023 --uf BA --concurrency 8
 */

import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith('--'));
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const UF = flag('--uf');
const LIMIT = Number(flag('--limit', '0'));
const DRY = has('--dry');
const ALL = has('--all');
const BATCH_SIZE = Math.max(1, Number(flag('--batch-size', '500')));

if (!inputPath) {
  console.error('ERRO: informe o caminho do CSV. Ex: node scripts/import-censo-catalog.mjs "C:/dados/Tabela_Escola_2023.csv" --uf BA');
  process.exit(1);
}
if (!UF && !ALL) {
  console.error('ERRO: informe --uf BA ou --all');
  process.exit(1);
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local ou env).');
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const startedAt = Date.now();
const result = { totalProcessado: 0, totalFiltrado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [] };
let batch = [];
let header = null;
let sep = ';';
let idx = null;
let nextProgressAt = 5000;

console.log(DRY ? '== DRY RUN CENSO CATALOG ==' : '== IMPORT CENSO CATALOG ==');
console.log(`arquivo: ${inputPath}`);
console.log(`escopo: ${ALL ? 'Brasil inteiro' : `UF ${UF.toUpperCase()}`}`);
console.log(`batch: ${BATCH_SIZE}`);
if (LIMIT > 0) console.log(`limit: ${LIMIT}`);
console.log('');

const rl = createInterface({
  input: createReadStream(inputPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const rawLine of rl) {
  const line = rawLine.replace(/\r$/, '');
  if (!header) {
    header = splitCsvLine(line, detectSeparator(line)).map((h) => h.trim());
    sep = detectSeparator(line);
    idx = buildIndex(header);
    validateHeader(idx);
    continue;
  }

  if (!line) continue;
  result.totalProcessado++;
  const cells = splitCsvLine(line, sep);
  const row = normalizeRow(cells, idx);

  if (!row.codigo_inep) {
    addSkip('linha', 'CO_ENTIDADE vazio');
    continue;
  }
  if (!/^\d{8}$/.test(row.codigo_inep)) {
    addSkip(row.codigo_inep, `CO_ENTIDADE inválido: ${row.codigo_inep}`);
    continue;
  }
  if (UF && row.uf !== UF.toUpperCase()) {
    continue;
  }

  result.totalFiltrado++;
  if (DRY && result.totalFiltrado <= 3) {
    console.log(JSON.stringify(row, null, 2));
  }

  batch.push(row);
  if (batch.length >= BATCH_SIZE) await flush();
  logProgress();

  if (LIMIT > 0 && result.totalFiltrado >= LIMIT) break;
}

await flush();

const durationMs = Date.now() - startedAt;
console.log('');
console.log(`concluído em ${(durationMs / 1000).toFixed(1)}s`);
console.log(`linhas lidas: ${result.totalProcessado}`);
console.log(`escolas no escopo: ${result.totalFiltrado}`);
console.log(`ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped}`);
if (result.erros.length) {
  console.log('\nprimeiros avisos/erros:');
  for (const e of result.erros.slice(0, 10)) console.log(`- ${e.key}: ${e.msg}`);
}

async function flush() {
  if (!batch.length) return;
  const rows = batch;
  batch = [];

  if (DRY) {
    result.totalSucesso += rows.length;
    return;
  }

  const { error } = await sb.from('diag_escolas')
    .upsert(rows, { onConflict: 'codigo_inep' });
  if (error) {
    result.totalFalha += rows.length;
    addError('batch', error.message);
  } else {
    result.totalSucesso += rows.length;
  }
}

function normalizeRow(cells, i) {
  const ano = num(cells[i.ano]);
  const codigoInep = text(cells[i.inep]);
  const municipioIbge = text(cells[i.municipioIbge]).padStart(7, '0');
  const uf = text(cells[i.uf]).toUpperCase();

  return {
    codigo_inep: codigoInep,
    nome: text(cells[i.nome]) || codigoInep,
    rede: normalizeRede(cells[i.rede]),
    municipio: i.municipio >= 0 ? text(cells[i.municipio]) : null,
    municipio_ibge: municipioIbge || null,
    uf: uf || null,
    zona: normalizeZona(cells[i.zona]),
    status: normalizeSituacao(cells[i.situacao]),
    ano_referencia: Number.isFinite(ano) ? ano : null,
    atualizado_em: new Date().toISOString(),
  };
}

function buildIndex(h) {
  const at = (...names) => names.map((name) => h.indexOf(name)).find((pos) => pos >= 0) ?? -1;
  return {
    ano: at('NU_ANO_CENSO'),
    inep: at('CO_ENTIDADE'),
    nome: at('NO_ENTIDADE'),
    municipio: at('NO_MUNICIPIO'),
    municipioIbge: at('CO_MUNICIPIO'),
    uf: at('SG_UF'),
    rede: at('TP_DEPENDENCIA', 'TP_DEPENDENCIA_ADMINISTRATIVA'),
    zona: at('TP_LOCALIZACAO'),
    situacao: at('TP_SITUACAO_FUNCIONAMENTO'),
  };
}

function validateHeader(i) {
  const missing = [];
  if (i.ano < 0) missing.push('NU_ANO_CENSO');
  if (i.inep < 0) missing.push('CO_ENTIDADE');
  if (i.nome < 0) missing.push('NO_ENTIDADE');
  if (i.municipioIbge < 0) missing.push('CO_MUNICIPIO');
  if (i.uf < 0) missing.push('SG_UF');
  if (missing.length) {
    console.error(`ERRO: colunas ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function normalizeRede(value) {
  const s = text(value);
  if (s === '1') return 'FEDERAL';
  if (s === '2') return 'ESTADUAL';
  if (s === '3') return 'MUNICIPAL';
  if (s === '4') return 'PRIVADA';
  return s || null;
}

function normalizeZona(value) {
  const s = text(value);
  if (s === '1') return 'URBANA';
  if (s === '2') return 'RURAL';
  return s || null;
}

function normalizeSituacao(value) {
  const s = text(value);
  if (s === '1') return 'ativa';
  if (s === '2') return 'paralisada';
  if (s === '3') return 'extinta';
  if (s === '4') return 'transferida';
  return 'ativa';
}

function detectSeparator(line) {
  return line.split(';').length >= line.split(',').length ? ';' : ',';
}

function splitCsvLine(line, separator) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (c === separator && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function text(value) {
  return String(value ?? '').trim();
}

function num(value) {
  const n = Number(text(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function addSkip(key, msg) {
  result.totalSkipped++;
  if (result.erros.length < 200) result.erros.push({ key: String(key), msg: String(msg) });
}

function addError(key, msg) {
  if (result.erros.length < 200) result.erros.push({ key: String(key), msg: String(msg) });
}

function logProgress() {
  if (result.totalProcessado < nextProgressAt) return;
  console.log(`lidas:${result.totalProcessado} escopo:${result.totalFiltrado} ok:${result.totalSucesso} falha:${result.totalFalha}`);
  nextProgressAt = result.totalProcessado + 5000;
}

function loadEnv() {
  const envPath = new URL('../.env.local', import.meta.url);
  const env = {};
  try {
    Object.assign(env, Object.fromEntries(
      readFileSync(envPath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, '')];
        }),
    ));
  } catch {}
  return {
    ...env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
