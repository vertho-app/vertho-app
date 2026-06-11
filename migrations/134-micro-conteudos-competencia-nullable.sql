-- Extração assíncrona (Vimeo/TED/LMS): a competência › descritor é definida
-- pela IA APÓS a extração (igual ao fluxo do YouTube). O placeholder criado no
-- envio fica com competencia/descritor nulos até a task preencher — e a linha
-- nasce com ativo=false, então não é entregue a ninguém nesse intervalo.
ALTER TABLE micro_conteudos ALTER COLUMN competencia DROP NOT NULL;
ALTER TABLE micro_conteudos ALTER COLUMN descritor DROP NOT NULL;
