/**
 * Stage 4 (BR) — Score em lote, LOCAL, sobre Parquet. Zero Supabase.
 *
 * Reusa lib/radarempresas/score-resolve.ts (scoreEstab) — o MESMO motor
 * já validado em Jundiaí (re-score deu distribuição idêntica). Sem drift
 * por construção: não há cópia da fórmula aqui.
 *
 * Fluxo (constante em memória, padrão NDJSON igual 04_load):
 *   base (parquet particionado por uf) + contexto.parquet + ref/json
 *     -> DuckDB junta e exporta NDJSON  -> Node aplica scoreEstab
 *     -> scored NDJSON  -> DuckDB grava out/scored.parquet
 *
 * Contexto: join base.municipio_ibge + cnae → contexto.parquet. Sem
 * contexto.parquet, score roda com contexto null (degrada confiança,
 * não quebra).
 *
 * Ref tables (allowlist/denylist/tetos) em out/ref/*.json — exportadas
 * uma vez do Supabase por 19_dump_ref.ts (não mudam por run).
 *
 * Roda via tsx (importa o lib .ts). Env: OUT_DIR. Uso:
 *   npx tsx data-pipeline/radarempresas/br/12_score.ts
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, createReadStream, appendFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { scoreEstab, type CnaeRegra } from '../../../lib/radarempresas/score-resolve';

const OUT = process.env.OUT_DIR || 'out';
const BASE = `${OUT}/base/**/*.parquet`;
const CTX = `${OUT}/contexto.parquet`;
const REF = `${OUT}/ref`;
const NDJ_IN = `${OUT}/_score_in.ndjson`;
const NDJ_OUT = `${OUT}/_score_out.ndjson`;

const duck = (sql: string) =>
  execFileSync('duckdb', [':memory:', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 30 });

async function main() {
  // ref tables — idênticas ao scripts/radarempresas-score.ts
  const mapa: CnaeRegra[] = JSON.parse(readFileSync(`${REF}/cnae_segmento.json`, 'utf8'))
    .sort((a: any, b: any) => (b.prefixo_len || b.cnae_prefixo.length) - (a.prefixo_len || a.cnae_prefixo.length));
  const denySet = JSON.parse(readFileSync(`${REF}/cnae_denylist.json`, 'utf8'))
    .sort((a: any, b: any) => b.cnae_prefixo.length - a.cnae_prefixo.length)
    .map((d: any) => ({ p: d.cnae_prefixo }));
  const tetoMap = new Map<string, string>(
    JSON.parse(readFileSync(`${REF}/segmentos_teto.json`, 'utf8'))
      .map((s: any) => [s.key, s.classificacao_teto]));

  // junta base + contexto → NDJSON
  const hasCtx = existsSync(CTX);
  const ctxJoin = hasCtx
    ? `LEFT JOIN read_parquet('${CTX}') x
         ON x.municipio_ibge = b.municipio_ibge
        AND regexp_replace(x.cnae, '\\D', '', 'g') = regexp_replace(b.cnae_principal, '\\D', '', 'g')`
    : '';
  const ctxCols = hasCtx
    ? 'x.caged_contexto_score, x.contexto_confianca, x.rais_tam_medio_setor'
    : "NULL AS caged_contexto_score, NULL AS contexto_confianca, NULL AS rais_tam_medio_setor";

  console.log(`Score BR · contexto: ${hasCtx ? 'contexto.parquet' : 'AUSENTE (null)'}`);
  duck(`COPY (
    SELECT b.cnpj_completo, b.cnpj_basico, b.cnae_principal, b.is_matriz,
           b.has_email, b.has_phone, b.has_fantasia, b.company_age_years,
           b.qtd_estabelecimentos_grupo, b.porte_empresa, b.capital_social,
           b.razao_social, ${ctxCols}
    FROM read_parquet('${BASE}') b
    ${ctxJoin}
  ) TO '${NDJ_IN}' (FORMAT JSON);`);

  // aplica scoreEstab linha-a-linha (memória constante)
  const t0 = Date.now();
  let n = 0, semSeg = 0;
  let buf: string[] = [];
  rmSync(NDJ_OUT, { force: true });
  const flush = () => { if (buf.length) { appendFileSync(NDJ_OUT, buf.join('\n') + '\n'); buf = []; } };
  const rl = createInterface({ input: createReadStream(NDJ_IN), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const row = scoreEstab({
      estabelecimento_id: r.cnpj_completo,    // BR: chave natural = CNPJ
      cnpj_completo: r.cnpj_completo,
      cnpj_basico: r.cnpj_basico,
      cnae_principal: r.cnae_principal,
      is_matriz: !!r.is_matriz,
      has_email: !!r.has_email,
      has_phone: !!r.has_phone,
      has_fantasia: !!r.has_fantasia,
      company_age_years: r.company_age_years,
      qtd_estabelecimentos_grupo: r.qtd_estabelecimentos_grupo || 1,
      porte_empresa: r.porte_empresa ?? null,
      capital_social: r.capital_social ?? null,
      razao_social: r.razao_social ?? null,
    }, mapa, denySet, tetoMap, () => ({
      caged_contexto_score: r.caged_contexto_score ?? null,
      contexto_confianca: r.contexto_confianca ?? null,
      rais_tam_medio_setor: r.rais_tam_medio_setor ?? null,
    }));
    if (row.segmento_key == null) semSeg++;
    // score_explanation OMITIDO de propósito: ~2KB/linha → 58GB em 29M
    // (estourou disco). Não é usado por Stage 5/XLSX/carga Supabase, e
    // a Estratégia C já exclui o explanation por-linha do Supabase. Os
    // sub-scores (usados no XLSX) ficam.
    buf.push(JSON.stringify({
      cnpj_completo: row.cnpj_completo, cnpj_basico: r.cnpj_basico,
      score_total: row.score_total, score_dor_pessoas: row.score_dor_pessoas,
      score_capacidade_compra: row.score_capacidade_compra, score_fit_vertho: row.score_fit_vertho,
      score_contexto_setorial: row.score_contexto_setorial, classificacao: row.classificacao,
      score_confidence: row.score_confidence, commercial_actionability: row.commercial_actionability,
      low_team_probability: row.low_team_probability, elegivel: row.elegivel,
      segmento_key: row.segmento_key, scoring_version: row.scoring_version,
    }));
    n++;
    if (buf.length >= 50000) flush();
  }
  flush();
  rmSync(NDJ_IN, { force: true }); // consumido — libera ~metade do pico de disco (BR ~12GB)

  duck(`COPY (SELECT * FROM read_json_auto('${NDJ_OUT}', maximum_object_size=20000000))
         TO '${OUT}/scored.parquet' (FORMAT PARQUET);`);
  rmSync(NDJ_OUT, { force: true }); // já virou scored.parquet
  console.log(`[OK] ${n} scored · ${semSeg} excluídos (denylist) · `
    + `${Math.round((Date.now() - t0) / 1000)}s → ${OUT}/scored.parquet`);
  console.log('Próximo: Stage 5 (13_rank_redes.sql)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
