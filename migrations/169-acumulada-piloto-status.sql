-- 169 — Acumulada do piloto em Trigger.dev (status rastreável + gate)
--
-- A avaliação acumulada do piloto (fim da sem 2) saiu do after() frágil e passou
-- a rodar numa task Trigger.dev com status rastreável. O fechamento (sem 3) faz
-- gate nesse status — só libera quando 'done' (mata a race B2 + a fragilidade do
-- after R1). Colunas na LINHA da semana da acumulada (temporada_semana_progresso):
--   • acumulada_status     — null | 'processing' | 'done' | 'error'
--   • acumulada_erro       — mensagem da última falha (debug)
--   • acumulada_started_at — carimbo do disparo (self-heal se travar > 5min)

ALTER TABLE temporada_semana_progresso
  ADD COLUMN IF NOT EXISTS acumulada_status     text,
  ADD COLUMN IF NOT EXISTS acumulada_erro       text,
  ADD COLUMN IF NOT EXISTS acumulada_started_at timestamptz;
