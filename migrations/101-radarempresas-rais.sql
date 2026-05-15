-- ─────────────────────────────────────────────────────────────────────────
-- 101 — Radar Empresas: agregados RAIS_ESTAB (estoque/porte emprego formal)
--
-- Fonte: RAIS Estabelecimento pública (RAIS_ESTAB_PUB). Anonimizada (SEM
-- CNPJ) → contexto município×CNAE/porte. Casa com estabelecimento/CAGED
-- via (município IBGE 6díg, CNAE subclasse 7díg). Microdado NÃO sobe.
--
-- A RAIS dá o ESTOQUE que faltava no CAGED:
--   taxa_rotatividade_real = movimentação_CAGED_6m / estoque_RAIS
-- (por município×CNAE) — substitui o taxa_mov_proxy por uma taxa honesta.
--
-- LIMITAÇÕES: RAIS_ESTAB não tem salário/massa (isso é RAIS_VINC).
-- Estoque = "Qtd Vínculos Ativos". Estab com 0 vínculo (RAIS negativa)
-- contam na densidade do setor com estoque 0.
--
-- Carga MVP: municipio_cnae/porte só Jundiaí (352590); cnae/municipio
-- nacionais (benchmark leve). Mensal não existe (RAIS é anual).
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_rais_estab_municipio_cnae (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf                 TEXT,
  municipio_ibge     TEXT NOT NULL,
  cnae               TEXT NOT NULL,
  qtd_estab          INTEGER DEFAULT 0,
  estoque_vinculos   INTEGER DEFAULT 0,
  vinc_medio         NUMERIC,
  tam_medio_estimado NUMERIC,
  fonte_version      TEXT DEFAULT 'rais-estab-pub',
  created_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, cnae)
);
CREATE INDEX IF NOT EXISTS idx_radaremp_rais_mc_cnae
  ON radarempresas_rais_estab_municipio_cnae (cnae);

CREATE TABLE IF NOT EXISTS radarempresas_rais_estab_municipio_porte (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf               TEXT,
  municipio_ibge   TEXT NOT NULL,
  tam_cod          INTEGER,
  faixa            TEXT,
  qtd_estab        INTEGER DEFAULT 0,
  estoque_vinculos INTEGER DEFAULT 0,
  fonte_version    TEXT DEFAULT 'rais-estab-pub',
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, tam_cod)
);

CREATE TABLE IF NOT EXISTS radarempresas_rais_estab_cnae (
  cnae               TEXT PRIMARY KEY,
  qtd_estab          INTEGER DEFAULT 0,
  estoque_vinculos   INTEGER DEFAULT 0,
  tam_medio_estimado NUMERIC,
  fonte_version      TEXT DEFAULT 'rais-estab-pub',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radarempresas_rais_estab_municipio (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf               TEXT,
  municipio_ibge   TEXT NOT NULL,
  qtd_estab        INTEGER DEFAULT 0,
  estoque_vinculos INTEGER DEFAULT 0,
  fonte_version    TEXT DEFAULT 'rais-estab-pub',
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'radarempresas_rais_estab_municipio_cnae','radarempresas_rais_estab_municipio_porte',
    'radarempresas_rais_estab_cnae','radarempresas_rais_estab_municipio'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_perm', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', t || '_perm', t);
  END LOOP;
END $$;

SELECT 'rais_estab_municipio_cnae' AS tabela, COUNT(*) AS n FROM radarempresas_rais_estab_municipio_cnae
UNION ALL SELECT 'rais_estab_municipio_porte', COUNT(*) FROM radarempresas_rais_estab_municipio_porte
UNION ALL SELECT 'rais_estab_cnae', COUNT(*) FROM radarempresas_rais_estab_cnae
UNION ALL SELECT 'rais_estab_municipio', COUNT(*) FROM radarempresas_rais_estab_municipio;
