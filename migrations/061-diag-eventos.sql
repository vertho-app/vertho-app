-- Migration 061 — Tabela de eventos pro funnel dashboard
-- Tracking de visitas, cliques no CTA, leads, PDFs, conversas.
-- Append-only, leve, agregado em queries (não MV ainda).

CREATE TABLE IF NOT EXISTS diag_eventos (
  id          BIGSERIAL PRIMARY KEY,
  tipo        TEXT NOT NULL,                  -- 'view_escola', 'view_municipio', 'view_estado', 'cta_lead_click', 'cta_compare_click'
  scope_type  TEXT,                            -- 'escola' | 'municipio' | 'estado' | NULL
  scope_id    TEXT,
  ip_hash     TEXT,
  user_agent  TEXT,
  referer     TEXT,
  is_bot      BOOLEAN DEFAULT false,
  extra       JSONB,
  criado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_eventos_tipo_data
  ON diag_eventos(tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_eventos_scope
  ON diag_eventos(scope_type, scope_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_eventos_data
  ON diag_eventos(criado_em DESC);

ALTER TABLE diag_eventos ENABLE ROW LEVEL SECURITY;
-- Sem policies = bloqueia anon, só service role escreve/lê.

-- ── RPC: agregação do funil pro admin dashboard ────────────────────
CREATE OR REPLACE FUNCTION diag_funil_resumo(dias INT DEFAULT 30)
RETURNS TABLE (
  tipo            TEXT,
  total           BIGINT,
  total_humanos   BIGINT,
  unicos_ip_24h   BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    e.tipo,
    COUNT(*)                                 AS total,
    COUNT(*) FILTER (WHERE NOT e.is_bot)     AS total_humanos,
    COUNT(DISTINCT e.ip_hash)
      FILTER (WHERE e.criado_em > now() - interval '24 hours') AS unicos_ip_24h
  FROM diag_eventos e
  WHERE e.criado_em > now() - (dias || ' days')::interval
  GROUP BY e.tipo
  ORDER BY total DESC;
$$;

GRANT EXECUTE ON FUNCTION diag_funil_resumo(INT) TO authenticated, service_role;

-- ── RPC: top escolas/municípios visitados ──────────────────────────
CREATE OR REPLACE FUNCTION diag_funil_top_visitados(dias INT DEFAULT 30, lim INT DEFAULT 20)
RETURNS TABLE (
  scope_type    TEXT,
  scope_id      TEXT,
  total_views   BIGINT,
  views_humanos BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    e.scope_type,
    e.scope_id,
    COUNT(*)                              AS total_views,
    COUNT(*) FILTER (WHERE NOT e.is_bot)  AS views_humanos
  FROM diag_eventos e
  WHERE e.tipo IN ('view_escola','view_municipio','view_estado')
    AND e.criado_em > now() - (dias || ' days')::interval
    AND e.scope_id IS NOT NULL
  GROUP BY e.scope_type, e.scope_id
  ORDER BY views_humanos DESC, total_views DESC
  LIMIT lim;
$$;

GRANT EXECUTE ON FUNCTION diag_funil_top_visitados(INT, INT) TO authenticated, service_role;
