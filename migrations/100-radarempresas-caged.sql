-- ─────────────────────────────────────────────────────────────────────────
-- 100 — Radar Empresas: agregados CAGED (contexto setorial × território)
--
-- Fonte: Novo CAGED, só CAGEDMOV (movimentações no prazo), 6 meses
-- (202510..202603). UTF-8/';'/header. Microdado NUNCA entra aqui —
-- só agregados tratados (itens 7-8 do escopo).
--
-- CAGED é anonimizado (SEM CNPJ) → contexto por município×CNAE/CBO, não
-- empresa-a-empresa. Cruza com o estabelecimento via (município IBGE,
-- CNAE subclasse). município_ibge = 6 dígitos (nativo do CAGED).
--
-- Carga no Supabase (decisão MVP):
--   - municipio_cnae_6m / municipio_cbo_6m: só recorte (Jundiaí=355410?
--     IBGE6 do CAGED; resolvido na carga) — Brasil todo fica no Parquet.
--   - cnae_6m / municipio_6m: nacionais (benchmark leve: ~1.3k / ~5.5k).
--   - Agregados MENSAIS (municipio_cnae_mes, municipio_cbo_mes): ficam
--     só no Parquet local — milhões de linhas, sem uso no MVP.
--
-- ETAPA 2 (futuro — ajuste histórico):
--   CAGEDFOR (declarações fora do prazo) e CAGEDEXC (exclusões/estornos)
--   serão incorporados como: saldo_ajustado = MOV + FOR − EXC, por
--   (município, cnae/cbo, competência). Hoje só MOV (cobre ~90-95% das
--   movimentações). As tabelas abaixo ganham colunas *_ajustado e uma
--   coluna `inclui_for_exc BOOLEAN` quando a etapa 2 rodar.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS radarempresas_caged_municipio_cnae_6m (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf               TEXT,
  municipio_ibge   TEXT NOT NULL,
  cnae             TEXT NOT NULL,
  admissoes_6m     INTEGER DEFAULT 0,
  desligamentos_6m INTEGER DEFAULT 0,
  saldo_6m         INTEGER DEFAULT 0,
  sal_medio_6m     NUMERIC,
  volume_6m        INTEGER DEFAULT 0,
  taxa_mov_proxy   NUMERIC,            -- (adm+desl)/6 — PROXY (fluxo, sem estoque)
  fonte_version    TEXT DEFAULT 'caged-mov-202510-202603',
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, cnae)
);
CREATE INDEX IF NOT EXISTS idx_radaremp_caged_mc_cnae
  ON radarempresas_caged_municipio_cnae_6m (cnae);

CREATE TABLE IF NOT EXISTS radarempresas_caged_municipio_cbo_6m (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf               TEXT,
  municipio_ibge   TEXT NOT NULL,
  cbo              TEXT NOT NULL,
  admissoes_6m     INTEGER DEFAULT 0,
  desligamentos_6m INTEGER DEFAULT 0,
  saldo_6m         INTEGER DEFAULT 0,
  sal_medio_6m     NUMERIC,
  volume_6m        INTEGER DEFAULT 0,
  fonte_version    TEXT DEFAULT 'caged-mov-202510-202603',
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, cbo)
);

CREATE TABLE IF NOT EXISTS radarempresas_caged_cnae_6m (
  cnae             TEXT PRIMARY KEY,   -- benchmark NACIONAL por CNAE
  admissoes_6m     INTEGER DEFAULT 0,
  desligamentos_6m INTEGER DEFAULT 0,
  saldo_6m         INTEGER DEFAULT 0,
  sal_medio_6m     NUMERIC,
  volume_6m        INTEGER DEFAULT 0,
  fonte_version    TEXT DEFAULT 'caged-mov-202510-202603',
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radarempresas_caged_municipio_6m (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf               TEXT,
  municipio_ibge   TEXT NOT NULL,
  admissoes_6m     INTEGER DEFAULT 0,
  desligamentos_6m INTEGER DEFAULT 0,
  saldo_6m         INTEGER DEFAULT 0,
  volume_6m        INTEGER DEFAULT 0,
  fonte_version    TEXT DEFAULT 'caged-mov-202510-202603',
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge)
);

-- RLS permissiva (padrão do projeto — barreira real é requireAdminAction)
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'radarempresas_caged_municipio_cnae_6m','radarempresas_caged_municipio_cbo_6m',
    'radarempresas_caged_cnae_6m','radarempresas_caged_municipio_6m'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_perm', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true);', t || '_perm', t);
  END LOOP;
END $$;

SELECT 'caged_municipio_cnae_6m' AS tabela, COUNT(*) AS n FROM radarempresas_caged_municipio_cnae_6m
UNION ALL SELECT 'caged_municipio_cbo_6m', COUNT(*) FROM radarempresas_caged_municipio_cbo_6m
UNION ALL SELECT 'caged_cnae_6m', COUNT(*) FROM radarempresas_caged_cnae_6m
UNION ALL SELECT 'caged_municipio_6m', COUNT(*) FROM radarempresas_caged_municipio_6m;
