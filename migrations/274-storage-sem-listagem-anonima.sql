-- 274: buckets públicos sem listagem e sem escrita anônima (R-74 da revisão de 02/10/2026).
--
-- `conteudos_public_read` e `Avatars public read` davam SELECT em storage.objects ao
-- papel `public` (inclui `anon`). Com a chave anon, que vai no bundle do navegador,
-- qualquer pessoa LISTAVA esses buckets, e o UUID no caminho deixava de proteger
-- os arquivos (medido em 03/10/2026 em `conteudos/final/*`).
-- `Avatars write` dava ALL ao mesmo papel: qualquer pessoa, sem login, gravava,
-- trocava ou apagava a foto de qualquer usuário.
--
-- Por que tirar não quebra nada:
--  - bucket público serve o arquivo pela URL pública sem consultar policy, então os
--    links já distribuídos (PDFs, áudios, fotos) continuam abrindo;
--  - o app lê e grava esses buckets só pelo servidor, com service_role, que ignora
--    RLS (`conteudos_service_all` fica como está);
--  - nenhum componente 'use client' usa storage (conferido em 03/10/2026).
--
-- Os relatórios com dado de pessoa (Perfil Organizacional, DNA, Ranking) saem do
-- bucket público num passo seguinte, de código, com link assinado.

drop policy if exists "conteudos_public_read" on storage.objects;
drop policy if exists "Avatars public read" on storage.objects;
drop policy if exists "Avatars write" on storage.objects;
