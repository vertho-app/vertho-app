/**
 * Carrega agregados CAGED → Supabase (só o que o MVP usa).
 *
 *   - caged_cnae_6m            → NACIONAL (benchmark, ~1.3k linhas)
 *   - caged_municipio_6m       → NACIONAL (~5.5k linhas)
 *   - caged_municipio_cnae_6m  → só Jundiaí (municipio_ibge='352590')
 *   - caged_municipio_cbo_6m   → só Jundiaí
 *
 * Mensais (municipio_cnae_mes / cbo_mes) NÃO sobem (ficam no Parquet
 * local — milhões de linhas, sem uso no MVP). Microdado nunca sobe.
 *
 * Uso: node caged/05_load_caged.mjs   (rodar de data-pipeline/radarempresas)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const JUNDIAI = '352590';
const env = readFileSync('../../.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function rows(sql) {
  const out = execFileSync('duckdb', [':memory:', '-json', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });
  return JSON.parse(out || '[]');
}
async function upsert(table, data, conflict) {
  let ok = 0;
  for (let i = 0; i < data.length; i += 1000) {
    const { error } = await sb.from(table).upsert(data.slice(i, i + 1000), { onConflict: conflict });
    if (error) { console.error(`${table}:`, error.message); } else ok += Math.min(1000, data.length - i);
  }
  console.log(`  ${table}: ${ok}/${data.length}`);
}

const t0 = Date.now();

// Nacionais
await upsert('radarempresas_caged_cnae_6m',
  rows(`SELECT * FROM read_parquet('out/caged_cnae_6m.parquet')`), 'cnae');
await upsert('radarempresas_caged_municipio_6m',
  rows(`SELECT * FROM read_parquet('out/caged_municipio_6m.parquet')`), 'municipio_ibge');

// Recorte Jundiaí
await upsert('radarempresas_caged_municipio_cnae_6m',
  rows(`SELECT * FROM read_parquet('out/caged_municipio_cnae_6m.parquet') WHERE municipio_ibge='${JUNDIAI}'`),
  'municipio_ibge,cnae');
await upsert('radarempresas_caged_municipio_cbo_6m',
  rows(`SELECT * FROM read_parquet('out/caged_municipio_cbo_6m.parquet') WHERE municipio_ibge='${JUNDIAI}'`),
  'municipio_ibge,cbo');

console.log(`\n[OK] CAGED carregado em ${Math.round((Date.now() - t0) / 1000)}s`);
