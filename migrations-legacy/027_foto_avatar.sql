-- 027: Foto / avatar do colaborador
--
-- Duas formas de ter avatar:
-- 1. Upload de foto pro bucket `avatars` (público)        → foto_url
-- 2. Seleção de avatar pré-definido do catálogo           → avatar_preset (ex: "avatar-01")
--
-- Se `foto_url` estiver preenchida, ela tem precedência. Caso contrário,
-- usa o preset ou cai no fallback de iniciais do nome.

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS avatar_preset TEXT;

-- Bucket público de avatars com size limit 2 MB e apenas imagens
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Leitura pública e escrita aberta (policies básicas — server-side já valida auth)
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
CREATE POLICY "Avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatars write" ON storage.objects;
CREATE POLICY "Avatars write" ON storage.objects
  FOR ALL USING (bucket_id = 'avatars') WITH CHECK (bucket_id = 'avatars');
