-- Liga o vídeo renderizado ao Kit Semanal. O vídeo do kit é a célula
-- (modulo × empresa × cargo × DISC) renderizada, agora carregando o desafio do
-- kit no roteiro. Ver docs/KIT-SEMANAL.md (Fase 2b).
ALTER TABLE videos_gerados ADD COLUMN IF NOT EXISTS kit_id uuid REFERENCES kits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_videos_gerados_kit ON videos_gerados (kit_id);
