-- ─────────────────────────────────────────────────────────────────────────
-- 108 — Radar Empresas: consolidação de redes / franquias
--
-- Problema: a negociação Vertho é na FRANQUEADORA, não em cada unidade
-- franqueada. Franqueado ≠ filial: cada um é PJ distinta (cnpj_basico
-- diferente) — a Receita não tem campo franquia nem vínculo com a matriz.
-- Sinal disponível: mesmo nome_fantasia normalizado em ≥3 cnpj_basico
-- distintos = provável rede. A matriz quase nunca está no recorte.
--
-- radarempresas_redes: 1 linha por marca (= 1 lead/oportunidade).
-- radarempresas_scores.rede_marca: marca normalizada da unidade (NULL =
-- não é rede). Unidades de rede saem da lista individual e do funil;
-- a rede entra como 1 lead.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_scores
  ADD COLUMN IF NOT EXISTS rede_marca TEXT;
CREATE INDEX IF NOT EXISTS idx_radaremp_scores_rede
  ON radarempresas_scores (rede_marca) WHERE rede_marca IS NOT NULL;

CREATE TABLE IF NOT EXISTS radarempresas_redes (
  marca_norm        TEXT PRIMARY KEY,         -- nome fantasia normalizado
  nome_exibicao     TEXT NOT NULL,            -- fantasia "bonito" (mais comum)
  n_unidades        INTEGER NOT NULL,         -- estabelecimentos no recorte
  n_donos           INTEGER NOT NULL,         -- cnpj_basico distintos
  segmento_key      TEXT,                     -- segmento dominante
  segmento_nome     TEXT,
  score_medio       NUMERIC,                  -- média do score das unidades
  score_max         NUMERIC,
  classificacao     TEXT,                     -- derivada do score_medio
  ufs               TEXT[],
  municipios        TEXT[],
  exemplo_cnpj      TEXT,                     -- uma unidade de referência
  confianca_rede    TEXT DEFAULT 'media',     -- alta|media|baixa (heurística)
  fonte_version     TEXT DEFAULT 'receita-2026-05',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_redes_score
  ON radarempresas_redes (score_medio DESC);

ALTER TABLE radarempresas_redes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radarempresas_redes_perm ON radarempresas_redes;
CREATE POLICY radarempresas_redes_perm ON radarempresas_redes
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'radarempresas_redes' AS tabela, COUNT(*) AS n FROM radarempresas_redes;
