-- ============================================================================
-- 094: INSE proxy para escolas sem cobertura oficial Saeb
-- ============================================================================
--
-- IMPORTANTE — TIMEOUT DO SUPABASE STUDIO:
-- O gateway api.supabase.com (frontend do Studio) tem timeout fixo de ~60s
-- INDEPENDENTE do statement_timeout do Postgres. Se o "Failed to fetch"
-- aparecer aqui, NÃO é o Postgres falhando — é o gateway desistindo.
--
-- SOLUÇÃO RECOMENDADA: usar conexão direta ao Postgres, ignorando o gateway:
--   1. Supabase Dashboard → Project Settings → Database → Connection String
--   2. Copie a connection string "URI" (não Pooler — esse também tem limites)
--   3. Cole no `psql` ou em um cliente como DBeaver/TablePlus/pgAdmin
--   4. Execute toda esta migration de uma vez (não precisa dividir)
--
-- Como backup, deixei o script dividido em 3 etapas com SET statement_timeout.
-- Use a Etapa 1 sozinha se quiser tentar no Studio (90% do trabalho está aí
-- e ela rodando isolada cabe mais no limite do gateway).
--
-- OTIMIZAÇÃO: troquei LATERAL JOIN por DISTINCT ON, que é 5-10x mais rápido
-- em tabelas como diag_censo_docentes/infra (poucos anos por escola).
--
-- INSE proxy = média ponderada de sinais do Censo Escolar que correlacionam
-- com nível socioeconômico:
--   20% score_pedagogica · 15% conectividade · 15% basica · 10% climatização
--   10% devices/aluno · 10% lab_ciencias · 10% quadra_coberta
--   5% auditório · 5% % docs pós-graduados
--
-- ============================================================================
-- ETAPA 1: Pré-computa tabela auxiliar com sinais brutos extraídos
-- ============================================================================
-- Cria uma tabela TEMPORÁRIA persistida (DROP no fim da ETAPA 3 ou rerun).
-- Esse passo aceita o gargalo do LATERAL JOIN + JSONB extract — mas como é
-- INSERT em vez de MV, podemos paralelizar e o resultado fica indexado.

SET statement_timeout = '15min';

DROP TABLE IF EXISTS _tmp_mercado_escola_raw;

-- DISTINCT ON puxa só a última linha por escola — muito mais rápido que
-- LATERAL JOIN com ORDER BY ano DESC LIMIT 1 (índice já existe nas duas).
CREATE TABLE _tmp_mercado_escola_raw AS
WITH censo_docentes_latest AS (
  SELECT DISTINCT ON (codigo_inep) *
  FROM diag_censo_docentes
  ORDER BY codigo_inep, ano DESC
),
censo_infra_latest AS (
  SELECT DISTINCT ON (codigo_inep) *
  FROM diag_censo_infra
  ORDER BY codigo_inep, ano DESC
)
SELECT
  e.codigo_inep,
  e.nome,
  e.municipio,
  e.municipio_ibge,
  e.uf,
  e.rede,
  e.microrregiao,
  e.inse_grupo,
  e.etapas,
  COALESCE(d.qt_doc_bas, 0)                             AS qt_professores,
  COALESCE(d.qt_doc_bas_0_24, 0) + COALESCE(d.qt_doc_bas_25_29, 0)
                                                        AS qt_docs_jovens,
  COALESCE(d.qt_doc_bas_esco_sup_pos_espec, 0)
    + COALESCE(d.qt_doc_bas_esco_sup_pos_mestra, 0)
    + COALESCE(d.qt_doc_bas_esco_sup_pos_douto, 0)      AS qt_docs_pos,
  COALESCE((i.quantidades->>'QT_PROF_COORDENADOR')::int, 0)
    + COALESCE((i.quantidades->>'QT_PROF_PEDAGOGIA')::int, 0)
                                                        AS qt_coord_pedag,
  1                                                     AS qt_diretor_proxy,
  i.score_conectividade,
  i.score_pedagogica,
  i.score_basica,
  COALESCE((i.indicadores->>'IN_CLIMATIZACAO')::int, 0)            AS in_climatizacao,
  COALESCE((i.indicadores->>'IN_LABORATORIO_CIENCIAS')::int, 0)    AS in_lab_ciencias,
  COALESCE((i.indicadores->>'IN_QUADRA_ESPORTES_COBERTA')::int, 0) AS in_quadra_coberta,
  COALESCE((i.indicadores->>'IN_AUDITORIO')::int, 0)               AS in_auditorio,
  COALESCE((i.quantidades->>'QT_DESKTOP_ALUNO')::int, 0)
    + COALESCE((i.quantidades->>'QT_COMP_PORTATIL_ALUNO')::int, 0)
    + COALESCE((i.quantidades->>'QT_TABLET_ALUNO')::int, 0)        AS qt_devices_aluno
