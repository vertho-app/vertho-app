-- 023: Cache do PDF do Relatório Comportamental
--
-- Guarda o path do PDF no bucket `relatorios-pdf` para evitar re-renderizar
-- toda vez que o usuário clicar em "Baixar". O fluxo do mapeamento dispara
-- a geração em fire-and-forget no final.

ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS comportamental_pdf_path TEXT;
