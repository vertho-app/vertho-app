-- Permite as origens do módulo de extração de vídeo da empresa.
ALTER TABLE micro_conteudos DROP CONSTRAINT IF EXISTS micro_conteudos_origem_check;
ALTER TABLE micro_conteudos ADD CONSTRAINT micro_conteudos_origem_check
  CHECK (origem = ANY (ARRAY[
    'pre_produzido', 'ia_gerado', 'ia_heygen_clone', 'ia_podcast',
    'empresa_video', 'complemento_video'
  ]));
