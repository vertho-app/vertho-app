-- Biblioteca de competências do treino de recepção (Catálogo Vertho, global).
-- Cada competência traz o comportamento esperado em quatro níveis (n1 lacuna … n4 referência).
-- Os cenários COPIAM nome/critério/níveis para a própria rubrica ao salvar (snapshot): editar ou
-- desativar uma competência aqui nunca altera um cenário publicado nem um relatório.
-- "Excluir" da biblioteca é ativo=false (sem grant de DELETE, como nas demais tabelas do módulo).
BEGIN;
CREATE TABLE IF NOT EXISTS public.recepcao_competencias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 codigo text NOT NULL UNIQUE CHECK (codigo ~ '^[a-z][a-z0-9_-]{1,63}$'),
 nome text NOT NULL, descricao text NOT NULL DEFAULT '', niveis jsonb NOT NULL,
 ativo boolean NOT NULL DEFAULT true, revisao integer NOT NULL DEFAULT 0, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(niveis)='object' AND niveis ? 'n1' AND niveis ? 'n2' AND niveis ? 'n3' AND niveis ? 'n4')
);
ALTER TABLE public.recepcao_competencias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recepcao_competencias FROM anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.recepcao_competencias TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
