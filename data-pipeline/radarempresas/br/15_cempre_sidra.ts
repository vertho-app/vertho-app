/**
 * Stage 2.5 (BR) — fetch CEMPRE (IBGE) via API SIDRA, com cache.
 *
 * CEMPRE = Cadastro Central de Empresas: nº de empresas e pessoal
 * ocupado assalariado por MUNICÍPIO × CNAE (anual). NÃO é dado por-CNPJ
 * — é benchmark setorial/local. Entra como CORROBORAÇÃO do contexto
 * (Stage 3): onde CAGED/RAIS são ralos, o CEMPRE confirma porte do
 * setor e ajusta contexto_confianca. Decisão: não vira eixo do score.
 *
 * Volume: ~5.570 municípios × ~divisões CNAE × 2 variáveis. Acima do
 * limite SIDRA por request (~50k valores) → busca em chunks por UF.
 * Idempotente: pula se já há cache do mesmo período (radarempresas_
 * sidra_cache) — CEMPRE é anual, muda pouco.
 *
 * Saída: out/cempre_sidra.parquet + upsert radarempresas_sidra_cache.
 *
 * Códigos SIDRA confirmados via API de metadados (agregados/6449):
 * tabela 6449, V 2585 (nº empresas), V 708 (pessoal assalariado),
 * classif c12762 (CNAE 2.0), N6 município. Série CEMPRE municipal
 * encerrada em 2021 — `last 1` traz 2021. Aceitável: é sinal de
 * CORROBORAÇÃO (estrutura setorial é estável ano-a-ano), não eixo.
 *
 * npx tsx data-pipeline/radarempresas/br/15_cempre_sidra.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

// ── CONFIG_VERIFY — códigos SIDRA (tabela CEMPRE municipal vigente) ───────
const SIDRA = {
  tabela: process.env.SIDRA_TABELA || '6449',  // CEMPRE: empresas/pessoal por município×CNAE
  // V 2585 = nº de empresas e outras organizações;
  // V 708  = pessoal ocupado assalariado (confirmados via agregados/6449)
  variaveis: (process.env.SIDRA_VARS || '2585,708').split(','),
  classificacao: process.env.SIDRA_CLASSIF || 'c12762', // CNAE 2.0
  catCnae: process.env.SIDRA_CNAE_CATS || 'all',        // todas as divisões
  periodo: process.env.SIDRA_PERIODO || 'last 1',       // último ano
};
const BASE = 'https://apisidra.ibge.gov.br/values';
// UFs por código IBGE (n3) — chunk por UF respeita o limite ~50k valores
const UFS = ['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29',
  '31','32','33','35','41','42','43','50','51','52','53'];

const env = readFileSync('.env.local', 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .reduce((a: any, l) => { const i = l.indexOf('='); if (i > 0) a[l.slice(0, i).trim()] = l.slice(i + 1).trim(); return a; }, {});
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';
const duck = (sql: string) => execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });

async function fetchUF(ufCod: string): Promise<any[]> {
  // /t/{tab}/n6/in n3 {uf}/v/{vars}/p/{per}/{classif}/{cats}?formato=json
  const url = `${BASE}/t/${SIDRA.tabela}/n6/in%20n3%20${ufCod}`
    + `/v/${SIDRA.variaveis.join(',')}/p/${encodeURIComponent(SIDRA.periodo)}`
    + `/${SIDRA.classificacao}/${SIDRA.catCnae}?formato=json`;
  for (let tent = 1; tent <= 3; tent++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return Array.isArray(j) ? j.slice(1) : []; // [0] = cabeçalho descritivo
    } catch (e: any) {
      if (tent === 3) { console.error(`  UF ${ufCod} falhou: ${e.message}`); return []; }
      await new Promise((s) => setTimeout(s, 3000 * tent));
    }
  }
  return [];
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const refKey = `cempre-${SIDRA.tabela}-${SIDRA.periodo}`.replace(/\s+/g, '');

  const { count: cached } = await sb.from('radarempresas_sidra_cache')
    .select('*', { count: 'exact', head: true }).eq('ref_key', refKey);
  if (cached && cached > 0) {
    console.log(`Cache hit (${cached} linhas, ref ${refKey}) — exportando do cache, sem refetch.`);
  } else {
    console.log(`Fetch CEMPRE SIDRA t/${SIDRA.tabela} v/${SIDRA.variaveis} — ${UFS.length} UFs...`);
    const linhas: any[] = [];
    for (const uf of UFS) {
      const rows = await fetchUF(uf);
      for (const d of rows) {
        // D1C = município IBGE 7-díg; V = valor; D2N = variável;
        // D4C = ID interno SIDRA (NÃO é CNAE); CNAE real = token inicial
        // de D4N, ex.: "01.11-3 Cultivo de cereais" → 01113.
        const val = d.V, vari = d.D2N;
        if (!d.D1C || val == null || val === '...' || val === '-') continue;
        // IBGE 7→6 díg (sem DV) p/ casar com CAGED/RAIS (municipio_ibge 6)
        const munIbge = String(d.D1C).slice(0, 6);
        const nome = String(d.D4N || '');
        const mcnae = nome.match(/^([\d.\-]+)\s/);  // pula "Total" e seções "A ..."
        if (!mcnae) continue;
        const cnae = mcnae[1].replace(/\D/g, '');
        if (!cnae) continue;
        linhas.push({
          ref_key: refKey, municipio_ibge: munIbge, cnae_cod: cnae,
          cnae_nome: nome.slice(0, 120), variavel: vari || '',
          valor: Number(String(val).replace(',', '.')) || 0,
        });
      }
      console.log(`  UF ${uf}: +${rows.length} (acum ${linhas.length})`);
    }
    if (!linhas.length) {
      console.error('Nenhuma linha CEMPRE — verificar CONFIG_VERIFY (códigos SIDRA).');
      process.exit(1);
    }
    // upsert em lote no cache Supabase (pequeno, agregado — ok no DB)
    await sb.from('radarempresas_sidra_cache').delete().eq('ref_key', refKey);
    for (let i = 0; i < linhas.length; i += 1000) {
      const { error } = await sb.from('radarempresas_sidra_cache').insert(linhas.slice(i, i + 1000));
      if (error) { console.error('cache insert:', error.message); break; }
    }
    console.log(`Cache gravado: ${linhas.length} linhas (ref ${refKey})`);
  }

  // exporta cache → Parquet (Stage 3 consome)
  const { data: all } = await sb.from('radarempresas_sidra_cache')
    .select('municipio_ibge, cnae_cod, variavel, valor').eq('ref_key', refKey).limit(1000000);
  writeFileSync(`${OUT}/_cempre.ndjson`, (all || []).map((r) => JSON.stringify(r)).join('\n') + '\n');
  duck(`COPY (
    SELECT municipio_ibge,
      regexp_replace(cnae_cod, '\\D', '', 'g') AS cnae,
      max(CASE WHEN variavel ILIKE '%empresa%' THEN valor END)                       AS cempre_n_empresas,
      max(CASE WHEN variavel ILIKE '%assalariad%' OR variavel ILIKE '%pessoal%'
               THEN valor END)                                                       AS cempre_pessoal_assal
    FROM read_json_auto('${OUT}/_cempre.ndjson')
    GROUP BY municipio_ibge, regexp_replace(cnae_cod, '\\D', '', 'g')
  ) TO '${OUT}/cempre_sidra.parquet' (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);`);
  console.log(`✓ ${OUT}/cempre_sidra.parquet · Próximo: Stage 3 (14_contexto.sql)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
