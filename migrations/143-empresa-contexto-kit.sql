-- Contexto consolidado da EMPRESA p/ o Kit Semanal. Empresa-rede (município) tem
-- vários PPPs (1 por escola); o kit é por EMPRESA, então usamos um contexto
-- MUNICIPAL = síntese do que é compartilhado pela rede. Cache aqui (lazy, gerado
-- na 1ª vez; invalida quando entra PPP mais novo). Ver docs/KIT-SEMANAL.md.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS kit_contexto text,             -- brief municipal consolidado (lente de aplicação)
  ADD COLUMN IF NOT EXISTS kit_contexto_at timestamptz;   -- max(extracted_at) dos PPPs na síntese (p/ invalidar)
