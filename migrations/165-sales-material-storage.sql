-- 165 — Arquivo original (PDF) do material comercial
--
-- Os PDFs do kit ficam num bucket PRIVADO (sales-materials); o download é
-- servido por rota autenticada (RC/admin). `storage_path` guarda o caminho no
-- bucket; `file_url` aponta para a rota /api/sales/materials/[id]/download.
ALTER TABLE sales_materials ADD COLUMN IF NOT EXISTS storage_path text;
