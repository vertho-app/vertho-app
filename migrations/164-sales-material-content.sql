-- 164 — Corpo rico dos materiais comerciais
--
-- sales_materials.description é teaser (o card faz line-clamp-3). Para o RC ler
-- o material completo E o assistente de IA aterrar no conteúdo real (battlecard,
-- scripts de qualificação, objeções por segmento), o corpo vai em `content`.
ALTER TABLE sales_materials ADD COLUMN IF NOT EXISTS content text;
