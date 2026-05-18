/**
 * Stage 2.5 (BR) — fetch CEMPRE (IBGE) via API SIDRA → cempre_sidra.parquet.
 *
 * CEMPRE = Cadastro Central de Empresas: nº de empresas + pessoal
 * ocupado assalariado por MUNICÍPIO × CNAE (anual, série 2021). NÃO é
 * por-CNPJ — benchmark setorial/local. Entra como CORROBORAÇÃO do
 * contexto (Stage 3): onde CAGED/RAIS são ralos, confirma porte do
 * setor e ajusta contexto_confianca. Não vira eixo do score.
 *
 * SIDRA limita ~50k valores/request. 1 UF inteira (RS=497 mun ×2v
 * ×~1067 cats ≈ 1M) → HTTP 400. Solução: chunk por LOTE de municípios
 * (15 mun ×2 ×~1067 ≈ 32k < 50k). Lista 7-díg vem de
 * /localidades/estados/{ufId}/municipios.
 *
 * Cache LOCAL (não Supabase — bruto não sobe, Estratégia C): marcador
 * out/_cempre_done_{ref}. Idempotente: pula refetch se já feito.
 *
 * Códigos confirmados (agregados/6449): t/6449, V 2585 (nº empresas),
 * V 708 (pessoal assalariado), c12762 (CNAE 2.0), N6. Série encerrada
 * 2021 — `last 1` traz 2021 (corroboração: estrutura setorial estável).
 *
 * npx tsx data-pipeline/radarempresas/br/15_cempre_sidra.ts
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SIDRA = {
  tabela: process.env.SIDRA_TABELA || '6449',
  variaveis: (process.env.SIDRA_VARS || '2585,708'),
  classificacao: process.env.SIDRA_CLASSIF || 'c12762',
  catCnae: process.env.SIDRA_CNAE_CATS || 'all',
  periodo: process.env.SIDRA_PERIODO || 'last 1',
};
const BASE = 'https://apisidra.ibge.gov.br/values';
const LOC = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const UF_IDS = ['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29',
  '31','32','33','35','41','42','43','50','51','52','53'];
const BATCH = 15; // 15 mun ×2v ×~1067 cats ≈ 32k < 50k (margem)

const OUT = process.env.OUT_DIR || 'data-pipeline/radarempresas/br/out';
const REF = `cempre-${SIDRA.tabela}-${SIDRA.periodo}`.replace(/\s+/g, '');
const DONE = `${OUT}/_cempre_done_${REF}`;
const NDJ = `${OUT}/_cempre.ndjson`;
const duck = (sql: string) => execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));

async function getJson(url: string, tries = 3): Promise<any> {
  for (let t = 1; t <= tries; t++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e: any) {
      if (t === tries) throw e;
      await sleep(2500 * t);
    }
  }
}

function parseRows(rows: any[], out: string[]) {
  for (const d of rows) {
    // D1C IBGE 7-díg; V valor; D2N variável; CNAE = token inicial de D4N
    const val = d.V, vari = d.D2N;
    if (!d.D1C || val == null || val === '...' || val === '-') continue;
    const nome = String(d.D4N || '');
    const m = nome.match(/^([\d.\-]+)\s/); // pula "Total" e seções "A ..."
    if (!m) continue;
    const cnae = m[1].replace(/\D/g, '');
    if (!cnae) continue;
    out.push(JSON.stringify({
      municipio_ibge: String(d.D1C).slice(0, 6), // 7→6 (casa CAGED/RAIS)
      cnae_cod: cnae, variavel: vari || '',
      valor: Number(String(val).replace(',', '.')) || 0,
    }));
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (existsSync(DONE) && existsSync(`${OUT}/cempre_sidra.parquet`)) {
    console.log(`CEMPRE cache hit (${REF}) — sem refetch.`);
    return;
  }

  // todos os municípios 7-díg, por UF (endpoint localidades)
  const ids: string[] = [];
  for (const uf of UF_IDS) {
    const mun = await getJson(`${LOC}/estados/${uf}/municipios`);
    for (const m of mun) ids.push(String(m.id));
  }
  console.log(`CEMPRE: ${ids.length} municípios, lotes de ${BATCH} (${Math.ceil(ids.length / BATCH)} requests)`);

  rmSync(NDJ, { force: true });
  let buf: string[] = [];
  let okBatches = 0, falhas = 0, linhas = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const lote = ids.slice(i, i + BATCH);
    const url = `${BASE}/t/${SIDRA.tabela}/n6/${lote.join(',')}`
      + `/v/${SIDRA.variaveis}/p/${encodeURIComponent(SIDRA.periodo)}`
      + `/${SIDRA.classificacao}/${SIDRA.catCnae}?formato=json`;
    try {
      const j = await getJson(url);
      const rows = Array.isArray(j) ? j.slice(1) : []; // [0] = cabeçalho
      parseRows(rows, buf);
      okBatches++;
    } catch (e: any) {
      falhas++;
      console.error(`  lote ${i / BATCH} (mun ${lote[0]}…) falhou: ${e.message}`);
    }
    if (buf.length >= 20000) { appendFileSync(NDJ, buf.join('\n') + '\n'); linhas += buf.length; buf = []; }
    if ((i / BATCH) % 25 === 0) console.log(`  ${i + lote.length}/${ids.length} mun · ${linhas + buf.length} linhas · ${falhas} falhas`);
  }
  if (buf.length) { appendFileSync(NDJ, buf.join('\n') + '\n'); linhas += buf.length; }
  console.log(`Fetch: ${okBatches} lotes ok, ${falhas} falhas, ${linhas} linhas`);
  if (linhas === 0) { console.error('CEMPRE vazio — abortando (verificar SIDRA).'); process.exit(1); }

  // agrega → cempre_sidra.parquet (read_json EXPLÍCITO: auto inferia
  // numérico e quebrava o filtro/colunas — mesmo gotcha do crosswalk)
  duck(`COPY (
    SELECT municipio_ibge,
      regexp_replace(cnae_cod, '\\D', '', 'g') AS cnae,
      max(CASE WHEN variavel ILIKE '%empresa%' THEN valor END)            AS cempre_n_empresas,
      max(CASE WHEN variavel ILIKE '%assalariad%' OR variavel ILIKE '%pessoal%'
               THEN valor END)                                            AS cempre_pessoal_assal
    FROM read_json('${NDJ}', format='newline_delimited',
      columns={municipio_ibge:'VARCHAR', cnae_cod:'VARCHAR', variavel:'VARCHAR', valor:'DOUBLE'})
    GROUP BY municipio_ibge, regexp_replace(cnae_cod, '\\D', '', 'g')
  ) TO '${OUT}/cempre_sidra.parquet' (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);`);

  const n = duck(`SELECT COUNT(*) FROM read_parquet('${OUT}/cempre_sidra.parquet');`)
    .replace(/[^\d]/g, ' ').trim().split(/\s+/).filter(Boolean).pop();
  writeFileSync(DONE, new Date().toISOString());
  console.log(`✓ cempre_sidra.parquet: ${n} linhas município×CNAE → Stage 3 (corroboração ligada)`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
