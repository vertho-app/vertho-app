-- ─────────────────────────────────────────────────────────────────────────
-- Stage 2 (BR) — ingest Receita: join + filtro + derivações → Parquet
--
-- Lê os utf-8 do Stage 1 (UTF8_DIR), faz estab⋈empresa⋈cnae⋈municipio
-- out-of-core, filtra situação ATIVA (02), deriva as colunas que o motor
-- de score (lib/radarempresas/score.ts) consome, particiona por UF.
--
-- Layout Receita (cp1252→utf8, ';', SEM header, quote '"'):
--  ESTABELE 30 col: 0 cnpj_basico,1 ordem,2 dv,3 matriz_filial(1/2),
--   4 fantasia,5 situacao,10 data_inicio,11 cnae_princ,12 cnae_sec,
--   17 bairro,18 cep,19 uf,20 municipio,21 ddd1,22 tel1,23 ddd2,
--   24 tel2,27 email
--  EMPRECSV 7 col: 0 cnpj_basico,1 razao_social,2 nat_jur,4 capital
--   (decimal vírgula),5 porte
--  CNAECSV: 0 codigo,1 descricao · MUNICCSV: 0 codigo,1 nome
--
-- CORRIGE o bug is_matriz=100%-true: não vinha do Python (r[3]=="1"
-- estava certo) e sim do loader 04 (`!!"false"` === true em JS). Aqui
-- is_matriz é BOOLEAN real (col3='1') gravado no Parquet.
--
-- `names=[...]` explícito evita o bug "column5 not found" do DuckDB com
-- ≥10 colunas sem header. Env: UTF8_DIR, OUT_DIR, REF_DATE (YYYY-MM-DD).
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

-- ── fontes (todas all_varchar — derivação/cast explícito depois) ─────────
CREATE OR REPLACE TEMP TABLE cnae AS
SELECT col0 AS codigo, col1 AS descricao
FROM read_csv(getenv('UTF8_DIR') || '/*.CNAECSV.utf8.csv',
  delim=';', header=false, quote='"', all_varchar=true, ignore_errors=true,
  names=['col0','col1']);

CREATE OR REPLACE TEMP TABLE munic AS
SELECT col0 AS codigo, col1 AS nome
FROM read_csv(getenv('UTF8_DIR') || '/*.MUNICCSV.utf8.csv',
  delim=';', header=false, quote='"', all_varchar=true, ignore_errors=true,
  names=['col0','col1']);

CREATE OR REPLACE TEMP TABLE emp AS
SELECT
  col0 AS cnpj_basico,
  col1 AS razao_social,
  col2 AS natureza_juridica,
  TRY_CAST(replace(col4, ',', '.') AS DOUBLE) AS capital_social,
  col5 AS porte_empresa
FROM read_csv(getenv('UTF8_DIR') || '/*.EMPRECSV.utf8.csv',
  delim=';', header=false, quote='"', all_varchar=true, ignore_errors=true,
  names=['col0','col1','col2','col3','col4','col5','col6']);

-- ESTABELE: 30 colunas; só ativa (situação '02')
CREATE OR REPLACE TEMP TABLE est AS
SELECT
  col0 AS cnpj_basico,
  col1 AS cnpj_ordem,
  col2 AS cnpj_dv,
  (col3 = '1')                              AS is_matriz,   -- ← bug corrigido
  col4 AS nome_fantasia,
  col5 AS situacao_cadastral,
  col10 AS data_inicio_atividade,
  col11 AS cnae_principal,
  col12 AS cnae_secundaria,
  col17 AS bairro,
  col18 AS cep,
  col19 AS uf,
  col20 AS municipio_cod,
  nullif(trim(col21 || col22), '')          AS telefone_1,
  nullif(trim(col23 || col24), '')          AS telefone_2,
  nullif(trim(col27), '')                   AS email
FROM read_csv(getenv('UTF8_DIR') || '/*.ESTABELE.utf8.csv',
  delim=';', header=false, quote='"', all_varchar=true, ignore_errors=true,
  names=['col0','col1','col2','col3','col4','col5','col6','col7','col8',
         'col9','col10','col11','col12','col13','col14','col15','col16',
         'col17','col18','col19','col20','col21','col22','col23','col24',
         'col25','col26','col27','col28','col29'])
