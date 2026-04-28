#!/usr/bin/env node
/**
 * Importa Ideb a partir de CSV/XLSX baixado do Inep.
 *
 * Uso:
 *   node scripts/import-ideb.mjs "C:/dados/ideb_escolas_2023.xlsx" --etapa 5_EF --uf BA --ano 2023 --dry
 *   node scripts/import-ideb.mjs "C:/dados/ideb_escolas_2023.xlsx" --etapa 5_EF --uf BA --ano 2023
 *   node scripts/import-ideb.mjs "C:/dados/ideb_escolas_2023.xlsx" --etapa 5_EF --years 2019,2021,2023
 *
 * Etapas:
 *   5_EF  anos iniciais do fundamental
 *   9_EF  anos finais do fundamental
 *   3_EM  ensino médio
 */

import { readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const inputPath = args.find((arg) => !arg.startsWith('--'));
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const UF = flag('--uf');
const ANO = flag('--ano') ? Number(flag('--ano')) : null;
const YEARS = parseYears(flag('--years'));
const ETAPA = normalizeEtapa(flag('--etapa') || inferEtapaFromName(inputPath || ''));
const LIMIT = Number(flag('--limit', '0'));
const BATCH_SIZE = Math.max(1, Number(flag('--batch-size', '500')));
const DRY = has('--dry');

if (!inputPath) {
  console.error('ERRO: informe o arquivo CSV/XLSX do Ideb.');
  process.exit(1);
}
if (!ETAPA) {
  console.error('ERRO: informe --etapa 5_EF, --etapa 9_EF ou --etapa 3_EM.');
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

const result = { totalProcessado: 0, totalFiltrado: 0, totalSucesso: 0, totalFalha: 0, totalSkipped: 0, erros: [] };
const startedAt = Date.now();
let batch = [];
let printedSamples = 0;

console.log(DRY ? '== DRY RUN IDEB ==' : '== IMPORT IDEB ==');
console.log(`arquivo: ${inputPath}`);
console.log(`etapa: ${ETAPA}`);
if (UF) console.log(`uf: ${UF.toUpperCase()}`);
if (ANO) console.log(`ano: ${ANO}`);
if (YEARS) console.log(`anos: ${Array.from(YEARS).sort().join(',')}`);
if (LIMIT > 0) console.log(`limit: ${LIMIT}`);
console.log('');

const rows = await readRows(inputPath);
for (const sourceRow of rows) {
  result.totalProcessado++;
  const normalized = normalizeSourceRow(sourceRow);
  if (!normalized) {
    addSkip('linha', 'sem identificador de escopo');
    continue;
  }
  if (UF && normalized.uf !== UF.toUpperCase()) continue;

  const snapshots = snapshotsFromRow(normalized, sourceRow);
  for (const snapshot of snapshots) {
    if (ANO && snapshot.ano !== ANO) continue;
    if (YEARS && !YEARS.has(snapshot.ano)) continue;
    result.totalFiltrado++;
    if (DRY && printedSamples < 3) {
      console.log(JSON.stringify(snapshot, null, 2));
      printedSamples++;
    }
    batch.push(snapshot);
    if (batch.length >= BATCH_SIZE) await flush();
    if (LIMIT > 0 && result.totalFiltrado >= LIMIT) break;
  }
  if (LIMIT > 0 && result.totalFiltrado >= LIMIT) break;
}
await flush();

const durationMs = Date.now() - startedAt;
console.log('');
console.log(`concluído em ${(durationMs / 1000).toFixed(1)}s`);
console.log(`linhas lidas: ${result.totalProcessado}`);
console.log(`snapshots no escopo: ${result.totalFiltrado}`);
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
  const { error } = await sb.from('diag_ideb_snapshots').upsert(rows, {
    onConflict: 'chave',
  });
  if (error) {
    result.totalFalha += rows.length;
    addError('batch', error.message);
  } else {
    result.totalSucesso += rows.length;
  }
}

async function readRows(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') return readExcelRows(filePath);
  return readDelimitedRows(filePath);
}

async function readExcelRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const out = [];
  for (const worksheet of workbook.worksheets) {
    const matrix = [];
    worksheet.eachRow((row) => {
      matrix.push(row.values.slice(1).map(cellText));
    });
    out.push(...objectsFromMatrix(matrix));
  }
  return out;
}

function readDelimitedRows(filePath) {
  const text = readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sep = detectSeparator(lines[0] || '');
  const matrix = lines.map((line) => splitCsvLine(line, sep));
  return objectsFromMatrix(matrix);
}

function objectsFromMatrix(matrix) {
  const headerIndex = findHeaderIndex(matrix);
  if (headerIndex < 0) {
    throw new Error('Não encontrei cabeçalho reconhecível no arquivo.');
  }
  const header = matrix[headerIndex].map(normalizeHeader);
  const out = [];
  for (const row of matrix.slice(headerIndex + 1)) {
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      if (!header[i]) continue;
      obj[header[i]] = row[i] ?? '';
    }
    if (Object.values(obj).some((v) => String(v || '').trim())) out.push(obj);
  }
  return out;
}

