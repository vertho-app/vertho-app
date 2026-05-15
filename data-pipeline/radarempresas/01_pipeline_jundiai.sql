-- ─────────────────────────────────────────────────────────────────────────
-- Radar Empresas — pipeline DuckDB: recorte Jundiaí/SP
--
-- Lê os CSVs brutos da Receita (cp1252, ';', sem header), filtra
-- estabelecimentos ATIVOS de Jundiaí/SP, junta com Empresas + Cnae +
-- Municipio, gera campos derivados e exporta um Parquet único.
--
-- Caminho da base vem da env RECEITA_DIR (setada pelo run.ps1).
-- Colunas nomeadas via `names=[...]` (não depender do auto-naming do
-- DuckDB, que varia column0 vs column00 conforme o nº de colunas).
-- Tudo VARCHAR — tipagem é feita depois com TRY_CAST.
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

-- ── 1. Municípios: descobre o código Receita de Jundiaí ──────────────────
CREATE OR REPLACE TEMP TABLE municipios AS
SELECT codigo, nome
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.MUNICCSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true,
  names = ['codigo','nome']
);

CREATE OR REPLACE TEMP TABLE mun_jundiai AS
SELECT codigo, nome FROM municipios
WHERE strip_accents(upper(trim(nome))) = 'JUNDIAI';

-- ── 2. Estabelecimentos: filtra Jundiaí/SP ATIVO antes de qualquer JOIN ──
-- Layout oficial Receita: 30 colunas.
CREATE OR REPLACE TEMP TABLE estab_jundiai AS
SELECT
  cnpj_basico, cnpj_ordem, cnpj_dv, identificador_matriz_filial,
  nome_fantasia, situacao_cadastral, data_situacao_cadastral,
  motivo_situacao_cadastral, data_inicio_atividade,
  cnae_fiscal_principal, cnae_fiscal_secundaria,
  tipo_logradouro, logradouro, numero, complemento, bairro, cep,
  uf, municipio_cod, ddd_1, telefone_1, ddd_2, telefone_2,
  correio_eletronico, situacao_especial, data_situacao_especial
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.ESTABELE',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true,
  names = [
    'cnpj_basico','cnpj_ordem','cnpj_dv','identificador_matriz_filial',
    'nome_fantasia','situacao_cadastral','data_situacao_cadastral',
    'motivo_situacao_cadastral','nome_cidade_exterior','pais',
    'data_inicio_atividade','cnae_fiscal_principal','cnae_fiscal_secundaria',
    'tipo_logradouro','logradouro','numero','complemento','bairro','cep',
    'uf','municipio_cod','ddd_1','telefone_1','ddd_2','telefone_2',
    'ddd_fax','fax','correio_eletronico','situacao_especial','data_situacao_especial'
  ]
)
WHERE uf = 'SP'
  AND situacao_cadastral = '02'                          -- ativa
  AND municipio_cod IN (SELECT codigo FROM mun_jundiai);

-- ── 3. Empresas: só os cnpj_basico do recorte ────────────────────────────
CREATE OR REPLACE TEMP TABLE empresas AS
SELECT cnpj_basico, razao_social, natureza_juridica,
       qualificacao_responsavel, capital_social_raw, porte_empresa,
       ente_federativo_responsavel
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.EMPRECSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true,
  names = ['cnpj_basico','razao_social','natureza_juridica',
           'qualificacao_responsavel','capital_social_raw','porte_empresa',
           'ente_federativo_responsavel']
)
WHERE cnpj_basico IN (SELECT DISTINCT cnpj_basico FROM estab_jundiai);

-- ── 4. CNAE: catálogo ────────────────────────────────────────────────────
CREATE OR REPLACE TEMP TABLE cnaes AS
SELECT codigo, descricao
FROM read_csv(
  getenv('RECEITA_DIR') || '/**/*.CNAECSV',
  delim = ';', header = false, quote = '"', escape = '"',
  encoding = 'latin-1', all_varchar = true, ignore_errors = true,
  names = ['codigo','descricao']
);

-- ── 5. Recorte final tratado ─────────────────────────────────────────────
CREATE OR REPLACE TEMP TABLE recorte AS
SELECT
  e.cnpj_basico,
  est.cnpj_ordem,
  est.cnpj_dv,
  lpad(e.cnpj_basico, 8, '0')
    || lpad(est.cnpj_ordem, 4, '0')
    || lpad(est.cnpj_dv, 2, '0')                       AS cnpj_completo,
  e.razao_social,
  est.nome_fantasia,
  e.natureza_juridica,
  e.porte_empresa,
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
  CASE
    WHEN length(est.data_inicio_atividade) = 8
    THEN date_diff('year',
           strptime(est.data_inicio_atividade, '%Y%m%d')::DATE, current_date)
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
