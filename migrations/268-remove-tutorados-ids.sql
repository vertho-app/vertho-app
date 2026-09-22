-- 268: remove `colaboradores.tutorados_ids` — resto do papel `tutor`, extinto.
--
-- O papel `tutor` saiu do código em 22/09/2026 (commit 672db4ae, 45 arquivos).
-- Esta coluna era o vínculo tutor→tutorados (migration 092, Onboarding/Fase 4).
--
-- Medido 22/09/2026, antes de derrubar:
--   · 540 colaboradores no banco, em 3 papéis: 383 colaborador, 144 gestor,
--     13 rh. ZERO com role='tutor'.
--   · `tutorados_ids` preenchido em 540 linhas e VAZIO ('{}') em todas as 540.
--   · Dependências no banco: só o índice GIN abaixo. Nenhuma view, policy,
--     função ou trigger referencia a coluna.
--
-- Ou seja: não há dado a perder aqui. Ainda assim, DROP COLUMN não volta por
-- si (o backup do Supabase deste projeto não tem PITR além da janela curta),
-- então o rollback está escrito no fim — ele recria a ESTRUTURA, que é tudo
-- o que existia.

-- O índice sai primeiro e explicitamente: DROP COLUMN o levaria junto, mas
-- deixar implícito esconde do próximo leitor que havia um índice GIN aqui.
DROP INDEX IF EXISTS public.idx_colaboradores_tutorados_ids;

ALTER TABLE public.colaboradores
  DROP COLUMN IF EXISTS tutorados_ids;

-- Rollback (se precisar):
-- ALTER TABLE public.colaboradores
--   ADD COLUMN IF NOT EXISTS tutorados_ids UUID[] DEFAULT '{}'::UUID[];
-- CREATE INDEX IF NOT EXISTS idx_colaboradores_tutorados_ids
--   ON public.colaboradores USING GIN (tutorados_ids);
