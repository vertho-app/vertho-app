-- 044: Reconciliação — respostas
--
-- O banco de produção tem 46 colunas; a migration 029 define apenas 11.
-- As colunas extras foram criadas via Supabase Dashboard durante o
-- desenvolvimento do GAS legado. Esta migration traz as tracked migrations
-- em paridade com o banco real.
--
-- Fonte de verdade: information_schema.columns em produção (2026-04-16).
-- Padrão: ADD COLUMN IF NOT EXISTS — idempotente e segura.

-- Colunas legadas (importação GAS / formulário antigo)
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS timestamp_resposta TIMESTAMPTZ;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS email_colaborador TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS nome_colaborador TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS competencia_nome TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS preferencia_pdi TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Respostas por dimensão (formulário legado GAS — r1_situacao..r4_cis)
-- Coexistem com r1..r4 (formato conversacional novo)
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS r1_situacao TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS r2_acao TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS r3_raciocinio TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS r4_cis TEXT;

-- Métricas de qualidade da resposta
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS representatividade NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS canal TEXT;

-- Notas por descritor (d1-d6) — preenchidas pela IA4 ou manual
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d1_nota NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d2_nota NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d3_nota NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d4_nota NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d5_nota NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS d6_nota NUMERIC;

-- Resultado da avaliação IA4
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS nivel_ia4 SMALLINT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS nota_ia4 NUMERIC;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS pontos_fortes TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS pontos_atencao TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS feedback_ia4 TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS avaliacao_ia JSONB;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS avaliado_em TIMESTAMPTZ;

-- Status e payload do check (auditoria 2ª IA)
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS status_ia4 TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS payload_ia4 JSONB;

-- Referências auxiliares
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS links_academia TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS prompt_version_id UUID;

-- Valores / cultura
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS valores_status TEXT;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS valores_payload JSONB;

-- Controle de rodada (pra re-avaliações)
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS rodada SMALLINT DEFAULT 1;

-- Timestamps
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Nota: colaborador_id em produção é NULLABLE (apesar de migration 029
-- definir NOT NULL). Rows legados importados do GAS tinham colaborador_id
-- nulo (linkavam por email_colaborador). Não forçamos NOT NULL aqui pra
-- não quebrar dados existentes.

-- Nota: cenario_id FK para banco_cenarios existe na migration 029 mas
-- não aparece como constraint em produção — pode ter sido removida
-- manualmente. Não recriamos pra não conflitar.

-- Nota: idx_respostas_colab em produção é (empresa_id, email_colaborador),
-- diferente do que migration 029 define (colaborador_id). Não alteramos.
