-- ═════════════════════════════════════════════════════════════════
-- Migration 079 — Perfil comportamental externo (OPQ32, Hogan, etc.)
-- ═════════════════════════════════════════════════════════════════
--
-- Permite que clientes específicos usem ferramentas próprias de
-- assessment comportamental no lugar do mapeamento DISC nativo.
--
-- Caso de uso inicial: Boehringer usa OPQ32 (SHL).
--
-- Design:
-- - 3 colunas novas em colaboradores, todas NULLABLE (default = DISC)
-- - Bucket privado 'perfis-externos' pra storage seguro dos PDFs
-- - Toggle por empresa via sys_config.perfil_externo_fonte
--
-- Compatibilidade: nada do DISC existente é alterado. Pra empresas
-- sem perfil externo configurado, o sistema continua usando DISC.
-- ═════════════════════════════════════════════════════════════════

-- 1. Colunas em colaboradores
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS perfil_externo_fonte TEXT,
  ADD COLUMN IF NOT EXISTS perfil_externo_dados JSONB,
  ADD COLUMN IF NOT EXISTS perfil_externo_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS perfil_externo_extraido_em TIMESTAMPTZ;

-- Apenas valores conhecidos. Lista pode crescer (Hogan, MBTI, Big5, PI).
ALTER TABLE colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_perfil_externo_fonte_check;
ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_perfil_externo_fonte_check
  CHECK (perfil_externo_fonte IS NULL OR perfil_externo_fonte IN ('opq32', 'hogan', 'mbti', 'big5'));

CREATE INDEX IF NOT EXISTS idx_colaboradores_perfil_externo_fonte
  ON colaboradores(perfil_externo_fonte)
  WHERE perfil_externo_fonte IS NOT NULL;

COMMENT ON COLUMN colaboradores.perfil_externo_fonte IS
  'Fonte de assessment comportamental externo (opq32, hogan, etc.). NULL = usa DISC nativo.';
COMMENT ON COLUMN colaboradores.perfil_externo_dados IS
  'JSON estruturado extraído do relatório externo. Schema varia por fonte.';
COMMENT ON COLUMN colaboradores.perfil_externo_pdf_path IS
  'Path do PDF original no bucket perfis-externos. Acessado via signed URL.';

-- 2. Bucket privado pra PDFs (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('perfis-externos', 'perfis-externos', false, 5 * 1024 * 1024, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Sem policies públicas. Apenas service_role pode ler/escrever.
-- (Se quiser dar acesso ao próprio colaborador, criar policy específica
-- depois — por enquanto admin Vertho acessa via signed URL gerada server-side.)

-- 3. Helper: empresa usa fonte externa? (lê de sys_config.perfil_externo_fonte)
CREATE OR REPLACE FUNCTION empresa_perfil_externo_fonte(p_empresa_id UUID)
RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT (sys_config->>'perfil_externo_fonte')::TEXT
    FROM empresas
   WHERE id = p_empresa_id;
$$;

COMMENT ON FUNCTION empresa_perfil_externo_fonte IS
  'Retorna fonte externa da empresa (opq32, hogan, etc.) ou NULL se usa DISC.';
