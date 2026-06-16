-- Camada de personalização NOMINAL por pessoa, sobre o deck por CÉLULA.
-- O deck (videos_gerados) é renderizado 1× por célula (cargo × DISC × competência)
-- e NÃO contém o nome. A saudação nominal ("Olá, {nome}") é uma camada barata
-- montada por ffmpeg (TTS + drawtext + concat) por colaborador, reaproveitando o
-- mesmo deck. O render (caro) fica no nível de célula; o nome custa centavos.
ALTER TABLE videos_gerados
  ADD COLUMN IF NOT EXISTS deck_master_path text;  -- mp4 mestre do deck (Storage) p/ personalização

CREATE TABLE IF NOT EXISTS videos_personalizados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_video_id uuid NOT NULL REFERENCES videos_gerados(id) ON DELETE CASCADE,  -- o deck da célula
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nome_usado    text NOT NULL,                     -- nome falado/escrito (p/ auditoria e regeneração)
  status        text NOT NULL DEFAULT 'processing'
                CHECK (status IN ('processing', 'done', 'error')),
  video_url     text,
  bunny_video_id text,
  bunny_library text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cell_video_id, colaborador_id)           -- 1 personalização por (deck, pessoa)
);

-- Resolução por colaborador (entrega da semana): pega o personalizado pronto.
CREATE INDEX IF NOT EXISTS idx_videos_personalizados_colab
  ON videos_personalizados (colaborador_id, status, created_at DESC);

-- Fan-out de pré-aquecimento: dado um deck pronto, achar quem falta personalizar.
CREATE INDEX IF NOT EXISTS idx_videos_personalizados_cell
  ON videos_personalizados (cell_video_id);