WHERE col5 = '02';

-- nº de estabelecimentos ATIVOS por empresa (operação distribuída → score)
CREATE OR REPLACE TEMP TABLE grp AS
SELECT cnpj_basico, COUNT(*) AS qtd_estabelecimentos_grupo
FROM est GROUP BY cnpj_basico;

-- ── join + derivações → Parquet particionado por UF ──────────────────────
COPY (
  SELECT
    lpad(e.cnpj_basico, 8, '0') || lpad(e.cnpj_ordem, 4, '0')
      || lpad(e.cnpj_dv, 2, '0')                          AS cnpj_completo,
    e.cnpj_basico,
    e.cnpj_ordem,
    e.cnpj_dv,
    e.is_matriz,
    nullif(e.nome_fantasia, '')                           AS nome_fantasia,
    e.situacao_cadastral,
    TRUE                                                  AS is_active,
    e.cnae_principal,
    c.descricao                                           AS cnae_principal_desc,
    e.cnae_secundaria,
    e.uf,
    e.municipio_cod,
    m.nome                                                AS municipio_nome,
    cw.municipio_ibge,   -- ponte Receita→IBGE 6díg (CAGED/RAIS/contexto)
    e.bairro, e.cep, e.email, e.telefone_1, e.telefone_2,
    (e.email IS NOT NULL)                                 AS has_email,
    (e.telefone_1 IS NOT NULL)                            AS has_phone,
    (nullif(e.nome_fantasia,'') IS NOT NULL)              AS has_fantasia,
    e.data_inicio_atividade,
    -- idade em anos cheios vs REF_DATE (TRY: datas sujas viram NULL)
    CASE WHEN length(e.data_inicio_atividade) = 8
         AND TRY_CAST(e.data_inicio_atividade AS BIGINT) IS NOT NULL
      THEN floor(datediff('day',
             TRY_CAST(strptime(e.data_inicio_atividade, '%Y%m%d') AS DATE),
             CAST(getenv('REF_DATE') AS DATE)) / 365.0)::INTEGER
      END                                                 AS company_age_years,
    g.qtd_estabelecimentos_grupo,
    emp.razao_social,
    emp.natureza_juridica,
    emp.capital_social,
    emp.porte_empresa,
    'receita-' || strftime(CAST(getenv('REF_DATE') AS DATE), '%Y-%m')
                                                          AS fonte_version
  FROM est e
  JOIN emp        ON emp.cnpj_basico = e.cnpj_basico
  JOIN grp g      ON g.cnpj_basico   = e.cnpj_basico
  LEFT JOIN cnae c ON c.codigo       = e.cnae_principal
  LEFT JOIN munic m ON m.codigo      = e.municipio_cod
  -- crosswalk por (UF, nome normalizado canônico) → municipio_ibge
  LEFT JOIN read_parquet(getenv('OUT_DIR') || '/crosswalk_ibge.parquet') cw
    ON cw.uf = e.uf
   AND cw.nome_norm = trim(regexp_replace(regexp_replace(
         upper(strip_accents(coalesce(m.nome,''))),
         '[^A-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g'))
) TO (getenv('OUT_DIR') || '/base') (FORMAT PARQUET, PARTITION_BY (uf),
                 OVERWRITE_OR_IGNORE true, FILENAME_PATTERN 'estab_{i}');

-- ── sanity ───────────────────────────────────────────────────────────────
SELECT 'estab_ativos'  AS check, COUNT(*) FROM est
UNION ALL SELECT 'empresas',     COUNT(*) FROM emp
UNION ALL SELECT 'municipios',   COUNT(*) FROM munic
UNION ALL SELECT 'cnaes',        COUNT(*) FROM cnae
UNION ALL SELECT 'is_matriz_true',  (SELECT COUNT(*) FROM est WHERE is_matriz)
UNION ALL SELECT 'is_matriz_false', (SELECT COUNT(*) FROM est WHERE NOT is_matriz);
