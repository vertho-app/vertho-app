-- Cadência DUO: a semana entrega 2 pílulas (1º e 2º descritor). Rastreia a
-- idempotência de cada uma por dia (igual ultima_evidencia_em faz p/ a evidência).
-- O cron diário (triggerDiario) usa estas colunas + ultima_evidencia_em p/ não
-- reenviar no mesmo dia (retry da Vercel/replay).
ALTER TABLE fase4_envios
  ADD COLUMN IF NOT EXISTS ultima_pilula1_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_pilula2_em timestamptz;
