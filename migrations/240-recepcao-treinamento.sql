BEGIN;

CREATE TABLE IF NOT EXISTS public.recepcao_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
  habilitado boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.recepcao_sessoes (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  owner_email text NOT NULL,
  colaborador_id uuid REFERENCES public.colaboradores(id),
  estado jsonb NOT NULL,
  revisao integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  lock_token uuid,
  lock_until timestamptz,
  chamadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recepcao_sessoes_owner ON public.recepcao_sessoes (empresa_id, owner_email, created_at DESC);
ALTER TABLE public.recepcao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepcao_sessoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recepcao_config, public.recepcao_sessoes FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recepcao_config, public.recepcao_sessoes TO service_role;

-- Lease atômico. Só o backend autenticado pode chamar; todos os filtros são obrigatórios.
CREATE OR REPLACE FUNCTION public.recepcao_claim(p_id uuid, p_empresa uuid, p_owner text, p_revisao integer, p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE recepcao_sessoes SET lock_token=p_token, lock_until=clock_timestamp()+interval '330 seconds'
   WHERE id=p_id AND empresa_id=p_empresa AND owner_email=p_owner AND revisao=p_revisao
     AND (lock_until IS NULL OR lock_until < clock_timestamp());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n=1;
END $$;

CREATE OR REPLACE FUNCTION public.recepcao_commit(p_id uuid, p_empresa uuid, p_owner text, p_revisao integer, p_token uuid, p_estado jsonb, p_chamadas jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF (p_estado->>'revisao')::integer <> p_revisao+1 THEN RAISE EXCEPTION 'revisao invalida'; END IF;
  UPDATE recepcao_sessoes SET estado=p_estado, revisao=p_revisao+1, chamadas=chamadas || p_chamadas,
    lock_token=NULL, lock_until=NULL, updated_at=clock_timestamp()
   WHERE id=p_id AND empresa_id=p_empresa AND owner_email=p_owner AND revisao=p_revisao AND lock_token=p_token;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n=1;
END $$;

REVOKE ALL ON FUNCTION public.recepcao_claim(uuid,uuid,text,integer,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recepcao_commit(uuid,uuid,text,integer,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_claim(uuid,uuid,text,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recepcao_commit(uuid,uuid,text,integer,uuid,jsonb,jsonb) TO service_role;
COMMENT ON TABLE public.recepcao_sessoes IS 'Treinos administrativos sintéticos. Estado reservado; acesso apenas por API com empresa e proprietário autenticados. Não alimenta avaliação N1-N4.';
NOTIFY pgrst, 'reload schema';
COMMIT;
