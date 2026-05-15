-- ─────────────────────────────────────────────────────────────────────────
-- Radar Empresas — pipeline DuckDB: recorte Jundiaí/SP
--
-- Lê os CSVs brutos da Receita (cp1252, ';', sem header), filtra
-- estabelecimentos ATIVOS de Jundiaí/SP, junta com Empresas + Cnae +
-- Municipio, gera campos derivados e exporta um Parquet único.
--
-- Caminho da base vem da env RECEITA_DIR (setada pelo run.ps1).
-- Tudo lido como VARCHAR (all_varchar) — parsing/tipagem é feito depois,
-- evita quebra em datas vazias / capital com vírgula.
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

-- Glob recursivo: arquivos podem estar em subpastas (Empresas0/, etc.)
-- getenv() lê a env exportada pelo run.ps1.

-- ── 1. Municípios: descobre o código Receita de Jundiaí ──────────────────
CREATE OR REPLACE TEMP TABLE municipios AS
SELECT
  column0 AS codigo,
  column1 AS nome
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.MUNICCSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true
);

CREATE OR REPLACE TEMP TABLE mun_jundiai AS
SELECT codigo, nome FROM municipios
WHERE strip_accents(upper(trim(nome))) = 'JUNDIAI';

-- ── 2. Estabelecimentos: filtra Jundiaí/SP ATIVO antes de qualquer JOIN ──
-- Layout oficial Receita: 30 colunas (col0..col29).
CREATE OR REPLACE TEMP TABLE estab_jundiai AS
SELECT
  column0  AS cnpj_basico,
  column1  AS cnpj_ordem,
  column2  AS cnpj_dv,
  column3  AS identificador_matriz_filial,   -- 1=matriz 2=filial
  column4  AS nome_fantasia,
  column5  AS situacao_cadastral,            -- 02=ativa
  column6  AS data_situacao_cadastral,
  column7  AS motivo_situacao_cadastral,
  column10 AS data_inicio_atividade,
  column11 AS cnae_fiscal_principal,
  column12 AS cnae_fiscal_secundaria,
  column13 AS tipo_logradouro,
  column14 AS logradouro,
  column15 AS numero,
  column16 AS complemento,
  column17 AS bairro,
  column18 AS cep,
  column19 AS uf,
  column20 AS municipio_cod,
  column21 AS ddd_1,
  column22 AS telefone_1,
  column23 AS ddd_2,
  column24 AS telefone_2,
  column27 AS correio_eletronico,
  column28 AS situacao_especial,
  column29 AS data_situacao_especial
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.ESTABELE',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true
)
WHERE column19 = 'SP'
  AND column5  = '02'                                   -- ativa
  AND column20 IN (SELECT codigo FROM mun_jundiai);

-- ── 3. Empresas: só os cnpj_basico que aparecem no recorte ───────────────
CREATE OR REPLACE TEMP TABLE empresas AS
SELECT
  column0 AS cnpj_basico,
  column1 AS razao_social,
  column2 AS natureza_juridica,
  column3 AS qualificacao_responsavel,
  column4 AS capital_social_raw,
  column5 AS porte_empresa,                  -- 00 NA / 01 ME / 03 EPP / 05 demais
  column6 AS ente_federativo_responsavel
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.EMPRECSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true
)
WHERE column0 IN (SELECT DISTINCT cnpj_basico FROM estab_jundiai);

-- ── 4. CNAE: catálogo (pequeno, carrega inteiro) ─────────────────────────
CREATE OR REPLACE TEMP TABLE cnaes AS
SELECT column0 AS codigo, column1 AS descricao
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.CNAECSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true
);

-- ── 5. Recorte final tratado ─────────────────────────────────────────────
CREATE OR REPLACE TEMP TABLE recorte AS
SELECT
  e.cnpj_basico,
  est.cnpj_ordem,
  est.cnpj_dv,
  -- cnpj_completo 14 dígitos (zero-padded)
  lpad(e.cnpj_basico, 8, '0')
    || lpad(est.cnpj_ordem, 4, '0')
    || lpad(est.cnpj_dv, 2, '0')                       AS cnpj_completo,
  e.razao_social,
  est.nome_fantasia,
  e.natureza_juridica,
  e.porte_empresa,
  -- capital social: "1234,56" → 1234.56
  TRY_CAST(replace(e.capital_social_raw, ',', '.') AS DOUBLE) AS capital_social_num,
  est.identificador_matriz_filial,
  (est.identificador_matriz_filial = '1')              AS is_matriz,
  est.situacao_cadastral,
  est.cnae_fiscal_principal,
  cn.descricao                                         AS cnae_principal_desc,
  est.cnae_fiscal_secundaria,
  est.uf,
  est.municipio_cod,
  mj.nome                                              AS municipio_nome,
  est.bairro,
  est.cep,
  nullif(trim(est.correio_eletronico), '')             AS email,
  nullif(trim(est.ddd_1 || est.telefone_1), '')        AS telefone_1,
  nullif(trim(est.ddd_2 || est.telefone_2), '')        AS telefone_2,
  (nullif(trim(est.correio_eletronico), '') IS NOT NULL) AS has_email,
  (nullif(trim(est.ddd_1 || est.telefone_1), '') IS NOT NULL) AS has_phone,
  (nullif(trim(est.nome_fantasia), '') IS NOT NULL)    AS has_fantasia,
  est.data_inicio_atividade,
  -- idade em anos (data formato AAAAMMDD)
  CASE
    WHEN length(est.data_inicio_atividade) = 8
    THEN date_diff(
           'year',
           strptime(est.data_inicio_atividade, '%Y%m%d')::DATE,
           current_date)
    ELSE NULL
  END                                                  AS company_age_years,
  true                                                 AS is_active,
  'receita-2026-05'                                    AS fonte_version
FROM estab_jundiai est
JOIN empresas e   ON e.cnpj_basico = est.cnpj_basico
LEFT JOIN cnaes cn ON cn.codigo = est.cnae_fiscal_principal
LEFT JOIN mun_jundiai mj ON mj.codigo = est.municipio_cod;

-- ── 6. Export ────────────────────────────────────────────────────────────
COPY recorte TO 'out/empresas_jundiai.parquet' (FORMAT PARQUET);

-- ── 7. Sanity check ──────────────────────────────────────────────────────
SELECT 'municipios_jundiai' AS check, COUNT(*) AS n FROM mun_jundiai
UNION ALL SELECT 'estab_jundiai_ativo', COUNT(*) FROM estab_jundiai
UNION ALL SELECT 'empresas_no_recorte', COUNT(*) FROM empresas
UNION ALL SELECT 'recorte_final', COUNT(*) FROM recorte
UNION ALL SELECT 'com_email', COUNT(*) FROM recorte WHERE has_email
UNION ALL SELECT 'com_telefone', COUNT(*) FROM recorte WHERE has_phone
UNION ALL SELECT 'matriz', COUNT(*) FROM recorte WHERE is_matriz;
