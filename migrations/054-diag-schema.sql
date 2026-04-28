-- ═════════════════════════════════════════════════════════════════
-- Migration 054 — Radar Vertho (diag_*)
-- Schema público (sem multi-tenant) para o Radar em radar.vertho.ai
-- Spec: Vertho_Radar_Spec_v2_2.docx
-- ═════════════════════════════════════════════════════════════════

-- ── 1. Cadastro de escolas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diag_escolas (
  codigo_inep      TEXT PRIMARY KEY,             -- 8 dígitos
  nome             TEXT NOT NULL,
  rede             TEXT,                          -- MUNICIPAL / ESTADUAL / FEDERAL / PRIVADA
  municipio        TEXT NOT NULL,
  municipio_ibge   TEXT NOT NULL,                 -- 7 dígitos IBGE
  uf               TEXT NOT NULL,                 -- 2 letras
  microrregiao     TEXT,                          -- ex: 'Irecê'
  zona             TEXT,                          -- URBANA / RURAL
  inse_grupo       SMALLINT,                      -- 1 (mais alto) a 6 (mais baixo)
  etapas           TEXT[] DEFAULT ARRAY[]::TEXT[],-- ex: ['EF_INICIAIS','EF_FINAIS','EM']
  status           TEXT NOT NULL DEFAULT 'ativa', -- ativa / fechada / sem_dados
  ano_referencia   SMALLINT,                      -- último ano com dado
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  criado_em        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_escolas_municipio ON diag_escolas(municipio_ibge);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_uf       ON diag_escolas(uf);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_microrregiao ON diag_escolas(microrregiao);
CREATE INDEX IF NOT EXISTS idx_diag_escolas_busca   ON diag_escolas USING gin (to_tsvector('portuguese', nome));

-- ── 2. Snapshots Saeb por escola ────────────────────────────────────
CREATE TABLE IF NOT EXISTS diag_saeb_snapshots (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_inep      TEXT NOT NULL REFERENCES diag_escolas(codigo_inep) ON DELETE CASCADE,
  ano              SMALLINT NOT NULL,             -- 2019, 2021, 2023, 2025
  etapa            TEXT NOT NULL,                 -- '5_EF', '9_EF', '3_EM'
  disciplina       TEXT NOT NULL,                 -- 'LP' | 'MAT'
  -- Distribuição por nível (cumulativa) — SOMA ≈ 100%
  distribuicao     JSONB NOT NULL DEFAULT '{}',   -- { "0": 12.5, "1": 18.3, ... }
  -- Comparativos
  similares        JSONB,                          -- mesma estrutura, % escolas similares
  total_municipio  JSONB,
  total_estado     JSONB,
  total_brasil     JSONB,
  -- Participação
  presentes        INT,
  matriculados     INT,
  taxa_participacao NUMERIC(5,2),
  -- Formação docente (vinda do mesmo boletim)
  formacao_docente NUMERIC(5,2),
  ingest_run_id    UUID,
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (codigo_inep, ano, etapa, disciplina)
);

CREATE INDEX IF NOT EXISTS idx_diag_saeb_escola_ano  ON diag_saeb_snapshots(codigo_inep, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_saeb_disciplina  ON diag_saeb_snapshots(ano, etapa, disciplina);

-- ── 3. Snapshots ICA municipal (Indicador Criança Alfabetizada) ─────
CREATE TABLE IF NOT EXISTS diag_ica_snapshots (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  municipio_ibge   TEXT NOT NULL,
  uf               TEXT NOT NULL,
  rede             TEXT NOT NULL,                 -- MUNICIPAL / ESTADUAL / TOTAL
  ano              SMALLINT NOT NULL,             -- 2022, 2023, 2024
  alunos_avaliados INT,
  alfabetizados    INT,
  taxa             NUMERIC(5,2),                  -- % alfabetizados
  total_estado     NUMERIC(5,2),                  -- % na UF (benchmark)
  total_brasil     NUMERIC(5,2),                  -- % no Brasil (benchmark)
  ingest_run_id    UUID,
  atualizado_em    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (municipio_ibge, rede, ano)
);

CREATE INDEX IF NOT EXISTS idx_diag_ica_municipio ON diag_ica_snapshots(municipio_ibge, ano DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ica_uf        ON diag_ica_snapshots(uf, ano DESC);

-- ── 4. Cache de análises geradas pela IA ────────────────────────────
CREATE TABLE IF NOT EXISTS diag_analises_ia (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_type       TEXT NOT NULL,                 -- 'escola' | 'municipio'
  scope_id         TEXT NOT NULL,                 -- INEP ou IBGE
  prompt_version   TEXT NOT NULL,                 -- SHA-256 do prompt
  dados_hash       TEXT NOT NULL,                 -- SHA-256 dos dados consultados
  conteudo         JSONB NOT NULL,                -- narrativa estruturada
  modelo           TEXT NOT NULL,                 -- 'claude-sonnet-4-6' etc
  tokens_in        INT,
  tokens_out       INT,
  custo_usd        NUMERIC(10,6),
  pdf_url          TEXT,                          -- signed URL (PDF gerado, se aplicável)
  pdf_path         TEXT,                          -- path no bucket diag-relatorios
  criado_em        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (scope_type, scope_id, prompt_version, dados_hash)
);

CREATE INDEX IF NOT EXISTS idx_diag_analises_scope ON diag_analises_ia(scope_type, scope_id);

-- ── 5. Leads capturados ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diag_leads (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email            TEXT NOT NULL,
  nome             TEXT,
  cargo            TEXT,
  organizacao      TEXT,
  -- Contexto da geração
  scope_type       TEXT NOT NULL,                 -- 'escola' | 'municipio'
  scope_id         TEXT NOT NULL,
  scope_label      TEXT,                          -- nome legível da escola/município
  -- LGPD
  consentimento_lgpd BOOLEAN NOT NULL DEFAULT false,
  consentimento_em   TIMESTAMPTZ,
  -- PDF
  pdf_status       TEXT NOT NULL DEFAULT 'pendente', -- pendente / processando / pronto / erro
  pdf_url          TEXT,
  pdf_path         TEXT,
  pdf_erro         TEXT,
  pdf_gerado_em    TIMESTAMPTZ,
  -- Conversão
  contato_em       TIMESTAMPTZ,                   -- quando equipe Vertho fez contato
  convertido       BOOLEAN DEFAULT false,         -- virou conversa comercial?
  notas_internas   TEXT,
  -- Origem
  user_agent       TEXT,
  referer          TEXT,
  utm              JSONB,
  ip_hash          TEXT,                          -- SHA-256(IP) — analytics, não rastreio
  criado_em        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diag_leads_email   ON diag_leads(email);
CREATE INDEX IF NOT EXISTS idx_diag_leads_scope   ON diag_leads(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_diag_leads_status  ON diag_leads(pdf_status);
CREATE INDEX IF NOT EXISTS idx_diag_leads_criado  ON diag_leads(criado_em DESC);

-- ── 6. Observabilidade dos pipelines de ingestão ────────────────────
CREATE TABLE IF NOT EXISTS diag_ingest_runs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fonte            TEXT NOT NULL,                 -- 'saeb' | 'ica' | 'ideb' | 'censo'
  escopo           JSONB NOT NULL DEFAULT '{}',   -- { uf, microrregiao, ano, municipios: [] }
  status           TEXT NOT NULL DEFAULT 'rodando', -- rodando / sucesso / erro / parcial
  -- Contagens
  total_planejado  INT,
  total_processado INT DEFAULT 0,
  total_sucesso    INT DEFAULT 0,
  total_falha      INT DEFAULT 0,
  total_skipped    INT DEFAULT 0,
  -- Logs
  erros            JSONB DEFAULT '[]',            -- [{ key, msg, ts }]
  amostra_log      TEXT,                          -- primeiras linhas do log pra debug
  arquivo_origem   TEXT,                          -- nome do arquivo enviado pelo admin
  iniciado_em      TIMESTAMPTZ DEFAULT now(),
  finalizado_em    TIMESTAMPTZ,
  duracao_ms       INT
);

CREATE INDEX IF NOT EXISTS idx_diag_ingest_fonte    ON diag_ingest_runs(fonte, iniciado_em DESC);
CREATE INDEX IF NOT EXISTS idx_diag_ingest_status   ON diag_ingest_runs(status);

-- ── RLS permissivo (controle no app via service role) ───────────────
ALTER TABLE diag_escolas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_saeb_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_ica_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_analises_ia     ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE diag_ingest_runs     ENABLE ROW LEVEL SECURITY;

-- Leitura pública para escolas/snapshots/ICA/análises (Radar é público)
CREATE POLICY "diag_escolas_public_read"        ON diag_escolas         FOR SELECT USING (true);
CREATE POLICY "diag_saeb_public_read"           ON diag_saeb_snapshots  FOR SELECT USING (true);
CREATE POLICY "diag_ica_public_read"            ON diag_ica_snapshots   FOR SELECT USING (true);
CREATE POLICY "diag_analises_public_read"       ON diag_analises_ia     FOR SELECT USING (true);

-- Leads e ingest_runs: só service role (sem policy = bloqueia anon)

-- Escrita: só service role (sem policy de INSERT/UPDATE = bloqueia anon)

-- ── Bucket de relatórios ────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diag-relatorios',
  'diag-relatorios',
  true,                                            -- público para download direto via signed URL
  10485760,                                        -- 10 MB por PDF
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: read público, write só service role
CREATE POLICY "diag_relatorios_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'diag-relatorios');
