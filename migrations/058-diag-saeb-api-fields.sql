-- ═════════════════════════════════════════════════════════════════
-- Migration 058 — campos extras do endpoint JSON oficial do Saeb
-- O endpoint /saeb/rest/resultado-final/escolas/{inep}/anos-projeto/{ano}
-- entrega médias de proficiência, histórico e o payload estruturado.
-- Estes campos preservam essa informação sem depender de OCR/HTML.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE diag_saeb_snapshots
  ADD COLUMN IF NOT EXISTS media_proficiencia NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS media_similares NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS historico_proficiencia JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS raw_api JSONB;

COMMENT ON COLUMN diag_saeb_snapshots.media_proficiencia IS
  'Média de proficiência da escola no boletim Saeb.';

COMMENT ON COLUMN diag_saeb_snapshots.media_similares IS
  'Média de proficiência do grupo de escolas similares no boletim Saeb.';

COMMENT ON COLUMN diag_saeb_snapshots.historico_proficiencia IS
  'Série histórica de proficiência retornada pelo endpoint oficial do boletim.';

COMMENT ON COLUMN diag_saeb_snapshots.raw_api IS
  'Recorte bruto da resposta JSON oficial usado para montar este snapshot.';
