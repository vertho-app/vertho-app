-- 129: Fecha RLS da tabela canonica de escolas.
--
-- A migration 113 fechou as tabelas public existentes na epoca. A tabela
-- escolas foi criada depois (126), entao precisa de RLS explicita propria.

ALTER TABLE IF EXISTS public.escolas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escolas_select_same_tenant ON public.escolas;
CREATE POLICY escolas_select_same_tenant ON public.escolas
  FOR SELECT TO authenticated
  USING (empresa_id = public.current_empresa_id());
