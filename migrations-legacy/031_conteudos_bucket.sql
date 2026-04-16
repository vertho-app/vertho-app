-- Bucket de armazenamento para micro_conteudos (áudio, PDF, textos longos).
INSERT INTO storage.buckets (id, name, public)
VALUES ('conteudos', 'conteudos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "conteudos_service_all" ON storage.objects;
CREATE POLICY "conteudos_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'conteudos')
  WITH CHECK (bucket_id = 'conteudos');

DROP POLICY IF EXISTS "conteudos_public_read" ON storage.objects;
CREATE POLICY "conteudos_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'conteudos');
