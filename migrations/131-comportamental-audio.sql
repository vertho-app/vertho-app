-- Devolutiva em voz do mapeamento comportamental.
-- Guarda o path (bucket privado relatorios-pdf) do MP3 narrado + quando foi gerado.
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS comportamental_audio_path TEXT,
  ADD COLUMN IF NOT EXISTS comportamental_audio_at   TIMESTAMPTZ;
