INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "backups_service_all" ON storage.objects;
CREATE POLICY "backups_service_all" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'backups')
  WITH CHECK (bucket_id = 'backups');
