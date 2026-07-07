-- 171 — DROP da tabela do lote de reavaliação da Sem 14 (revert)
--
-- A feature de filtro + lote na auditoria Sem 14 foi construída na tela errada
-- (a correta é a Fase 2 — diagnóstico) e revertida. Esta mig remove a tabela
-- `auditoria_reavaliacao_lote` criada pela mig 170 (que estava vazia — a task
-- Trigger nunca foi deployada, nenhum lote chegou a ser criado).
DROP TABLE IF EXISTS public.auditoria_reavaliacao_lote;
