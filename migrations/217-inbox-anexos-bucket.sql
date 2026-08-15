-- 217 — Bucket dos anexos que a equipe ENVIA pelo inbox.
--
-- POR QUE O ARQUIVO PRECISA PASSAR POR AQUI
-- ─────────────────────────────────────────
-- O primeiro desenho subia o binário pela Server Action e de lá para a Meta.
-- Isso funciona e tem um teto duro de **4,5 MB**: é o tamanho máximo do corpo de
-- uma request na Vercel (413 `FUNCTION_PAYLOAD_TOO_LARGE`), medido no primeiro
-- envio real em 15/08/2026 — um PDF maior nem chegava ao nosso código, e a
-- mensagem de erro amigável era inalcançável.
--
-- Com upload direto do navegador para cá, o arquivo NÃO passa pela função: o
-- servidor só assina a URL. O teto passa a ser o da Meta — 100 MB para
-- documento, 16 MB para áudio/vídeo, 5 MB para imagem.
--
-- ⚠️ BUCKET PRIVADO, e a exposição é a URL ASSINADA de leitura (minutos), que
-- existe porque a Meta precisa BUSCAR o arquivo para re-hospedá-lo. Depois disso
-- o WhatsApp serve a mídia dos servidores dele; a nossa cópia é descartável e é
-- apagada pela limpeza diária. Guardar conversa de gente é assunto de retenção,
-- não de armazenamento eterno por inércia.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-anexos',
  'inbox-anexos',
  false,
  -- 100 MB: o maior teto da Meta (documento). O limite por TIPO é aplicado no
  -- código (`lib/inbox/anexos.ts`), que é quem sabe que áudio para em 16 MB.
  104857600,
  ARRAY[
    'image/jpeg','image/png',
    'audio/aac','audio/amr','audio/mpeg','audio/mp4','audio/ogg',
    'video/3gpp','video/mp4',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = false;

-- ⚠️ Sem `COMMENT ON TABLE storage.buckets` aqui: a tabela pertence ao schema do
-- Storage e o papel da migration não é dono dela ("must be owner of table
-- buckets"). A explicação do bucket vive neste arquivo e em `lib/inbox/anexos.ts`.
