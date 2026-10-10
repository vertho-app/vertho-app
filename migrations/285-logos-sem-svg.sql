-- 285: o bucket público `logos` deixa de aceitar SVG.
--
-- Análise de segurança de 10/10/2026. A rota `/api/upload-logo` já recusa SVG desde 05/10
-- (o SVG pode carregar `<script>`, e o link direto do Storage o abriria como página), mas
-- o bucket ainda listava `image/svg+xml` em `allowed_mime_types`. Quem gravasse por outro
-- caminho com service_role (script, rota nova) passaria. Só a rota grava no bucket hoje.
--
-- `allowed_mime_types` vale para o upload: o 1 logo SVG que já está no bucket (de 11)
-- continua sendo servido. Tamanho máximo (2 MB) inalterado.
--
-- Idempotente.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'logos';

-- Rollback (se precisar; volta a aceitar SVG no bucket):
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
-- WHERE id = 'logos';
