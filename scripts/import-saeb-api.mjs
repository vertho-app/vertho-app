#!/usr/bin/env node
/**
 * Importa resultados finais do Saeb pelo endpoint JSON público do boletim.
 *
 * Uso rápido:
 *   node scripts/import-saeb-api.mjs --ano 2023 --inep 35218509 --dry
 *   node scripts/import-saeb-api.mjs --ano 2023 --inep 35218509
 *   node scripts/import-saeb-api.mjs --ano 2023 --uf BA --limit 100 --concurrency 5
 *   node scripts/import-saeb-api.mjs --ano 2023 --file Escolas.txt --concurrency 10
 *   node scripts/import-saeb-api.mjs --ano 2023 --uf BA --offset 5000 --limit 5000
 *
 * Fontes de INEP:
 *   --inep 35218509,29061920    lista manual
 *   --file caminho.txt          extrai códigos de 8 dígitos do arquivo
 *   --uf BA                     usa diag_escolas já cadastradas no Supabase
 */

import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import {
  endpointSaebResultadoFinal,
  fetchSaebResultadoFinal,
  normalizeSaebResultadoFinal,
} from '../lib/radar/saeb-api-normalizer.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const ANO = Number(flag('--ano', '2023'));
const UF = flag('--uf');
const FILE = flag('--file');
const INEP_ARG = flag('--inep');
const OFFSET = Math.max(0, Number(flag('--offset', '0')));
const LIMIT = Number(flag('--limit', '0'));
const CONCURRENCY = Math.max(1, Number(flag('--concurrency', '5')));
const DB_BATCH_SIZE = Math.max(1, Number(flag('--db-batch-size', '50')));
const DELAY_MS = Math.max(0, Number(flag('--delay-ms', '0')));
const DRY = has('--dry');
const NO_RUN = has('--no-run');

