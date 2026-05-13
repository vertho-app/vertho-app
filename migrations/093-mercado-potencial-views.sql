-- ============================================================================
-- 093: Mapeamento de mercado potencial (uso interno comercial — Vertho)
-- ============================================================================
--
-- 3 MVs agregando Censo Escolar + INSE pra alimentar /admin/vertho/mercado-potencial.
-- Saeb, Ideb, VAAR, ENEM ficam fora destas MVs — são puxados via JOIN em runtime
-- das MVs existentes (diag_mv_municipio_saeb_agg, etc) pra evitar duplicar storage.
--
-- Estrutura:
--   diag_mv_mercado_escola     — 1 linha por escola ativa (base granular)
--   diag_mv_mercado_municipio  — agregação por município (sem distinguir rede)
--   diag_mv_mercado_rede       — agregação por (município, rede administrativa)
--
-- Gestor escolar = QT_PROF_COORDENADOR + QT_PROF_PEDAGOGIA + 1 diretor/escola
-- (diretor é universal — toda escola ativa tem 1; proxy mais preciso que o
-- campo QT_PROF_DIRETOR que não existe no Censo INEP).
--
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY <nome> (manual ou via job).
-- ============================================================================

-- ── 1. Escola (base granular) ──────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_escola CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_escola AS
SELECT
  e.codigo_inep,
  e.nome,
  e.municipio,
  e.municipio_ibge,
  e.uf,
  e.rede,                                                 -- MUNICIPAL/ESTADUAL/FEDERAL/PRIVADA
  e.microrregiao,
  e.inse_grupo,
  e.etapas,
  -- Censo docentes (último ano disponível por escola — não usa MAX global)
  COALESCE(d.qt_doc_bas, 0)                             AS qt_professores,
  COALESCE(d.qt_doc_bas_0_24, 0) + COALESCE(d.qt_doc_bas_25_29, 0)
                                                        AS qt_docs_jovens,
  COALESCE(d.qt_doc_bas_esco_sup_pos_espec, 0)
    + COALESCE(d.qt_doc_bas_esco_sup_pos_mestra, 0)
    + COALESCE(d.qt_doc_bas_esco_sup_pos_douto, 0)      AS qt_docs_pos,
  -- Gestores: coordenadores (do Censo Infra) + 1 diretor proxy por escola
  COALESCE((i.quantidades->>'QT_PROF_COORDENADOR')::int, 0)
    + COALESCE((i.quantidades->>'QT_PROF_PEDAGOGIA')::int, 0)
                                                        AS qt_coord_pedag,
  1                                                     AS qt_diretor_proxy,
  -- Scores de infra (proxies de fricção / qualidade)
  i.score_conectividade,
  i.score_pedagogica,
  i.score_basica
FROM diag_escolas e
LEFT JOIN LATERAL (
  SELECT * FROM diag_censo_docentes d2
  WHERE d2.codigo_inep = e.codigo_inep
  ORDER BY ano DESC LIMIT 1
) d ON TRUE
LEFT JOIN LATERAL (
  SELECT * FROM diag_censo_infra i2
  WHERE i2.codigo_inep = e.codigo_inep
  ORDER BY ano DESC LIMIT 1
) i ON TRUE
WHERE e.status = 'ativa';

CREATE UNIQUE INDEX idx_mv_mercado_escola_inep
  ON diag_mv_mercado_escola(codigo_inep);
CREATE INDEX idx_mv_mercado_escola_uf
  ON diag_mv_mercado_escola(uf, rede);
CREATE INDEX idx_mv_mercado_escola_municipio
  ON diag_mv_mercado_escola(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_escola_inse
  ON diag_mv_mercado_escola(inse_grupo);

-- ── 2. Município (todas as redes agregadas) ─────────────────────────────────
-- Nota: agrupa SÓ por municipio_ibge — mesmo IBGE pode ter grafias diferentes
-- (com/sem acento) em diag_escolas. MIN() estabiliza com a primeira grafia.
DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_municipio CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_municipio AS
SELECT
  municipio_ibge,
  MIN(municipio)                                        AS municipio,
  MIN(uf)                                               AS uf,
  MIN(microrregiao)                                     AS microrregiao,
  COUNT(*)                                              AS qt_escolas,
  COUNT(*) FILTER (WHERE rede = 'MUNICIPAL')            AS qt_escolas_municipal,
  COUNT(*) FILTER (WHERE rede = 'ESTADUAL')             AS qt_escolas_estadual,
  COUNT(*) FILTER (WHERE rede = 'FEDERAL')              AS qt_escolas_federal,
  COUNT(*) FILTER (WHERE rede = 'PRIVADA')              AS qt_escolas_privada,
  SUM(qt_professores)                                   AS qt_professores,
  SUM(qt_docs_jovens)                                   AS qt_docs_jovens,
  SUM(qt_docs_pos)                                      AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                AS qt_gestores,
  AVG(inse_grupo) FILTER (WHERE inse_grupo IS NOT NULL) AS inse_medio,
  AVG(score_conectividade)                              AS score_conectividade
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge;

CREATE UNIQUE INDEX idx_mv_mercado_municipio_ibge
  ON diag_mv_mercado_municipio(municipio_ibge);
CREATE INDEX idx_mv_mercado_municipio_uf
  ON diag_mv_mercado_municipio(uf);

-- ── 3. Rede (município × rede administrativa) ──────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_rede CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_rede AS
SELECT
  municipio_ibge,
  MIN(municipio)                                        AS municipio,
  MIN(uf)                                               AS uf,
  rede,
  COUNT(*)                                              AS qt_escolas,
  SUM(qt_professores)                                   AS qt_professores,
  SUM(qt_docs_jovens)                                   AS qt_docs_jovens,
  SUM(qt_docs_pos)                                      AS qt_docs_pos,
  SUM(qt_coord_pedag + qt_diretor_proxy)                AS qt_gestores,
  AVG(inse_grupo) FILTER (WHERE inse_grupo IS NOT NULL) AS inse_medio
FROM diag_mv_mercado_escola
GROUP BY municipio_ibge, rede;

CREATE UNIQUE INDEX idx_mv_mercado_rede_pk
  ON diag_mv_mercado_rede(municipio_ibge, rede);
CREATE INDEX idx_mv_mercado_rede_uf
  ON diag_mv_mercado_rede(uf, rede);

-- ── 4. Função helper: refresh ad-hoc das 3 MVs em ordem (escola → agregadas)
CREATE OR REPLACE FUNCTION refresh_mv_mercado_potencial() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_escola;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_municipio;
  REFRESH MATERIALIZED VIEW CONCURRENTLY diag_mv_mercado_rede;
END $$ LANGUAGE plpgsql;

-- ── Comments documentando intent ───────────────────────────────────────────
COMMENT ON MATERIALIZED VIEW diag_mv_mercado_escola IS
'Base granular do mercado potencial: 1 linha por escola ativa com counts de
profissionais + INSE + scores de infra. Alimenta /admin/vertho/mercado-potencial.';

COMMENT ON MATERIALIZED VIEW diag_mv_mercado_municipio IS
'Mercado potencial agregado por município (todas as redes somadas).
Inclui breakdown qt_escolas_<rede> pra prospecção territorial.';

COMMENT ON MATERIALIZED VIEW diag_mv_mercado_rede IS
'Mercado potencial agregado por (município, rede administrativa).
Para venda B2G (rede municipal/estadual) ou B2B (privada por cidade).';