function findHeaderIndex(matrix) {
  let bestIndex = -1;
  let bestScore = 0;
  for (let i = 0; i < matrix.length; i++) {
    const score = headerScore(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 4 ? bestIndex : -1;
}

function headerScore(row) {
  const normalized = row.map(normalizeHeader);
  const set = new Set(normalized);
  let score = 0;
  if (set.has('SG_UF')) score += 2;
  if (set.has('CO_MUNICIPIO')) score += 2;
  if (set.has('ID_ESCOLA') || set.has('CO_ENTIDADE')) score += 2;
  if (set.has('REDE')) score += 1;
  if (normalized.some((h) => /^VL_OBSERVADO_\d{4}$/.test(h))) score += 3;
  if (normalized.some((h) => /^VL_INDICADOR_REND_\d{4}$/.test(h))) score += 2;
  if (normalized.some((h) => /^VL_NOTA_MEDIA_\d{4}$/.test(h))) score += 2;
  if (normalized.some((h) => /^VL_PROJECAO_\d{4}$/.test(h))) score += 1;
  return score;
}

function looksLikeHeader(row) {
  const normalized = row.map(normalizeHeader);
  const joined = normalized.join('|');
  const hasId = /CO_ENTIDADE|ID_ESCOLA|COD_ESCOLA|CO_MUNICIPIO|SG_UF|UF/.test(joined);
  const hasMetric = /IDEB|OBSERVADO|PROJECAO|META|RENDIMENTO|PADRONIZADA/.test(joined);
  return hasId && hasMetric;
}

function normalizeSourceRow(row) {
  const codigoInep = pick(row, ['CO_ENTIDADE', 'ID_ESCOLA', 'COD_ESCOLA', 'CO_ESCOLA', 'CODIGO_ESCOLA']);
  const municipioIbge = pick(row, ['CO_MUNICIPIO', 'COD_MUNICIPIO', 'CODIGO_MUNICIPIO', 'ID_MUNICIPIO']);
  const uf = String(pick(row, ['SG_UF', 'UF']) || '').trim().toUpperCase();
  const rede = normalizeRede(pick(row, ['REDE', 'TP_REDE', 'TP_DEPENDENCIA', 'DEPENDENCIA_ADMINISTRATIVA']));

  if (codigoInep && /^\d{8}$/.test(cleanCode(codigoInep))) {
    return {
      escopo: 'escola',
      codigo_inep: cleanCode(codigoInep),
      municipio_ibge: municipioIbge ? cleanCode(municipioIbge).padStart(7, '0') : null,
      uf: uf || null,
      rede,
    };
  }
  if (municipioIbge && cleanCode(municipioIbge)) {
    return {
      escopo: 'municipio',
      codigo_inep: null,
      municipio_ibge: cleanCode(municipioIbge).padStart(7, '0'),
      uf: uf || null,
      rede,
    };
  }
  if (uf) {
    return { escopo: 'uf', codigo_inep: null, municipio_ibge: null, uf, rede };
  }
  return null;
}

function snapshotsFromRow(base, sourceRow) {
  const longYear = parseYear(pick(sourceRow, ['ANO', 'NU_ANO', 'ANO_IDEB']));
  if (longYear) {
    const ideb = parseNumber(pickMetric(sourceRow, ['IDEB', 'VL_IDEB', 'VL_OBSERVADO', 'OBSERVADO']));
    if (ideb == null) return [];
    return [buildSnapshot(base, longYear, ideb, {
      meta: parseNumber(pickMetric(sourceRow, ['META', 'VL_META', 'VL_PROJECAO', 'PROJECAO'])),
      indicador_rendimento: parseNumber(pickMetric(sourceRow, ['INDICADOR_RENDIMENTO', 'VL_INDICADOR_RENDIMENTO', 'RENDIMENTO'])),
      nota_saeb: parseNumber(pickMetric(sourceRow, ['NOTA_SAEB', 'MEDIA_PADRONIZADA', 'NOTA_MEDIA_PADRONIZADA'])),
      sourceRow,
    })];
  }

  const byYear = new Map();
  for (const [header, value] of Object.entries(sourceRow)) {
    const year = parseYear(header);
    if (!year) continue;
    if (!byYear.has(year)) byYear.set(year, {});
    const bucket = byYear.get(year);
    if (isIdebHeader(header)) bucket.ideb = parseNumber(value);
    else if (isMetaHeader(header)) bucket.meta = parseNumber(value);
    else if (isRendimentoHeader(header)) bucket.indicador_rendimento = parseNumber(value);
    else if (isNotaSaebHeader(header)) bucket.nota_saeb = parseNumber(value);
  }

  const out = [];
  for (const [year, metrics] of byYear.entries()) {
    if (metrics.ideb == null) continue;
    out.push(buildSnapshot(base, year, metrics.ideb, { ...metrics, sourceRow }));
  }
  return out;
}

function buildSnapshot(base, ano, ideb, metrics) {
  return {
    chave: makeKey(base, ano),
    escopo: base.escopo,
    codigo_inep: base.codigo_inep,
    municipio_ibge: base.municipio_ibge,
    uf: base.uf,
    rede: base.rede,
    etapa: ETAPA,
    ano,
    ideb,
    meta: metrics.meta ?? null,
    indicador_rendimento: metrics.indicador_rendimento ?? null,
    nota_saeb: metrics.nota_saeb ?? null,
    raw: compactRaw(metrics.sourceRow, ano),
    atualizado_em: new Date().toISOString(),
  };
}

function compactRaw(sourceRow, ano) {
  const raw = {};
  const keepAlways = new Set(['SG_UF', 'CO_MUNICIPIO', 'NO_MUNICIPIO', 'ID_ESCOLA', 'CO_ENTIDADE', 'NO_ESCOLA', 'REDE']);
  const yearPattern = new RegExp(`_${ano}(?:_|$)`);
  for (const [key, value] of Object.entries(sourceRow || {})) {
    if (keepAlways.has(key) || yearPattern.test(key)) raw[key] = value;
  }
  return raw;
}

function makeKey(base, ano) {
  return [
    base.escopo,
    base.codigo_inep || '',
    base.municipio_ibge || '',
    base.uf || '',
    base.rede || '',
    ETAPA,
    ano,
  ].join('|');
}

function isIdebHeader(header) {
  return /(IDEB|OBSERVADO|VL_OBSERVADO|VL_IDEB)/.test(header)
    && !isMetaHeader(header)
    && !isRendimentoHeader(header)
    && !isNotaSaebHeader(header);
}

function isMetaHeader(header) {
  return /(META|PROJECAO|PROJEÇÃO)/.test(header);
}

function isRendimentoHeader(header) {
  return /(INDICADOR_REND|INDICADOR_DE_RENDIMENTO|INDICADOR_P|^P_)/.test(header);
}

function isNotaSaebHeader(header) {
  return /(MEDIA_PADRONIZADA|MÉDIA_PADRONIZADA|NOTA_SAEB|NOTA_MEDIA|INDICADOR_N|^N_)/.test(header);
}

function pick(row, keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    if (row[normalized] != null && String(row[normalized]).trim() !== '') return row[normalized];
  }
  return null;
}

function pickMetric(row, keys) {
  for (const [header, value] of Object.entries(row)) {
    if (keys.some((key) => header === normalizeHeader(key) || header.includes(normalizeHeader(key)))) {
      if (String(value ?? '').trim() !== '') return value;
    }
  }
  return null;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseYear(value) {
  const match = String(value ?? '').match(/(20\d{2}|19\d{2})/);
  return match ? Number(match[1]) : null;
}

function parseNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '-' || raw === '--' || raw.toUpperCase() === 'ND') return null;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizeEtapa(value) {
  const text = normalizeHeader(value);
  if (!text) return null;
  if (['5_EF', '5EF', 'AI', 'ANOS_INICIAIS', 'FUNDAMENTAL_INICIAIS'].includes(text)) return '5_EF';
  if (['9_EF', '9EF', 'AF', 'ANOS_FINAIS', 'FUNDAMENTAL_FINAIS'].includes(text)) return '9_EF';
  if (['3_EM', '3EM', 'EM', 'ENSINO_MEDIO'].includes(text)) return '3_EM';
  return value;
}

function parseYears(value) {
  if (!value) return null;
  const years = String(value)
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2100);
  return years.length ? new Set(years) : null;
}

