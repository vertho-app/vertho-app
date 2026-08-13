-- 211 — SMS como canal de entrega em `notification_deliveries`.
--
-- Por que existe (medido em 13/08/2026): a instância Z-API caiu no meio do
-- disparo da evidência da Ibipeba — 6 de 36 entregues, 30 falhas com
-- `connected=false, smartphone=false`. O mesmo provedor é o ÚNICO caminho do
-- OTP de login (`app/api/auth/phone-otp/request`), então enquanto o número
-- está fora as 271 pessoas com `login_por_whatsapp = true` não conseguem
-- entrar: não existe segundo canal para um fluxo que é, por definição, por
-- telefone.
--
-- O canal 'sms' entra no CHECK para que a tentativa seja CONTÁVEL desde o
-- primeiro envio. Sem isto o INSERT de telemetria falharia com 23514 e o
-- fallback nasceria cego — e um fallback que não se conta é indistinguível de
-- um fallback que não roda, que é exatamente o estado em que o WaSender está
-- hoje (implementado, sem credencial, nunca exercitado).
--
-- Idempotente: dropa e recria o CHECK, porque ADD CONSTRAINT não tem IF NOT
-- EXISTS e o conjunto de valores muda com o tempo.

ALTER TABLE notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_channel_chk;

ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_channel_chk
  CHECK (channel IN ('whatsapp', 'email', 'webpush', 'fcm', 'apns', 'sms'));

COMMENT ON COLUMN notification_deliveries.channel IS
  'Canal físico da entrega. Não confundir com kind: um mesmo kind pode sair por canais diferentes. sms entrou em 13/08/2026 como contingência de ACESSO (OTP), não de jornada — o denominador de quem depende de SMS para conteúdo é de 9 pessoas em ~400, enquanto o de quem depende dele para entrar é 271.';

-- Índice parcial para a leitura que o teto de custo faz a cada envio: "quantos
-- SMS saíram nas últimas 24h". Sem ele o teto varreria a tabela inteira no
-- caminho quente do login.
CREATE INDEX IF NOT EXISTS idx_notif_deliveries_sms_recente
  ON notification_deliveries (sent_at DESC)
  WHERE channel = 'sms';
