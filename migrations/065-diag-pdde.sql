-- ═════════════════════════════════════════════════════════════════
-- Migration 065 — PDDE (Programa Dinheiro Direto na Escola)
-- 2 tabelas: por escola (preferencial, requer cruzamento UEx→INEP) e
-- agregada por município (fallback se cruzamento travar).
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diag_pdde_repasses (
  codigo_inep                 TEXT NOT NULL,
  ano                         SMALLINT NOT NULL,
  valor_recebido              NUMERIC,
  saldo_atual                 NUMERIC,
  prestacao_contas_status     TEXT,                 -- 'aprovada' | 'pendente' | 'em_analise' | 'rejeitada'
  ingest_run_id               UUID,
  atualizado_em               TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (codigo_inep, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_pdde_inep ON diag_pdde_repasses(codigo_inep);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_ano  ON diag_pdde_repasses(ano DESC);

CREATE TABLE IF NOT EXISTS diag_pdde_municipal (
  municipio_ibge              TEXT NOT NULL,
  uf                          TEXT,
  ano                         SMALLINT NOT NULL,
  total_repasse               NUMERIC,
  total_escolas_atendidas     INT,
  ingest_run_id               UUID,
  atualizado_em               TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (municipio_ibge, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_pdde_mun_uf  ON diag_pdde_municipal(uf);
CREATE INDEX IF NOT EXISTS idx_diag_pdde_mun_ano ON diag_pdde_municipal(ano DESC);

ALTER TABLE diag_pdde_repasses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_pdde_municipal  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diag_pdde_public_read" ON diag_pdde_repasses;
DROP POLICY IF EXISTS "diag_pdde_mun_public_read" ON diag_pdde_municipal;
CREATE POLICY "diag_pdde_public_read"     ON diag_pdde_repasses  FOR SELECT USING (true);
CREATE POLICY "diag_pdde_mun_public_read" ON diag_pdde_municipal FOR SELECT USING (true);
