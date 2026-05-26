-- 120 — Idempotência do trigger de quinta (Fase 4)
--
-- Contexto: actions/cron-jobs.ts → triggerQuinta() incrementava semana_atual a
-- cada execução, sem guarda. Um retry da Vercel, replay de mensagem ou disparo
-- manual no mesmo dia avançava a semana mais de uma vez, pulando o conteúdo
-- (pílula) da(s) semana(s) saltada(s).
--
-- Solução: marcador de quando a evidência da semana corrente foi solicitada.
-- O cron roda 1x/semana (quinta), então gatear por dia-calendário é suficiente
-- e seguro: a 2ª execução no mesmo dia encontra o marcador = hoje e não reenvia
-- nem avança de novo.
ALTER TABLE fase4_envios
  ADD COLUMN IF NOT EXISTS ultima_evidencia_em TIMESTAMPTZ;

COMMENT ON COLUMN fase4_envios.ultima_evidencia_em IS
  'Quando triggerQuinta processou este envio pela última vez (idempotência: evita avançar semana_atual 2x no mesmo dia em retry/replay/disparo manual).';
