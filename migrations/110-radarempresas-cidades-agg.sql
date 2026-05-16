-- ─────────────────────────────────────────────────────────────────────────
-- 110 — Radar Empresas BR: tabelas de serving (agregados leves)
--
-- Escala BR: o cálculo pesado roda local (DuckDB/Parquet). O Supabase
-- vira camada fina. A TELA mostra consolidado por município
-- (radarempresas_cidades_agg) e o funil/cards leem contagens
-- pré-calculadas (radarempresas_funil_agg). O lead-a-lead NÃO entra no
-- DB — vira XLSX por município no Supabase Storage (bucket separado,
-- 100 GB grátis). DB total < 100 MB → cabe no Pro sem custo extra.
--
-- radarempresas_redes já existe (migration 108/109). Idempotente:
-- o load (17_load_supabase.ts) faz truncate-replace por snapshot.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_cidades_agg (
  municipio_ibge   TEXT PRIMARY KEY,
  municipio_nome   TEXT,
  uf               TEXT,
  total_ativos     INTEGER,            -- TAM bruto (contexto)
  n_priorizados    INTEGER,            -- top 10% endereçável
  n_abordar        INTEGER,            -- desses, score >= 80
  n_boa            INTEGER,            -- desses, 60-79
  score_medio      NUMERIC,
  seg_top          TEXT,               -- segmento dominante dos priorizados
  n_redes          INTEGER,            -- redes c/ presença na cidade
  xlsx_path        TEXT,               -- caminho no Storage (priorizados)
  fonte_version    TEXT DEFAULT 'receita-2026-05',
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_radaremp_cid_uf ON radarempresas_cidades_agg (uf);
CREATE INDEX IF NOT EXISTS idx_radaremp_cid_prio
  ON radarempresas_cidades_agg (n_priorizados DESC);

-- funil + KPIs: pouquíssimas linhas (etapa → n), snapshot
CREATE TABLE IF NOT EXISTS radarempresas_funil_agg (
  etapa            TEXT PRIMARY KEY,
  n                BIGINT,
  ordem            INTEGER,
  fonte_version    TEXT DEFAULT 'receita-2026-05',
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE radarempresas_cidades_agg ENABLE ROW LEVEL SECURITY;
ALTER TABLE radarempresas_funil_agg  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS radaremp_cid_perm ON radarempresas_cidades_agg;
CREATE POLICY radaremp_cid_perm ON radarempresas_cidades_agg FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS radaremp_fun_perm ON radarempresas_funil_agg;
CREATE POLICY radaremp_fun_perm ON radarempresas_funil_agg FOR ALL USING (true) WITH CHECK (true);

SELECT 'cidades_agg' AS t, COUNT(*) n FROM radarempresas_cidades_agg
UNION ALL SELECT 'funil_agg', COUNT(*) FROM radarempresas_funil_agg;
