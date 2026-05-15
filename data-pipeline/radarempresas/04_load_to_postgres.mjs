/**
 * Etapa 1.5 — Carrega o recorte tratado (Parquet) → Postgres/Supabase.
 *
 * Lê out/empresas_jundiai.parquet (gerado por run.ps1 / 01_pipeline_jundiai.sql),
 * separa em radarempresas_empresas (dedupe por cnpj_basico) +
 * radarempresas_estabelecimentos (1 por cnpj_completo) e insere em batches.
 * Idempotente (upsert). Grava um job em radarempresas_jobs.
 *
 * Uso:
 *   node 04_load_to_postgres.mjs            # carga real
 *   node 04_load_to_postgres.mjs --dry      # só conta, não escreve
 *
 * Requer: DuckDB no PATH, .env.local da app (SUPABASE_SERVICE_ROLE_KEY).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry');
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PARQUET = 'out/empresas_jundiai.parquet';
const ENV_PATH = '../../.env.local';
const BATCH = 1000;

// ── env da app ───────────────────────────────────────────────────────────
const env = readFileSync(new URL(ENV_PATH, import.meta.url), 'utf8')
  .split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

if (!existsSync(PARQUET)) {
  console.error(`Parquet não encontrado: ${PARQUET}. Rode run.ps1 primeiro.`);
  process.exit(1);
}
mkdirSync('out', { recursive: true });

function duck(sql) {
  return execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });
}

// ── total ────────────────────────────────────────────────────────────────
const total = Number(
  duck(`SELECT count(*) AS n FROM read_parquet('${PARQUET}');`).match(/\d+/)?.[0] || 0,
);
console.log(`Parquet: ${total} estabelecimentos no recorte`);
if (total === 0) { console.log('Nada a carregar.'); process.exit(0); }

// ── exporta NDJSON (robusto pra qualquer volume) ─────────────────────────
const EMP_NDJSON = 'out/_empresas.ndjson';
const EST_NDJSON = 'out/_estab.ndjson';

duck(`COPY (
  SELECT DISTINCT ON (cnpj_basico)
    cnpj_basico, razao_social, natureza_juridica,
    capital_social_num AS capital_social, porte_empresa, fonte_version
  FROM read_parquet('${PARQUET}')
) TO '${EMP_NDJSON}' (FORMAT JSON);`);

duck(`COPY (
  SELECT
    cnpj_completo, cnpj_basico, cnpj_ordem, cnpj_dv, nome_fantasia,
    is_matriz, situacao_cadastral, is_active,
    cnae_fiscal_principal AS cnae_principal, cnae_principal_desc,
    cnae_fiscal_secundaria, uf, municipio_cod, municipio_nome,
    bairro, cep, email, telefone_1, telefone_2,
    has_email, has_phone, has_fantasia,
    data_inicio_atividade, company_age_years, fonte_version
  FROM read_parquet('${PARQUET}')
) TO '${EST_NDJSON}' (FORMAT JSON);`);

if (DRY) {
  console.log('DRY-RUN — NDJSON gerados em out/. Sem escrita no banco.');
  process.exit(0);
}

// ── job ──────────────────────────────────────────────────────────────────
const { data: job } = await sb.from('radarempresas_jobs')
  .insert({ job_type: 'load_parquet', status: 'running', source_name: PARQUET, source_version: 'receita-2026-05' })
  .select('id').single();
const jobId = job?.id;

async function loadNdjson(file, table, mapFn, conflict) {
  let batch = [];
  let n = 0, ins = 0, fail = 0;
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try { row = mapFn(JSON.parse(line)); } catch { fail++; continue; }
    batch.push(row);
    n++;
    if (batch.length >= BATCH) {
      const { error } = await sb.from(table).upsert(batch, { onConflict: conflict });
      if (error) { fail += batch.length; console.error(`${table}:`, error.message); }
      else ins += batch.length;
      batch = [];
      if (n % 5000 === 0) console.log(`  ${table}: ${n} processados...`);
    }
  }
  if (batch.length) {
    const { error } = await sb.from(table).upsert(batch, { onConflict: conflict });
    if (error) { fail += batch.length; console.error(`${table}:`, error.message); }
    else ins += batch.length;
  }
  return { n, ins, fail };
}

const t0 = Date.now();

console.log('Carregando empresas...');
const emp = await loadNdjson(EMP_NDJSON, 'radarempresas_empresas', (r) => ({
  cnpj_basico: String(r.cnpj_basico),
  razao_social: r.razao_social || null,
  natureza_juridica: r.natureza_juridica || null,
  capital_social: r.capital_social ?? null,
  porte_empresa: r.porte_empresa || null,
  fonte_version: r.fonte_version || 'receita-2026-05',
  updated_at: new Date().toISOString(),
}), 'cnpj_basico');
console.log(`  empresas: ${emp.ins} ok, ${emp.fail} falhas`);

console.log('Carregando estabelecimentos...');
const est = await loadNdjson(EST_NDJSON, 'radarempresas_estabelecimentos', (r) => ({
  cnpj_completo: String(r.cnpj_completo),
  cnpj_basico: String(r.cnpj_basico),
  cnpj_ordem: r.cnpj_ordem || null,
  cnpj_dv: r.cnpj_dv || null,
  nome_fantasia: r.nome_fantasia || null,
  is_matriz: !!r.is_matriz,
  situacao_cadastral: r.situacao_cadastral || null,
  is_active: r.is_active !== false,
  cnae_principal: r.cnae_principal || null,
  cnae_principal_desc: r.cnae_principal_desc || null,
  cnaes_secundarios: r.cnae_fiscal_secundaria
    ? String(r.cnae_fiscal_secundaria).split(',').map(s => s.trim()).filter(Boolean)
    : null,
  uf: r.uf || null,
  municipio_cod: r.municipio_cod || null,
  municipio_nome: r.municipio_nome || null,
  bairro: r.bairro || null,
  cep: r.cep || null,
  email: r.email || null,
  telefone_1: r.telefone_1 || null,
  telefone_2: r.telefone_2 || null,
  has_email: !!r.has_email,
  has_phone: !!r.has_phone,
  has_fantasia: !!r.has_fantasia,
  data_inicio_atividade: r.data_inicio_atividade || null,
  company_age_years: r.company_age_years ?? null,
  fonte_version: r.fonte_version || 'receita-2026-05',
  updated_at: new Date().toISOString(),
}), 'cnpj_completo');
console.log(`  estabelecimentos: ${est.ins} ok, ${est.fail} falhas`);

const dt = Math.round((Date.now() - t0) / 1000);
if (jobId) {
  await sb.from('radarempresas_jobs').update({
    status: (emp.fail + est.fail) > 0 ? 'done' : 'done',
    rows_processed: emp.n + est.n,
    rows_inserted: emp.ins + est.ins,
    rows_failed: emp.fail + est.fail,
    finished_at: new Date().toISOString(),
  }).eq('id', jobId);
}
console.log(`\n✓ Carga concluída em ${dt}s. Próximo: rodar rodarScores() no admin.`);
