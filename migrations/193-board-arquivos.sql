-- 193: /board — arquivos de contexto enviados pela tela
--
-- Até aqui o contexto vinha só de uma pasta na máquina do Rodrigo, o que exige
-- copiar arquivo à mão antes de perguntar. Agora a tela aceita upload: o arquivo
-- vai para o Storage e o WORKER baixa para uma pasta temporária local antes de
-- rodar os CLIs — porque quem lê os arquivos são os quatro modelos, e eles são
-- processos da máquina, não do servidor.
--
-- Bucket PRIVADO: o conteúdo é material estratégico (briefs, contratos,
-- planilhas). Sem policy de leitura pública — o acesso é service-role pelo
-- worker, e a tela lista pelo metadado em board_paineis.arquivos.
-- Idempotente.

ALTER TABLE board_paineis
  ADD COLUMN IF NOT EXISTS arquivos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN board_paineis.arquivos IS
  'Arquivos enviados pela tela: [{nome, path, bytes, tipo}]. `path` é a chave no bucket board-contexto. O worker baixa tudo para uma pasta temporária local e aponta o contexto para lá; some depois do painel.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-contexto',
  'board-contexto',
  false,
  20971520, -- 20 MB por arquivo: contexto é texto, não vídeo
  NULL      -- sem allowlist de mime aqui; a validação real é na action (extensão + tamanho)
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DELETE FROM storage.objects WHERE bucket_id = 'board-contexto';
-- DELETE FROM storage.buckets WHERE id = 'board-contexto';
-- ALTER TABLE board_paineis DROP COLUMN IF EXISTS arquivos;
