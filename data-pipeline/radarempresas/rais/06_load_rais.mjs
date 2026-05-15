/**
 * Carrega agregados RAIS_ESTAB → Supabase (só o MVP).
 *   - rais_estab_cnae           → NACIONAL (benchmark, ~1.3k)
 *   - rais_estab_municipio      → NACIONAL (~5.5k)
 *   - rais_estab_municipio_cnae → só Jundiaí (352590)
 *   - rais_estab_municipio_porte→ só Jundiaí
 * Microdado nunca sobe. Uso: node rais/06_load_rais.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const JUNDIAI = '352590';
const env = readFileSync('../../.env.local', 'utf8').split('\n').filter(l => l && !l.startsWith('#'))
  .reduce((a, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const rows = (sql) => JSON.parse(execFileSync('duckdb', [':memory:', '-json', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 }) || '[]');
async function upsert(table, data, conflict) {
  let ok = 0;
  for (let i = 0; i < data.length; i += 1000) {
    const { error } = await sb.from(table).upsert(data.slice(i, i + 1000), { onConflict: conflict });
    if (error) console.error(`${table}:`, error.message); else ok += Math.min(1000, data.length - i);
  }
  console.log(`  ${table}: ${ok}/${data.length}`);
}

const t0 = Date.now();
await upsert('radarempresas_rais_estab_cnae',
  rows(`SELECT * FROM read_parquet('out/rais_estab_cnae.parquet')`), 'cnae');
await upsert('radarempresas_rais_estab_municipio',
  rows(`SELECT * FROM read_parquet('out/rais_estab_municipio.parquet')`), 'municipio_ibge');
await upsert('radarempresas_rais_estab_municipio_cnae',
  rows(`SELECT * FROM read_parquet('out/rais_estab_municipio_cnae.parquet') WHERE municipio_ibge='${JUNDIAI}'`),
  'municipio_ibge,cnae');
await upsert('radarempresas_rais_estab_municipio_porte',
  rows(`SELECT * FROM read_parquet('out/rais_estab_municipio_porte.parquet') WHERE municipio_ibge='${JUNDIAI}'`),
  'municipio_ibge,tam_cod');
console.log(`\n[OK] RAIS carregado em ${Math.round((Date.now() - t0) / 1000)}s`);
