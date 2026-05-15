-- ─────────────────────────────────────────────────────────────────────────
-- Radar Empresas — agregação RAIS_ESTAB (estoque/porte de emprego formal)
--
-- Fonte: RAIS Estabelecimento pública (RAIS_ESTAB_PUB.COMT), ano-base
-- mais recente. latin-1 / vírgula / header / aspas. DuckDB lê direto
-- (sem texto livre — só códigos, sem byte sujo). Microdado NÃO sobe.
--
-- RAIS_ESTAB é anonimizada (SEM CNPJ) → contexto município×CNAE/porte,
-- não empresa-a-empresa. Casa com estabelecimento/CAGED via
-- (município IBGE 6díg, CNAE subclasse 7díg).
--
-- LIMITAÇÕES (item 8 do escopo):
--   - RAIS_ESTAB não tem salário/massa salarial (isso é RAIS_VINC).
--     Aqui: qtd estabelecimentos, estoque de vínculos, faixa de porte.
--   - Estoque = "Qtd Vínculos Ativos" (col 7). Vínculos CLT/Estatutários
--     existem mas usamos Ativos como medida principal.
--   - Estabelecimentos com 0 vínculos (RAIS negativa) entram na contagem
--     mas com estoque 0 — relevante pra densidade do setor.
--
-- Caminho do .COMT vem da env RAIS_ESTAB_FILE (run_rais.ps1).
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

CREATE OR REPLACE TEMP TABLE estab AS
SELECT
  trim(uf)             AS uf,
  trim(municipio)      AS municipio_ibge,
  trim(cnae_sub)       AS cnae,
  TRY_CAST(trim(tam) AS INTEGER)         AS tam_cod,
  TRY_CAST(trim(vinc_ativos) AS INTEGER) AS vinc_ativos
FROM read_csv(
  getenv('RAIS_ESTAB_FILE'),
  delim = ',', header = true, quote = '"', encoding = 'latin-1',
  all_varchar = true, ignore_errors = true,
  names = ['b_sp','b_for','b_rj','cnae_classe','cnae95','distr_sp',
           'vinc_clt','vinc_ativos','vinc_estat','ind_ativ','ind_cei',
           'ind_pat','ind_negativa','ind_simples','municipio','natjur',
           'col16','cnae_sub','tam','col19','uf','col21','col22']
);

-- Faixa de porte (RAIS oficial) + ponto médio p/ tamanho estimado
CREATE OR REPLACE TEMP MACRO tam_medio(c) AS (
  CASE c WHEN 1 THEN 0 WHEN 2 THEN 2.5 WHEN 3 THEN 7 WHEN 4 THEN 14.5
         WHEN 5 THEN 34.5 WHEN 6 THEN 74.5 WHEN 7 THEN 174.5
         WHEN 8 THEN 374.5 WHEN 9 THEN 749.5 WHEN 10 THEN 1500 ELSE NULL END
);
CREATE OR REPLACE TEMP MACRO tam_label(c) AS (
  CASE c WHEN 1 THEN '0' WHEN 2 THEN '1-4' WHEN 3 THEN '5-9'
         WHEN 4 THEN '10-19' WHEN 5 THEN '20-49' WHEN 6 THEN '50-99'
         WHEN 7 THEN '100-249' WHEN 8 THEN '250-499' WHEN 9 THEN '500-999'
         WHEN 10 THEN '1000+' ELSE 'NA' END
);

-- ── municipio × cnae ─────────────────────────────────────────────────────
COPY (
  SELECT uf, municipio_ibge, cnae,
         COUNT(*)                                    AS qtd_estab,
         SUM(COALESCE(vinc_ativos,0))                AS estoque_vinculos,
         ROUND(AVG(NULLIF(vinc_ativos,0)), 1)        AS vinc_medio,
         ROUND(AVG(tam_medio(tam_cod)), 1)           AS tam_medio_estimado
  FROM estab GROUP BY uf, municipio_ibge, cnae
) TO 'out/rais_estab_municipio_cnae.parquet' (FORMAT PARQUET);

-- ── municipio × porte ────────────────────────────────────────────────────
COPY (
  SELECT uf, municipio_ibge, tam_cod,
         tam_label(tam_cod)                          AS faixa,
         COUNT(*)                                    AS qtd_estab,
         SUM(COALESCE(vinc_ativos,0))                AS estoque_vinculos
  FROM estab GROUP BY uf, municipio_ibge, tam_cod
) TO 'out/rais_estab_municipio_porte.parquet' (FORMAT PARQUET);

-- ── cnae nacional ────────────────────────────────────────────────────────
COPY (
  SELECT cnae,
         COUNT(*)                                    AS qtd_estab,
         SUM(COALESCE(vinc_ativos,0))                AS estoque_vinculos,
         ROUND(AVG(tam_medio(tam_cod)), 1)           AS tam_medio_estimado
  FROM estab GROUP BY cnae
) TO 'out/rais_estab_cnae.parquet' (FORMAT PARQUET);

-- ── municipio nacional ───────────────────────────────────────────────────
COPY (
  SELECT uf, municipio_ibge,
         COUNT(*)                                    AS qtd_estab,
         SUM(COALESCE(vinc_ativos,0))                AS estoque_vinculos
  FROM estab GROUP BY uf, municipio_ibge
) TO 'out/rais_estab_municipio.parquet' (FORMAT PARQUET);

-- ── Sanity ───────────────────────────────────────────────────────────────
SELECT 'estab_total' AS check, COUNT(*) AS n FROM estab
UNION ALL SELECT 'municipios', COUNT(DISTINCT municipio_ibge) FROM estab
UNION ALL SELECT 'cnaes', COUNT(DISTINCT cnae) FROM estab
UNION ALL SELECT 'estoque_total', SUM(COALESCE(vinc_ativos,0)) FROM estab
UNION ALL SELECT 'jundiai_estab', COUNT(*) FROM estab WHERE municipio_ibge='352590'
UNION ALL SELECT 'jundiai_estoque', SUM(COALESCE(vinc_ativos,0)) FROM estab WHERE municipio_ibge='352590';
