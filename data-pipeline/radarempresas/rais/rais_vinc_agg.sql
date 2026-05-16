-- ─────────────────────────────────────────────────────────────────────────
-- Radar Empresas — agregação RAIS_VINC → contexto município×CNAE
--
-- O Rodrigo tem RAIS_VINC (vínculo-a-vínculo), não RAIS_ESTAB. VINC é
-- mais granular e produz o MESMO sinal que o Stage 3 precisa:
--   estoque_vinculos  = COUNT de vínculos ativos em 31/12 (c11='1')
--   tam_medio_estimado = média do ponto-médio da faixa de tamanho do
--                        estabelecimento (c38), sobre vínculos ativos
-- Saída idêntica em schema/nome ao rais_estab_agg → drop-in pro Stage 3.
--
-- Layout RAIS_VINC_PUB .COMT: vírgula, aspas ", latin-1, COM header
-- (62 col). DuckDB lê o header latin-1 corretamente — referenciamos
-- pelos NOMES (confirmados via DESCRIBE). Colunas-chave:
--   "Ind Vínculo Ativo 31/12 - Código" (1 = ativo em 31/12 → estoque)
--   "Município - Código" (IBGE 6 díg) · "CNAE 2.0 Subclasse - Codigo"
--   (7 díg, espaço à esquerda) · "Tamanho Estabelecimento - Código" (1..10)
--
-- Nota (fiel, não-drift): RAIS_ESTAB dava média ESTAB-ponderada; VINC dá
-- VÍNCULO-ponderada. Pro gate low_team (tam_setor>=10 = "setor tem
-- equipe") é equivalente/melhor (reflete onde os trabalhadores estão).
--
-- .COMT extraídos vêm de RAIS_VINC_DIR (run_rais_vinc.ps1). Saída em OUT_DIR.
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

CREATE OR REPLACE TEMP TABLE vinc AS
SELECT
  trim("Município - Código")                                  AS municipio_ibge,
  regexp_replace(trim("CNAE 2.0 Subclasse - Codigo"), '\D', '', 'g') AS cnae,
  (trim("Ind Vínculo Ativo 31/12 - Código") = '1')            AS ativo_3112,
  TRY_CAST(trim("Tamanho Estabelecimento - Código") AS INTEGER) AS tam_cod
FROM read_csv(
  getenv('RAIS_VINC_DIR') || '/*.COMT',
  delim = ',', quote = '"', header = true,
  encoding = 'latin-1', all_varchar = true, ignore_errors = true
)
WHERE "Município - Código" IS NOT NULL
  AND "CNAE 2.0 Subclasse - Codigo" IS NOT NULL;

-- ponto médio da faixa de tamanho RAIS (mesma escala do rais_estab_agg)
CREATE OR REPLACE TEMP MACRO tam_medio(c) AS (
  CASE c WHEN 1 THEN 0 WHEN 2 THEN 2.5 WHEN 3 THEN 7 WHEN 4 THEN 14.5
         WHEN 5 THEN 34.5 WHEN 6 THEN 74.5 WHEN 7 THEN 174.5
         WHEN 8 THEN 374.5 WHEN 9 THEN 749.5 WHEN 10 THEN 1500 ELSE NULL END
);

-- ── municipio × cnae (schema/nome = rais_estab_agg → Stage 3 dropa direto)
COPY (
  SELECT
    municipio_ibge,
    cnae,
    SUM(CASE WHEN ativo_3112 THEN 1 ELSE 0 END)            AS estoque_vinculos,
    ROUND(AVG(CASE WHEN ativo_3112 THEN tam_medio(tam_cod) END), 1)
                                                            AS tam_medio_estimado,
    COUNT(*)                                                AS vinculos_total
  FROM vinc
  WHERE cnae <> ''
  GROUP BY municipio_ibge, cnae
) TO (getenv('OUT_DIR') || '/rais_estab_municipio_cnae.parquet')
  (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- ── sanity ───────────────────────────────────────────────────────────────
SELECT 'vinculos_lidos'  AS check, COUNT(*) FROM vinc
UNION ALL SELECT 'ativos_3112',   SUM(CASE WHEN ativo_3112 THEN 1 ELSE 0 END) FROM vinc
UNION ALL SELECT 'municipios',    COUNT(DISTINCT municipio_ibge) FROM vinc
UNION ALL SELECT 'cnaes',         COUNT(DISTINCT cnae) FROM vinc
UNION ALL SELECT 'linhas_saida',  COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/rais_estab_municipio_cnae.parquet');
