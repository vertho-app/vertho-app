-- competencias_base é nível-competência (sem descritor: descritor_completo/cod_desc
-- vazios). Para a extração capturar o SUB-TEMA específico do conteúdo (o "descritor"
-- que o usuário espera), o módulo-base ganha um campo descritor próprio (texto livre),
-- sugerido pela IA na extração e editável na tela.
ALTER TABLE modulos_base_conteudo
  ADD COLUMN IF NOT EXISTS descritor text;
