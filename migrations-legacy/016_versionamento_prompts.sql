-- 016: Versionamento de prompts e régua de maturidade
-- Permite rastrear qual versão do prompt/régua gerou cada resultado

-- 1. Tabela de versões de prompt
CREATE TABLE IF NOT EXISTS prompt_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL,        -- 'conversa_fase3', 'avaliacao_ia4', 'auditoria_gemini', 'ia1_top10', 'ia2_gabarito', 'ia3_cenarios', 'pdi'
  hash        TEXT NOT NULL,        -- SHA-256 do conteúdo (dedup)
  modelo      TEXT NOT NULL,        -- 'claude-sonnet-4-6', 'gemini-2.5-flash', etc.
  conteudo    TEXT NOT NULL,         -- Texto completo do system prompt
  metadata    JSONB,                -- { max_tokens, temperature, etc. }
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prompt_versions_unique_hash UNIQUE (tipo, hash)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_tipo ON prompt_versions(tipo);

-- 2. Versão da régua de maturidade nas competências
ALTER TABLE competencias
  ADD COLUMN IF NOT EXISTS versao_regua INT NOT NULL DEFAULT 1;

-- 3. Vincular sessões à versão do prompt usada
ALTER TABLE sessoes_avaliacao
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES prompt_versions(id),
  ADD COLUMN IF NOT EXISTS eval_prompt_version_id UUID REFERENCES prompt_versions(id),
  ADD COLUMN IF NOT EXISTS audit_prompt_version_id UUID REFERENCES prompt_versions(id),
  ADD COLUMN IF NOT EXISTS versao_regua INT;

-- 4. Vincular respostas avaliadas à versão do prompt
ALTER TABLE respostas
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES prompt_versions(id);

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_sessoes_prompt_ver ON sessoes_avaliacao(prompt_version_id);
CREATE INDEX IF NOT EXISTS idx_respostas_prompt_ver ON respostas(prompt_version_id);
