-- ============================================================================
-- 094: INSE proxy para escolas sem cobertura oficial Saeb
-- ============================================================================
--
-- INSE oficial INEP só existe pra escolas que participaram do Saeb. A maioria
-- das privadas (~95%) não participa, então INSE NULL. Esta migration adiciona
-- um INSE INFERIDO (proxy) calculado a partir de sinais do Censo Escolar que
-- correlacionam com nível socioeconômico:
--
--   peso 20% — score_pedagogica (biblioteca, lab, sala leitura)
--   peso 15% — score_conectividade (internet, banda larga)
--   peso 15% — score_basica (água, luz, esgoto, banheiro)
--   peso 10% — climatização (ar-cond / ventiladores) = sinal de investimento
--   peso 10% — devices pro aluno (desktop/notebook/tablet) ÷ 20 capped em 100
--   peso 10% — laboratório de ciências
--   peso 10% — quadra esportes coberta
--   peso  5% — auditório
--   peso  5% — % docentes com pós-graduação
--
-- Recria a MV diag_mv_mercado_escola com 3 colunas novas:
--   - inse_proxy_score (0-100, contínuo)
--   - inse_proxy_grupo (1-6, mapeado em faixas)
--   - inse_efetivo    (oficial quando existe; fallback proxy)
--   - inse_fonte      ('oficial' | 'inferido')
--
-- MVs agregadas (município e rede) usam inse_efetivo pra AVG — assim privadas
-- com proxy aparecem no score sem ser tratadas como ausentes.
--
-- Limitações documentadas:
--   - Católicas/comunitárias antigas: INSE real alto mas infra modesta (subestima)
--   - Federais (IFs): infra alta mas alunos podem ser classe média (superestima)
--   - Privadas pequenas familiares: infra modesta mas alunos ricos (subestima)
--
-- Aplicar via Studio. Reversível: rodar 093 novamente sem as colunas novas.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS diag_mv_mercado_escola CASCADE;

CREATE MATERIALIZED VIEW diag_mv_mercado_escola AS
WITH base AS (
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
    -- Totais de pessoas
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
    -- Scores agregados do Censo Infra
    i.score_conectividade,
    i.score_pedagogica,
    i.score_basica,
    -- Sinais brutos pra inferência INSE
    COALESCE((i.indicadores->>'IN_CLIMATIZACAO')::int, 0)            AS in_climatizacao,
    COALESCE((i.indicadores->>'IN_LABORATORIO_CIENCIAS')::int, 0)    AS in_lab_ciencias,
    COALESCE((i.indicadores->>'IN_QUADRA_ESPORTES_COBERTA')::int, 0) AS in_quadra_coberta,
    COALESCE((i.indicadores->>'IN_AUDITORIO')::int, 0)               AS in_auditorio,
    COALESCE((i.quantidades->>'QT_DESKTOP_ALUNO')::int, 0)
      + COALESCE((i.quantidades->>'QT_COMP_PORTATIL_ALUNO')::int, 0)
      + COALESCE((i.quantidades->>'QT_TABLET_ALUNO')::int, 0)        AS qt_devices_aluno
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
  WHERE e.status = 'ativa'
),
scored AS (
  SELECT *,
    -- inse_proxy_score: 0-100 média ponderada. Booleanos viram 0 ou 100;
    -- contínuos (scores 0-100) entram diretos; devices saturam em 20 = 100.
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
  FROM base
)
SELECT *,
  -- inse_proxy_grupo: mapeia o score em 6 faixas (escala INEP)
  CASE
    WHEN inse_proxy_score < 15 THEN 1
    WHEN inse_proxy_score < 35 THEN 2
    WHEN inse_proxy_score < 55 THEN 3
    WHEN inse_proxy_score < 75 THEN 4
    WHEN inse_proxy_score < 90 THEN 5
    ELSE 6
  END::smallint AS inse_proxy_grupo,
  -- inse_efetivo: oficial quando existe; fallback proxy
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
  -- inse_fonte: bandeira pra UI mostrar badge "~" quando inferido
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

-- Recria as MVs agregadas (CASCADE dropou) usando inse_efetivo no AVG.

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
  -- % das escolas com INSE oficial (vs proxy) — sinal de confiabilidade
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

-- Função helper atualizada (CASCADE recriou já existe se rodou 093 antes)
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
