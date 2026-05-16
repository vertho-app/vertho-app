/**
 * Stage 6 (BR) — carrega só os AGREGADOS no Supabase + XLSX no Storage.
 *
 * Com a tela consolidada por cidade, o DB recebe apenas cidades_agg +
 * redes + funil_agg (~poucos milhares de linhas → segundos via
 * supabase-js, sem connection string nem COPY: o payload encolheu, a
 * premissa do COPY mudou). Os priorizados lead-a-lead vão pro Storage
 * como 1 XLSX/município (bucket separado, 100 GB grátis).
 *
 * Snapshot mensal: truncate-replace idempotente.
 *
 * npx tsx data-pipeline/radarempresas/br/17_load_supabase.ts
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { getSegmento } from '../../../lib/radarempresas/segmentos';

const env = readFileSync('.env.local', 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';
const BUCKET = 'radarempresas-priorizados';
const duck = (sql: string) => execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });

function readParquet(path: string): any[] {
  if (!existsSync(path)) return [];
  const tmp = `${OUT}/_load_tmp.ndjson`;
  duck(`COPY (SELECT * FROM read_parquet('${path}')) TO '${tmp}' (FORMAT JSON);`);
  return readFileSync(tmp, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function replaceAll(table: string, rows: any[], conflict: string) {
  await sb.from(table).delete().neq(conflict, '___sentinel___');
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 1000), { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return rows.length;
}

async function main() {
  // ── XLSX → Storage (bucket privado, acesso interno via service role) ────
  await sb.storage.createBucket(BUCKET, { public: false }).catch(() => {});
  const xlsxDir = `${OUT}/xlsx`;
  const xlsxPath = new Map<string, string>();
  if (existsSync(xlsxDir)) {
    const files = readdirSync(xlsxDir).filter((f) => f.endsWith('.xlsx'));
    let up = 0;
    for (const f of files) {
      const ibge = f.replace('.xlsx', '');
      const path = `${env.RADAR_FONTE_VERSION || 'receita-2026-05'}/${f}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, readFileSync(`${xlsxDir}/${f}`), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
      if (error) { console.error(`upload ${f}: ${error.message}`); continue; }
      xlsxPath.set(ibge, path); up++;
      if (up % 200 === 0) console.log(`  upload ${up}/${files.length}...`);
    }
    console.log(`Storage: ${up} XLSX → bucket ${BUCKET}`);
  }

  // ── cidades_agg (a TELA) ───────────────────────────────────────────────
  const cid = readParquet(`${OUT}/cidades_agg.parquet`).map((c) => ({
    municipio_ibge: String(c.municipio_ibge),
    municipio_nome: c.municipio_nome, uf: c.uf,
    total_ativos: c.total_ativos, n_priorizados: c.n_priorizados,
    n_abordar: c.n_abordar, n_boa: c.n_boa, score_medio: c.score_medio,
    seg_top: c.seg_top, n_redes: c.n_redes,
    xlsx_path: xlsxPath.get(String(c.municipio_ibge)) ?? null,
    updated_at: new Date().toISOString(),
  }));
  console.log(`cidades_agg: ${await replaceAll('radarempresas_cidades_agg', cid, 'municipio_ibge')}`);

  // ── redes (resolve segmento_nome p/ a UI atual) ────────────────────────
  const redes = readParquet(`${OUT}/redes.parquet`).map((r) => ({
    marca_norm: r.marca_norm, nome_exibicao: r.nome_exibicao, tipo: r.tipo,
    n_unidades: r.n_unidades, n_donos: r.n_donos, segmento_key: r.segmento_key,
    segmento_nome: r.segmento_key ? (getSegmento(r.segmento_key)?.nome || r.segmento_key) : null,
    score_medio: r.score_medio, score_max: r.score_max, classificacao: r.classificacao,
    ufs: r.ufs, municipios: r.municipios, exemplo_cnpj: r.exemplo_cnpj,
    confianca_rede: r.confianca_rede, updated_at: new Date().toISOString(),
  }));
  console.log(`redes: ${await replaceAll('radarempresas_redes', redes, 'marca_norm')}`);

  // ── funil_agg (ordem fixa do afunilamento) ─────────────────────────────
  const ORD: Record<string, number> = { ativos: 1, nao_micro: 2, aderente: 3, score60: 4, priorizados: 5, redes: 6 };
  const funil = readParquet(`${OUT}/funil_agg.parquet`).map((f) => ({
    etapa: f.etapa, n: f.n, ordem: ORD[f.etapa] ?? 99, updated_at: new Date().toISOString(),
  }));
  console.log(`funil_agg: ${await replaceAll('radarempresas_funil_agg', funil, 'etapa')}`);

  console.log('\n[OK] Snapshot BR carregado. DB = só agregados (custo zero); leads no Storage.');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