FROM diag_escolas e
LEFT JOIN censo_docentes_latest d ON d.codigo_inep = e.codigo_inep
LEFT JOIN censo_infra_latest i ON i.codigo_inep = e.codigo_inep
WHERE e.status = 'ativa';

CREATE INDEX ON _tmp_mercado_escola_raw(codigo_inep);
CREATE INDEX ON _tmp_mercado_escola_raw(municipio_ibge, rede);
CREATE INDEX ON _tmp_mercado_escola_raw(uf, rede);

-- ============================================================================
-- ETAPA 2: Cria MV de escola a partir da tabela auxiliar (rápido)
-- Rode este bloco separadamente no Studio, depois que a ETAPA 1 terminar.
-- ============================================================================

SET statement_timeout = '15min';

DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_escola CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_escola AS
WITH scored AS (
  SELECT *,
    (
      0.20 * COALESCE(score_pedagogica, 0)
      + 0.15 * COALESCE(score_conectividade, 0)
      + 0.15 * COALESCE(score_basica, 0)
      + 0.10 * (in_climatizacao * 100)
      + 0.10 * LEAST(100, qt_devices_aluno * 5.0)
      + 0.10 * (in_lab_ciencias * 100)
      + 0.10 * (in_quadra_coberta * 100)
      + 0.05 * (in_auditorio * 100)
      + 0.05 * LEAST(100, (qt_docs_pos::numeric * 100.0 / NULLIF(qt_professores, 0)))
    )::numeric(5,2) AS inse_proxy_score
  FROM _tmp_mercado_escola_raw
)
SELECT *,
  CASE
    WHEN inse_proxy_score < 15 THEN 1
    WHEN inse_proxy_score < 35 THEN 2
    WHEN inse_proxy_score < 55 THEN 3
    WHEN inse_proxy_score < 75 THEN 4
    WHEN inse_proxy_score < 90 THEN 5
    ELSE 6
  END::smallint AS inse_proxy_grupo,
  COALESCE(
    inse_grupo,
    CASE
      WHEN inse_proxy_score < 15 THEN 1
      WHEN inse_proxy_score < 35 THEN 2
      WHEN inse_proxy_score < 55 THEN 3
      WHEN inse_proxy_score < 75 THEN 4
      WHEN inse_proxy_score < 90 THEN 5
      ELSE 6
    END
  )::smallint AS inse_efetivo,
  CASE WHEN inse_grupo IS NOT NULL THEN 'oficial' ELSE 'inferido' END AS inse_fonte
FROM scored;

CREATE UNIQUE INDEX idx_mv_mercado_escola_inep
  ON diag_mv_mercado_escola(codigo_inep);
CREATE INDEX idx_mv_mercado_escola_uf
  ON diag_mv_mercado_escola(uf, rede);
