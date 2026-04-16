-- 010: Bucket de logos para branding multi-tenant
-- Cada empresa pode ter um logo custom exibido no login e dashboard

-- 1. Criar bucket público para logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152, -- 2MB max
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: qualquer um pode ler (público)
CREATE POLICY "Logos são públicos" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'logos');

-- 3. Policy: upload apenas via service_role (API server-side)
CREATE POLICY "Upload de logos via service_role" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND auth.role() = 'service_role'
  );

-- 4. Policy: delete apenas via service_role
CREATE POLICY "Delete de logos via service_role" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos'
    AND auth.role() = 'service_role'
  );
