-- Aditiva. Treino independente das respostas e avaliações formais de liderança.
CREATE TABLE IF NOT EXISTS public.sim_lideranca_jornadas (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  owner_key text NOT NULL CHECK (owner_key ~ '^(admin|colab):[0-9a-f-]{36}$'),
  colaborador_id uuid,
  estado jsonb NOT NULL CHECK (jsonb_typeof(estado) = 'object'),
  revisao integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  lock_token uuid,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, owner_key),
  UNIQUE (id, empresa_id),
  FOREIGN KEY (colaborador_id, empresa_id) REFERENCES public.colaboradores(id, empresa_id)
);
CREATE INDEX IF NOT EXISTS sim_lideranca_colab_idx ON public.sim_lideranca_jornadas(colaborador_id, empresa_id);
COMMENT ON COLUMN public.sim_lideranca_jornadas.estado IS 'Snapshot privado de prompts, modelos e matriz; cinco encontros originais e encontro ativo. Projetar explicitamente para o navegador.';
COMMENT ON COLUMN public.sim_lideranca_jornadas.owner_key IS 'Identidade da sessão autenticada; isolada por tenant. Admin treina em acervo próprio.';
COMMENT ON COLUMN public.sim_lideranca_jornadas.lock_until IS 'Lease de 330 segundos, superior ao limite da rota. Compare-and-swap na conclusão.';

CREATE TABLE IF NOT EXISTS public.sim_lideranca_episodios (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL,
  jornada_id uuid NOT NULL,
  indice integer NOT NULL CHECK (indice BETWEEN 0 AND 4),
  repeticao boolean NOT NULL,
  episodio jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (jornada_id, empresa_id) REFERENCES public.sim_lideranca_jornadas(id, empresa_id)
);
CREATE INDEX IF NOT EXISTS sim_lideranca_episodios_hist_idx ON public.sim_lideranca_episodios(empresa_id, jornada_id, created_at DESC, id DESC);
COMMENT ON COLUMN public.sim_lideranca_episodios.episodio IS 'Encontro concluído, imutável. Repetições preservam a história original e podem ser comparadas.';

CREATE TABLE IF NOT EXISTS public.sim_lideranca_chamadas (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL,
  jornada_id uuid NOT NULL,
  request_id uuid NOT NULL,
  etapa text NOT NULL CHECK (etapa IN ('abertura','personagem','consequencia','avaliador')),
  prompt_hash text NOT NULL,
  resultado jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jornada_id, request_id, etapa),
  FOREIGN KEY (jornada_id, empresa_id) REFERENCES public.sim_lideranca_jornadas(id, empresa_id)
);
CREATE INDEX IF NOT EXISTS sim_lideranca_chamadas_tenant_idx ON public.sim_lideranca_chamadas(empresa_id, jornada_id);
COMMENT ON COLUMN public.sim_lideranca_chamadas.resultado IS 'Checkpoint validado de IA para retomar encerramento sem refazer etapas já persistidas.';

ALTER TABLE public.sim_lideranca_jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_lideranca_episodios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_lideranca_chamadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_lideranca_jornadas, public.sim_lideranca_episodios, public.sim_lideranca_chamadas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sim_lideranca_jornadas, public.sim_lideranca_episodios, public.sim_lideranca_chamadas TO service_role;

CREATE OR REPLACE FUNCTION public.sim_lideranca_salvar(p_id uuid, p_empresa uuid, p_owner text, p_token uuid, p_revisao integer, p_estado jsonb, p_episodio jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM sim_lideranca_jornadas WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner
    AND lock_token=p_token AND lock_until>now() AND revisao=p_revisao FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_episodio IS NOT NULL AND p_episodio <> 'null'::jsonb THEN
    INSERT INTO sim_lideranca_episodios(id, empresa_id, jornada_id, indice, repeticao, episodio)
    VALUES ((p_episodio->>'id')::uuid, p_empresa, p_id, (p_episodio->>'indice')::int, (p_episodio->>'repeticao')::boolean, p_episodio);
  END IF;
  UPDATE sim_lideranca_jornadas SET estado=p_estado, revisao=revisao+1, lock_token=NULL, lock_until=NULL, updated_at=now()
    WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.sim_lideranca_salvar(uuid,uuid,text,uuid,integer,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sim_lideranca_salvar(uuid,uuid,text,uuid,integer,jsonb,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
-- Rollback operacional: ocultar a entrada do novo treino. Preservar as tabelas e o acervo.