CREATE INDEX idx_mv_mercado_escola_municipio
  ON diag_mv_mercado_escola(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_escola_inse
  ON diag_mv_mercado_escola(inse_efetivo);

-- ============================================================================
-- ETAPA 3: Recria MVs agregadas (municipio + rede) + função refresh + cleanup
-- Rode após a ETAPA 2 concluir.
-- ============================================================================

SET statement_timeout = '5min';

CREATE MATERIALIZED VIEW diag_mv_mercado_municipio AS
SELECT
  municipio_ibge,
  MIN(municipio)                                          AS municipio,
  MIN(uf)                                                 AS uf,
  MIN(microrregiao)                                       AS microrregiao,
  COUNT(*)                                                AS qt_escolas,
  COUNT(*) FILTER (WHERE rede = 'MUNICIPAL')              AS qt_escolas_municipal,
  COUNT(*) FILTER (WHERE rede = 'ESTADUAL')               AS qt_escolas_estadual,
  COUNT(*) FILTER (WHERE rede = 'FEDERAL')                AS qt_escolas_federal,
  COUNT(*) FILTER (WHERE rede = 'PRIVADA')                AS qt_escolas_privada,
  SUM(qt_professores)                                     AS qt_professores,
  SUM(qt_docs_jovens)                                     AS qt_docs_jovens,
  SUM(qt_docs_pos)                                        AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                  AS qt_gestores,
  AVG(inse_efetivo) FILTER (WHERE inse_efetivo IS NOT NULL) AS inse_medio,
  ROUND(100.0 * COUNT(*) FILTER (WHERE inse_fonte = 'oficial') / NULLIF(COUNT(*), 0), 1)
                                                          AS pct_inse_oficial,
  AVG(score_conectividade)                                AS score_conectividade
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge;

CREATE UNIQUE INDEX idx_mv_mercado_municipio_ibge
  ON diag_mv_mercado_municipio(municipio_ibge);
CREATE INDEX idx_mv_mercado_municipio_uf
  ON diag_mv_mercado_municipio(uf);

CREATE MATERIALIZED VIEW diag_mv_mercado_rede AS
SELECT
  municipio_ibge,
  MIN(municipio)                                          AS municipio,
  MIN(uf)                                                 AS uf,
  rede,
  COUNT(*)                                                AS qt_escolas,
  SUM(qt_professores)                                     AS qt_professores,
  SUM(qt_docs_jovens)                                     AS qt_docs_jovens,
  SUM(qt_docs_pos)                                        AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                  AS qt_gestores,
  AVG(inse_efetivo) FILTER (WHERE inse_efetivo IS NOT NULL) AS inse_medio,
  ROUND(100.0 * COUNT(*) FILTER (WHERE inse_fonte = 'oficial') / NULLIF(COUNT(*), 0), 1)
                                                          AS pct_inse_oficial
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge, rede;

CREATE UNIQUE INDEX idx_mv_mercado_rede_pk
  ON diag_mv_mercado_rede(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_rede_uf
  ON diag_mv_mercado_rede(uf, rede);

CREATE OR REPLACE FUNCTION refresh_mv_mercado_potencial() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_escola;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_municipio;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_rede;
END $$ LANGUAGE plpgsql;

COMMENT ON COLUMN diag_mv_mercado_escola.inse_proxy_score IS
'INSE proxy 0-100 composto a partir de sinais do Censo Escolar (score_*, IN_*, QT_*).
Correlaciona com nível socioeconômico mas NÃO é equivalente ao questionário INEP.
Usar com cautela em públicas federais (IFs) e privadas comunitárias antigas.';

COMMENT ON COLUMN diag_mv_mercado_escola.inse_fonte IS
'Indica se inse_efetivo vem do questionário INEP (oficial) ou do proxy do Censo (inferido).
Mostrar badge "~" na UI quando inferido pra deixar o usuário ciente do viés.';

-- Cleanup: a tabela auxiliar não é mais necessária. Comente esta linha se
-- quiser manter pra debug/reanálise.
DROP TABLE IF EXISTS _tmp_mercado_escola_raw;
