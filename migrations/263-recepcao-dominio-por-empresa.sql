-- 263: segmento do simulador de atendimento por EMPRESA.
--
-- Decisão do dono (18/09/2026): o domínio médico sai do código e vira
-- configuração de cada empresa. O motor já lê os termos do segmento do caso
-- (`lib/recepcao/dominio.ts`, commit e3912317); aqui a empresa ganha o seu, que
-- decide QUAIS casos ela vê e com que segmento nasce um caso novo.
--
-- Sem CHECK de propósito: os valores válidos são os do registro no código, e um
-- segmento novo não deve exigir migration. O código valida na escrita (zod) e
-- trata valor desconhecido na leitura.
--
-- Empresas existentes ficam no médico, o único segmento com catálogo publicado
-- (60 casos, 15 publicados em 18/09). Nenhum dado existente muda de sentido.
-- Aplicar ANTES do código que lê a coluna.

ALTER TABLE public.recepcao_config
  ADD COLUMN IF NOT EXISTS dominio text NOT NULL DEFAULT 'recepcao_medica';

COMMENT ON COLUMN public.recepcao_config.dominio IS
  'Segmento do simulador de atendimento (lib/recepcao/dominio.ts): define os casos que a empresa vê e o segmento dos casos novos. Validado no código, sem CHECK.';

NOTIFY pgrst, 'reload schema';
-- Rollback (se precisar):
-- ALTER TABLE public.recepcao_config DROP COLUMN IF EXISTS dominio;
