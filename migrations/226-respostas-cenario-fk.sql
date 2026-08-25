-- 226 — protege a PROVENIÊNCIA da avaliação: resposta não pode ficar apontando
-- para um cenário apagado.
--
-- ═══ POR QUE (medido em 25/08/2026) ═══
--
-- `respostas.cenario_id` guarda a qual situação a pessoa respondeu, e NÃO havia
-- foreign key. Enquanto isso, `persistirCenarioIA3` faz `delete` + `insert`:
-- toda regeneração de cenário APAGA a linha anterior. O resultado, medido:
--
--   17 de 246 respostas apontam para um `banco_cenarios` que não existe mais
--   (15 no acme, de 14/04; 2 no ibipeba/Gestão Escolar, de 02/06)
--   — todas as 17 JÁ AVALIADAS.
--
-- Ou seja: existe nota, e não existe mais o enunciado que a produziu. Para
-- avaliação de pessoas isso é auditabilidade perdida — ninguém consegue
-- reconstruir a que situação aquela nota se refere, nem contestar.
--
-- ═══ POR QUE `NOT VALID` ═══
--
-- As 17 linhas violam a restrição. Um FK comum recusaria ser criado, e as duas
-- saídas seriam destrutivas: apagar as respostas (perde a avaliação) ou zerar o
-- `cenario_id` (apaga a última pista de que houve um cenário).
--
-- `NOT VALID` cria a restrição SEM checar o que já existe: protege toda linha
-- nova e todo DELETE daqui pra frente, e deixa as 17 visíveis como cicatriz
-- histórica em vez de falsificá-las. Validar depois, se um dia forem tratadas:
--   ALTER TABLE respostas VALIDATE CONSTRAINT respostas_cenario_id_fkey;
--
-- ═══ ON DELETE RESTRICT, e o que isso quebra de propósito ═══
--
-- Apagar um cenário que já tem resposta passa a FALHAR, em vez de silenciar.
-- Isso é a régua do FMEA aplicada: regeneração é CONSTRUÇÃO (admin, com humano
-- na frente) e construção falha alto. O caminho que hoje apagaria — o
-- `delete` do persistidor — foi ajustado no mesmo commit para preservar o
-- cenário já respondido em vez de substituí-lo.
--
-- Idempotente: só cria se ainda não existir.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'respostas_cenario_id_fkey'
      AND conrelid = 'public.respostas'::regclass
  ) THEN
    ALTER TABLE public.respostas
      ADD CONSTRAINT respostas_cenario_id_fkey
      FOREIGN KEY (cenario_id) REFERENCES public.banco_cenarios(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

-- Índice no lado filho: sem ele, cada DELETE em `banco_cenarios` faz seq scan
-- em `respostas` para checar a restrição.
CREATE INDEX IF NOT EXISTS idx_respostas_cenario_id
  ON public.respostas (cenario_id)
  WHERE cenario_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