if (!Number.isFinite(ANO)) {
  console.error('ERRO: informe --ano 2023');
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

const sourceLabel = INEP_ARG ? 'inep' : FILE ? `file:${FILE}` : UF ? `uf:${UF}` : null;
if (!sourceLabel) {
  console.error('ERRO: informe uma fonte: --inep, --file ou --uf');
  process.exit(1);
}

const targets = await loadTargets();
if (!targets.length) {
  console.error('Nenhuma escola encontrada para importar.');
  process.exit(0);
}

const sliced = OFFSET > 0 ? targets.slice(OFFSET) : targets;
const planned = LIMIT > 0 ? sliced.slice(0, LIMIT) : sliced;
console.log(DRY ? '== DRY RUN ==' : '== EXECUÇÃO REAL ==');
console.log(`ano: ${ANO}`);
console.log(`fonte: ${sourceLabel}`);
console.log(`escolas: ${planned.length}`);
console.log(`concorrência: ${CONCURRENCY}`);
console.log(`batch DB: ${DB_BATCH_SIZE}`);
if (OFFSET) console.log(`offset: ${OFFSET}`);
if (DELAY_MS) console.log(`delay por escola: ${DELAY_MS}ms`);
console.log(`endpoint exemplo: ${endpointSaebResultadoFinal(planned[0], ANO)}`);
console.log('');

let runId = null;
if (!DRY && !NO_RUN) {
  const { data, error } = await sb.from('diag_ingest_runs')
    .insert({
      fonte: 'saeb_api',
      escopo: { ano: ANO, source: sourceLabel, offset: OFFSET || null, limit: LIMIT || null, concurrency: CONCURRENCY, dbBatchSize: DB_BATCH_SIZE },
      status: 'rodando',
      total_planejado: planned.length,
      arquivo_origem: sourceLabel,
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
  avisos: [],
};

const pendingPersist = [];
let persistChain = Promise.resolve();

const startedAt = Date.now();
let nextProgressAt = Math.min(25, planned.length);
await runPool(planned, CONCURRENCY, async (codigo, index) => {
  if (DELAY_MS) await sleep(DELAY_MS);
  await importOne(codigo, index);
  logProgress();
});
await flushPersistQueue(true);
await persistChain;

const durationMs = Date.now() - startedAt;
const status = result.totalFalha > 0 && (result.totalSucesso > 0 || result.totalSkipped > 0)
  ? 'parcial'
  : result.totalFalha > 0
    ? 'erro'
    : result.totalSkipped > 0
      ? 'parcial'
    : 'sucesso';

if (!DRY && runId) {
  await sb.from('diag_ingest_runs')
    .update({
      status,
      total_processado: result.totalProcessado,
      total_sucesso: result.totalSucesso,
      total_falha: result.totalFalha,
      total_skipped: result.totalSkipped,
      erros: [...result.erros, ...result.avisos].slice(0, 50),
      finalizado_em: new Date().toISOString(),
      duracao_ms: durationMs,
    })
    .eq('id', runId);
}

console.log('');
console.log(`concluído em ${(durationMs / 1000).toFixed(1)}s — status:${status} ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped}`);
if (runId) console.log(`runId: ${runId}`);
if (result.erros.length) {
  console.log('\nprimeiros erros:');
  for (const e of result.erros.slice(0, 10)) console.log(`- ${e.key}: ${e.msg}`);
}
if (result.avisos.length) {
  console.log('\nprimeiros avisos/skips:');
  for (const e of result.avisos.slice(0, 10)) console.log(`- ${e.key}: ${e.msg}`);
}

async function importOne(codigoInep, index) {
  try {
    const api = await fetchWithRetry(codigoInep, ANO);
    const normalized = normalizeSaebResultadoFinal(api, { codigoInep, anoProjeto: ANO, ingestRunId: runId });
    result.totalProcessado++;

    if (!normalized.escola || normalized.snapshots.length === 0) {
      result.totalSkipped++;
      pushWarning(codigoInep, normalized.warning || 'sem snapshots');
      return;
    }

    if (DRY) {
      if (index === 0) {
        console.log('amostra normalizada:');
        console.log(JSON.stringify({
          escola: normalized.escola,
          snapshots: normalized.snapshots.map((s) => ({
            ano: s.ano,
            etapa: s.etapa,
            disciplina: s.disciplina,
            media_proficiencia: s.media_proficiencia,
            niveis: Object.keys(s.distribuicao).length,
          })),
        }, null, 2));
        console.log('');
      }
      result.totalSucesso++;
      return;
    }

    pendingPersist.push({
      key: codigoInep,
      escola: normalized.escola,
      snapshots: normalized.snapshots,
    });
    flushPersistQueue();
  } catch (err) {
    result.totalProcessado++;
    result.totalFalha++;
    pushError(codigoInep, err?.message || String(err));
  }
}

function flushPersistQueue(force = false) {
  if (DRY) return persistChain;
  if (!force && pendingPersist.length < DB_BATCH_SIZE) return persistChain;
  if (!pendingPersist.length) return persistChain;

  const batch = pendingPersist.splice(0, pendingPersist.length);
  persistChain = persistChain.then(async () => {
    const escolasBatch = dedupeEscolas(batch.map((item) => item.escola));
    const snapshotsBatch = batch.flatMap((item) => item.snapshots);

    const { error: escolaErr } = await sb.from('diag_escolas')
      .upsert(escolasBatch, { onConflict: 'codigo_inep' });
    if (escolaErr) throwPersistBatch(batch, `diag_escolas: ${escolaErr.message}`);

    const { error: snapErr } = await sb.from('diag_saeb_snapshots')
      .upsert(snapshotsBatch, { onConflict: 'codigo_inep,ano,etapa,disciplina' });
    if (snapErr) throwPersistBatch(batch, `diag_saeb_snapshots: ${snapErr.message}`);

    result.totalSucesso += batch.length;
  }).catch((err) => {
    const msg = err?.message || String(err);
    for (const item of batch) {
      result.totalFalha++;
      pushError(item.key, msg);
    }
  });
  return persistChain;
}

function throwPersistBatch(batch, msg) {
  const error = new Error(msg);
  error.batchKeys = batch.map((item) => item.key);
  throw error;
}

function dedupeEscolas(rows) {
  const map = new Map();
  for (const row of rows) map.set(row.codigo_inep, row);
  return Array.from(map.values());
}

async function fetchWithRetry(codigoInep, ano, attempts = 4) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        return await fetchSaebResultadoFinal(codigoInep, ano, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      const retryable = /429|500|502|503|504|aborted|timeout|fetch failed/i.test(msg);
      if (!retryable || attempt === attempts) break;
      await sleep(500 * attempt * attempt);
    }
  }
  throw lastErr;
}

async function loadTargets() {
  let codes = [];
  if (INEP_ARG) {
    codes = INEP_ARG.split(/[,\s]+/).filter(Boolean);
  } else if (FILE) {
    const text = readFileSync(FILE, 'utf-8');
    codes = Array.from(new Set(text.match(/\b\d{8}\b/g) || []));
  } else if (UF) {
    codes = await loadTargetsByUf(UF.toUpperCase());
  }
  return Array.from(new Set(codes.map((c) => String(c).trim()).filter((c) => /^\d{8}$/.test(c))));
}

async function loadTargetsByUf(uf) {
  const pageSize = 1000;
  const codes = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await sb.from('diag_escolas')
      .select('codigo_inep')
      .eq('uf', uf)
      .order('codigo_inep', { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Falha ao listar UF ${uf}: ${error.message}`);
    codes.push(...(data || []).map((r) => r.codigo_inep));
    if (!data || data.length < pageSize) break;
  }
  return codes;
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

function pushError(key, msg) {
  if (result.erros.length < 200) result.erros.push({ type: 'erro', key: String(key), msg: String(msg).slice(0, 500) });
}

function pushWarning(key, msg) {
  if (result.avisos.length < 200) result.avisos.push({ type: 'skip', key: String(key), msg: String(msg).slice(0, 500) });
}

function logProgress() {
  const done = result.totalProcessado;
  if (done < nextProgressAt) return;
  const pct = Math.round((done / planned.length) * 100);
  console.log(`progresso ${done}/${planned.length} (${pct}%) ok:${result.totalSucesso} falha:${result.totalFalha} skip:${result.totalSkipped}`);
  nextProgressAt = done >= planned.length ? Number.POSITIVE_INFINITY : Math.min(planned.length, done + 25);
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