function inferEtapaFromName(filePath) {
  const name = normalizeHeader(basename(filePath));
  if (/INICIAIS|5_ANO|5ANO/.test(name)) return '5_EF';
  if (/FINAIS|9_ANO|9ANO/.test(name)) return '9_EF';
  if (/MEDIO|ENSINO_MEDIO|3_SERIE|3SERIE/.test(name)) return '3_EM';
  return null;
}

function normalizeRede(value) {
  const s = normalizeHeader(value);
  if (!s) return null;
  if (s === '1' || s.includes('FEDERAL')) return 'FEDERAL';
  if (s === '2' || s.includes('ESTADUAL')) return 'ESTADUAL';
  if (s === '3' || s.includes('MUNICIPAL')) return 'MUNICIPAL';
  if (s === '4' || s.includes('PRIVADA') || s.includes('PARTICULAR')) return 'PRIVADA';
  if (s.includes('PUBLICA')) return 'PUBLICA';
  return s;
}

function cleanCode(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function cellText(cell) {
  if (cell == null) return '';
  if (typeof cell === 'object') {
    if ('result' in cell) return cellText(cell.result);
    if ('text' in cell) return cellText(cell.text);
    if ('richText' in cell) return cell.richText.map((r) => r.text || '').join('');
  }
  return String(cell).trim();
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

function addSkip(key, msg) {
  result.totalSkipped++;
  if (result.erros.length < 200) result.erros.push({ key: String(key), msg: String(msg) });
}

function addError(key, msg) {
  if (result.erros.length < 200) result.erros.push({ key: String(key), msg: String(msg) });
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
