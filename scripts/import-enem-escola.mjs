#!/usr/bin/env node
/**
 * Importa microdados do ENEM por escola a partir de RESULTADOS_YYYY.csv.
 *
 * Uso:
 *   node scripts/import-enem-escola.mjs "C:/dados/.tmp_enem_2024" --ano 2024 --dry
 *   node scripts/import-enem-escola.mjs "C:/dados/.tmp_enem_2024" --ano 2024
 *   node scripts/import-enem-escola.mjs "C:/dados/RESULTADOS_2024.csv" --ano 2024
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

const ANO = Number(flag('--ano', '2024'));
const LIMIT_ROWS = Math.max(0, Number(flag('--limit-rows', '0')));
const DB_BATCH_SIZE = Math.max(1, Number(flag('--db-batch-size', '500')));
const DRY = has('--dry');
const NO_RUN = has('--no-run');

if (!inputArg) {
  console.error('ERRO: informe a pasta extraida ou o arquivo RESULTADOS_YYYY.csv');
  process.exit(1);
}

if (!Number.isFinite(ANO)) {
  console.error('ERRO: informe --ano 2024');
  process.exit(1);
}

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERRO: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const inputPath = resolveResultadosPath(inputArg, ANO);
if (!inputPath) {
  console.error(`ERRO: nao encontrei RESULTADOS_${ANO}.csv em ${inputArg}`);
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(DRY ? '== DRY RUN ENEM ESCOLA ==' : '== IMPORT ENEM ESCOLA ==');
console.log(`ano: ${ANO}`);
console.log(`arquivo: ${inputPath}`);
console.log(`tamanho: ${(statSync(inputPath).size / (1024 * 1024)).toFixed(1)} MB`);
if (LIMIT_ROWS) console.log(`limit-rows: ${LIMIT_ROWS}`);
console.log(`batch DB: ${DB_BATCH_SIZE}`);
console.log('');

let runId = null;
if (!DRY && !NO_RUN) {
  const { data, error } = await sb.from('diag_ingest_runs')
    .insert({
      fonte: 'enem_escola',
      escopo: { ano: ANO, arquivo: path.basename(inputPath) },
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
const aggregators = new Map();

await processResultadosCsv(inputPath, ANO, LIMIT_ROWS, (row) => {
  result.totalProcessado++;
  const codigoInep = normalizeSchoolCode(row.CO_ESCOLA);
  if (!codigoInep) {
    result.totalSkipped++;
    return;
  }

  let agg = aggregators.get(codigoInep);
  if (!agg) {
    agg = createAggregator(row, codigoInep, ANO, runId);
    aggregators.set(codigoInep, agg);
  }
  applyResultado(agg, row);

  if (result.totalProcessado % 200000 === 0) {
    console.log(`linhas:${result.totalProcessado} escolas:${aggregators.size} skip:${result.totalSkipped}`);
  }
});

const rows = Array.from(aggregators.values()).map(finalizeAggregator);

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
  const { error } = await sb.from('diag_enem_escola_snapshots')
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
console.log(`concluido em ${(durationMs / 1000).toFixed(1)}s - status:${status} escolas:${rows.length} ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped}`);
if (runId) console.log(`runId: ${runId}`);
if (result.erros.length) {
  console.log('\nprimeiros erros:');
  for (const e of result.erros.slice(0, 10)) console.log(`- ${e.key}: ${e.msg}`);
}

function resolveResultadosPath(input, ano) {
  const full = path.resolve(input);
  if (!existsSync(full)) return null;
  const st = statSync(full);
  if (st.isDirectory()) {
    const direct = path.join(full, `RESULTADOS_${ano}.csv`);
    if (existsSync(direct)) return direct;
    const nested = path.join(full, 'DADOS', `RESULTADOS_${ano}.csv`);
    if (existsSync(nested)) return nested;
    return null;
  }
  if (st.isFile() && path.basename(full).toUpperCase() === `RESULTADOS_${ano}.CSV`) return full;
  return null;
}

async function processResultadosCsv(filePath, ano, limitRows, onRow) {
  const stream = createReadStream(filePath, { encoding: 'latin1' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = line.replace(/^\uFEFF/, '').split(';');
      continue;
    }
    const cells = line.split(';');
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? '';
    if (Number(row.NU_ANO || ano) !== ano) continue;
    onRow(row);
    if (limitRows > 0 && result.totalProcessado >= limitRows) break;
  }
}

function createAggregator(row, codigoInep, ano, ingestRunId) {
  return {
    codigo_inep: codigoInep,
    ano,
    municipio_ibge: normalizeText(row.CO_MUNICIPIO_ESC),
    municipio: normalizeText(row.NO_MUNICIPIO_ESC),
    uf: normalizeText(row.SG_UF_ESC),
    dependencia_adm_code: toInt(row.TP_DEPENDENCIA_ADM_ESC),
    dependencia_adm: mapDependencia(row.TP_DEPENDENCIA_ADM_ESC),
    localizacao_code: toInt(row.TP_LOCALIZACAO_ESC),
    localizacao: mapLocalizacao(row.TP_LOCALIZACAO_ESC),
    situacao_funcionamento_code: toInt(row.TP_SIT_FUNC_ESC),
    participantes_total: 0,
    participantes_com_objetiva: 0,
    participantes_com_redacao: 0,
    participantes_com_media_geral: 0,
    sums: {
      cn: 0, ch: 0, lc: 0, mt: 0, red: 0, obj: 0, geral: 0,
    },
    counts: {
      cn: 0, ch: 0, lc: 0, mt: 0, red: 0, obj: 0, geral: 0,
    },
    presenca_dist: { cn: {}, ch: {}, lc: {}, mt: {} },
    status_redacao_dist: {},
    ingest_run_id: ingestRunId,
    atualizado_em: new Date().toISOString(),
  };
}

function applyResultado(agg, row) {
  agg.participantes_total++;

  incrementNestedCounter(agg.presenca_dist.cn, normalizeText(row.TP_PRESENCA_CN) || 'null');
  incrementNestedCounter(agg.presenca_dist.ch, normalizeText(row.TP_PRESENCA_CH) || 'null');
  incrementNestedCounter(agg.presenca_dist.lc, normalizeText(row.TP_PRESENCA_LC) || 'null');
  incrementNestedCounter(agg.presenca_dist.mt, normalizeText(row.TP_PRESENCA_MT) || 'null');
  incrementNestedCounter(agg.status_redacao_dist, normalizeText(row.TP_STATUS_REDACAO) || 'null');

  const cn = toNum(row.NU_NOTA_CN);
  const ch = toNum(row.NU_NOTA_CH);
  const lc = toNum(row.NU_NOTA_LC);
  const mt = toNum(row.NU_NOTA_MT);
  const red = toNum(row.NU_NOTA_REDACAO);

  addMeanComponent(agg, 'cn', cn);
  addMeanComponent(agg, 'ch', ch);
  addMeanComponent(agg, 'lc', lc);
  addMeanComponent(agg, 'mt', mt);
  addMeanComponent(agg, 'red', red);

  if ([cn, ch, lc, mt].every((v) => v != null)) {
    agg.participantes_com_objetiva++;
    const avgObj = (cn + ch + lc + mt) / 4;
    addMeanComponent(agg, 'obj', avgObj);
  }

  if (red != null) agg.participantes_com_redacao++;

  if ([cn, ch, lc, mt, red].every((v) => v != null)) {
    agg.participantes_com_media_geral++;
    const avgGeral = (cn + ch + lc + mt + red) / 5;
    addMeanComponent(agg, 'geral', avgGeral);
  }
}

function finalizeAggregator(agg) {
  return {
    codigo_inep: agg.codigo_inep,
    ano: agg.ano,
    municipio_ibge: agg.municipio_ibge,
    municipio: agg.municipio,
    uf: agg.uf,
    dependencia_adm_code: agg.dependencia_adm_code,
    dependencia_adm: agg.dependencia_adm,
    localizacao_code: agg.localizacao_code,
    localizacao: agg.localizacao,
    situacao_funcionamento_code: agg.situacao_funcionamento_code,
    participantes_total: agg.participantes_total,
    participantes_com_objetiva: agg.participantes_com_objetiva,
    participantes_com_redacao: agg.participantes_com_redacao,
    participantes_com_media_geral: agg.participantes_com_media_geral,
    media_cn: avgOrNull(agg.sums.cn, agg.counts.cn),
    media_ch: avgOrNull(agg.sums.ch, agg.counts.ch),
    media_lc: avgOrNull(agg.sums.lc, agg.counts.lc),
    media_mt: avgOrNull(agg.sums.mt, agg.counts.mt),
    media_redacao: avgOrNull(agg.sums.red, agg.counts.red),
    media_objetiva: avgOrNull(agg.sums.obj, agg.counts.obj),
    media_geral: avgOrNull(agg.sums.geral, agg.counts.geral),
    presenca_dist: agg.presenca_dist,
    status_redacao_dist: agg.status_redacao_dist,
    ingest_run_id: agg.ingest_run_id,
    atualizado_em: agg.atualizado_em,
  };
}

function addMeanComponent(agg, key, value) {
  if (value == null) return;
  agg.sums[key] += value;
  agg.counts[key] += 1;
}

function avgOrNull(sum, count) {
  return count > 0 ? Number((sum / count).toFixed(4)) : null;
}

function incrementNestedCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function normalizeSchoolCode(value) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return null;
  if (text === '0') return null;
  return text.padStart(8, '0');
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text ? text : null;
}

function toNum(value) {
  const text = String(value || '').trim().replace(',', '.');
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function toInt(value) {
  const num = Number(String(value || '').trim());
  return Number.isFinite(num) ? num : null;
}

function mapDependencia(value) {
  const code = toInt(value);
  if (code === 1) return 'FEDERAL';
  if (code === 2) return 'ESTADUAL';
  if (code === 3) return 'MUNICIPAL';
  if (code === 4) return 'PRIVADA';
  return null;
}

function mapLocalizacao(value) {
  const code = toInt(value);
  if (code === 1) return 'URBANA';
  if (code === 2) return 'RURAL';
  return null;
}

function pushError(key, msg) {
  if (result.erros.length < 200) {
    result.erros.push({ key: String(key), msg: String(msg).slice(0, 500) });
  }
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
