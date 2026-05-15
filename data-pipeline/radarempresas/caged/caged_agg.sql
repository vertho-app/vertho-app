-- ─────────────────────────────────────────────────────────────────────────
-- Radar Empresas — agregação CAGED (só CAGEDMOV, MVP)
--
-- Lê os CAGEDMOV*.txt extraídos (UTF-8, ';', header), Brasil todo, e
-- gera 6 agregados em Parquet local. Microdado bruto NÃO vai pro Supabase.
--
-- saldomovimentação: +1 = admissão, -1 = desligamento.
-- salário: decimal com vírgula → replace + CAST.
-- município: código IBGE 6 dígitos (nativo do CAGED).
--
-- Caminho dos .txt vem da env CAGED_TXT_DIR (setada pelo run_caged.ps1).
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

CREATE OR REPLACE TEMP TABLE mov AS
SELECT
  competenciamov                                            AS ano_mes,
  uf,
  municipio                                                 AS municipio_ibge,
  subclasse                                                 AS cnae,
  cbo,
  TRY_CAST(saldomov AS INTEGER)                             AS saldo_mov,
  TRY_CAST(replace(salario, ',', '.') AS DOUBLE)            AS salario
FROM read_csv(
  getenv('CAGED_TXT_DIR') || '/CAGEDMOV*.txt',
  delim = ';', header = true, encoding = 'utf-8',
  all_varchar = true, ignore_errors = true,
  names = ['competenciamov','regiao','uf','municipio','secao','subclasse',
           'saldomov','cbo','categoria','grauinstr','idade','horas',
           'racacor','sexo','tipoempreg','tipoestab','tipomov','tipodefic',
           'indintermit','indparcial','salario','tamestabjan','indaprendiz',
           'origeminfo','competenciadec','indforaprazo','unidsalcod','valorsalfixo']
)
WHERE saldomov IN ('1','-1');

-- ── Agregados mensais ────────────────────────────────────────────────────
COPY (
  SELECT ano_mes, uf, municipio_ibge, cnae,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos,
         SUM(saldo_mov)                                  AS saldo,
         ROUND(AVG(CASE WHEN saldo_mov = 1  THEN salario END), 2) AS sal_medio_adm,
         ROUND(AVG(CASE WHEN saldo_mov = -1 THEN salario END), 2) AS sal_medio_desl,
         COUNT(*)                                        AS volume
  FROM mov GROUP BY ano_mes, uf, municipio_ibge, cnae
) TO 'out/caged_municipio_cnae_mes.parquet' (FORMAT PARQUET);

COPY (
  SELECT ano_mes, uf, municipio_ibge, cbo,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos,
         SUM(saldo_mov)                                  AS saldo,
         ROUND(AVG(salario), 2)                          AS sal_medio,
         COUNT(*)                                        AS volume
  FROM mov GROUP BY ano_mes, uf, municipio_ibge, cbo
) TO 'out/caged_municipio_cbo_mes.parquet' (FORMAT PARQUET);

-- ── Agregados 6 meses ────────────────────────────────────────────────────
-- taxa_mov_proxy = (adm+desl)/nº_meses — intensidade mensal de movimentação.
-- É PROXY: CAGED é fluxo; taxa de rotatividade REAL exige estoque (RAIS).
COPY (
  SELECT uf, municipio_ibge, cnae,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes_6m,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos_6m,
         SUM(saldo_mov)                                  AS saldo_6m,
         ROUND(AVG(salario), 2)                          AS sal_medio_6m,
         COUNT(*)                                        AS volume_6m,
         ROUND(COUNT(*) / 6.0, 1)                        AS taxa_mov_proxy
  FROM mov GROUP BY uf, municipio_ibge, cnae
) TO 'out/caged_municipio_cnae_6m.parquet' (FORMAT PARQUET);

COPY (
  SELECT uf, municipio_ibge, cbo,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes_6m,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos_6m,
         SUM(saldo_mov)                                  AS saldo_6m,
         ROUND(AVG(salario), 2)                          AS sal_medio_6m,
         COUNT(*)                                        AS volume_6m
  FROM mov GROUP BY uf, municipio_ibge, cbo
) TO 'out/caged_municipio_cbo_6m.parquet' (FORMAT PARQUET);

COPY (
  SELECT cnae,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes_6m,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos_6m,
         SUM(saldo_mov)                                  AS saldo_6m,
         ROUND(AVG(salario), 2)                          AS sal_medio_6m,
         COUNT(*)                                        AS volume_6m
  FROM mov GROUP BY cnae
) TO 'out/caged_cnae_6m.parquet' (FORMAT PARQUET);

COPY (
  SELECT uf, municipio_ibge,
         SUM(CASE WHEN saldo_mov = 1  THEN 1 ELSE 0 END) AS admissoes_6m,
         SUM(CASE WHEN saldo_mov = -1 THEN 1 ELSE 0 END) AS desligamentos_6m,
         SUM(saldo_mov)                                  AS saldo_6m,
         COUNT(*)                                        AS volume_6m
  FROM mov GROUP BY uf, municipio_ibge
) TO 'out/caged_municipio_6m.parquet' (FORMAT PARQUET);

-- ── Sanity ───────────────────────────────────────────────────────────────
SELECT 'linhas_mov' AS check, COUNT(*) AS n FROM mov
UNION ALL SELECT 'meses', COUNT(DISTINCT ano_mes) FROM mov
UNION ALL SELECT 'municipios', COUNT(DISTINCT municipio_ibge) FROM mov
UNION ALL SELECT 'cnaes', COUNT(DISTINCT cnae) FROM mov
UNION ALL SELECT 'admissoes_total', SUM(CASE WHEN saldo_mov=1 THEN 1 ELSE 0 END) FROM mov
UNION ALL SELECT 'desligamentos_total', SUM(CASE WHEN saldo_mov=-1 THEN 1 ELSE 0 END) FROM mov;
