-- Migration 058 — bucket diag-relatorios privado + drop policy pública
-- A migration 054 criou o bucket público + signed URL, mas a combinação
-- mistura modelos e expõe PDFs se o path vazar. Privado + signed URL é
-- o padrão correto: ninguém lê sem URL temporário.

UPDATE storage.buckets SET public = false WHERE id = 'diag-relatorios';

DROP POLICY IF EXISTS "diag_relatorios_public_read" ON storage.objects;
