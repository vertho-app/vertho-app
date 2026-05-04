-- ─────────────────────────────────────────────────────────────────────────
-- 089 — Rastrear device/origem dos votos da votação de competências
--
-- Adiciona 3 colunas em votacao_competencias pra capturar de onde o voto
-- foi enviado (mobile/desktop/tablet), user-agent completo e hash do IP
-- (não armazenamos IP raw — apenas SHA-256 truncado pra distinguir devices
-- sem comprometer privacidade).
--
-- Aplicada nos votos a partir do deploy. Votos anteriores ficam com NULL
-- — não há como retroativar (info nunca foi capturada).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE votacao_competencias
  ADD COLUMN IF NOT EXISTS device_type TEXT,           -- 'mobile' | 'desktop' | 'tablet' | 'bot'
  ADD COLUMN IF NOT EXISTS user_agent TEXT,            -- UA string completa (auditoria)
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;               -- SHA-256 truncado do IP

-- Index só pra agregação por device (queries de relatório por mobile vs PC)
CREATE INDEX IF NOT EXISTS idx_votacao_device
  ON votacao_competencias(empresa_id, device_type)
  WHERE device_type IS NOT NULL;

-- Verificação: lista distribuição atual (deve ter NULL pros votos legados)
SELECT device_type, COUNT(*) AS qtd
FROM votacao_competencias
GROUP BY device_type
ORDER BY qtd DESC;
