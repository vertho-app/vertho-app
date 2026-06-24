-- Seleção mais inteligente do módulo-base na trilha:
--  (1) EMBEDDING do descritor (match semântico — pega paráfrase/sinônimo que o
--      overlap de tokens erra). pgvector já habilitado; 1024 dims (text-embedding-3-small).
--  (2) RASTREIO de origem: micro_conteudos.modulo_base_id — qual módulo gerou o
--      conteúdo, p/ ANTI-REPETIÇÃO (não reusar sempre o mesmo módulo).
-- Sem índice ANN: os candidatos já são poucos (filtrados por competência×nível×
--   locale×escopo) → cosseno em JS. Ver lib/season-engine/modulo-base-integration.ts.

ALTER TABLE modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS descritor_embedding vector(1024);

ALTER TABLE micro_conteudos
  ADD COLUMN IF NOT EXISTS modulo_base_id uuid REFERENCES modulos_base_conteudo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_micro_conteudos_modulo_base
  ON micro_conteudos (modulo_base_id) WHERE modulo_base_id IS NOT NULL;
