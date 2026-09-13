-- Simulador PACE: domínio isolado, infraestrutura e identidade da Vertho.
-- Aditiva; nenhum cadastro/histórico anterior é alterado por esta migration.
CREATE TABLE IF NOT EXISTS public.sim_vendas_config (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id),
  habilitado boolean NOT NULL DEFAULT false,
  briefing text NOT NULL CHECK (length(briefing) BETWEEN 40 AND 24000),
  limite_sessoes integer CHECK (limite_sessoes > 0),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.sim_vendas_config.habilitado IS 'Liberação explícita para participantes. Admin pode testar com a flag desligada.';
COMMENT ON COLUMN public.sim_vendas_config.briefing IS 'Contexto comercial aprovado pela operação; snapshot em cada treino.';
COMMENT ON COLUMN public.sim_vendas_config.limite_sessoes IS 'Teto de treinos iniciados por pessoa. NULL não impõe cota comercial.';
COMMENT ON COLUMN public.sim_vendas_config.updated_by IS 'E-mail autenticado do administrador que configurou o módulo.';
COMMENT ON COLUMN public.sim_vendas_config.updated_at IS 'Última configuração administrativa.';
COMMENT ON COLUMN public.sim_vendas_config.empresa_id IS 'Tenant proprietário da configuração.';

CREATE TABLE IF NOT EXISTS public.sim_vendas_sessoes (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  owner_key text NOT NULL CHECK (owner_key ~ '^(admin|colab):[0-9a-f-]{36}$'),
  colaborador_id uuid,
  estado jsonb NOT NULL CHECK (jsonb_typeof(estado) = 'object' AND estado->>'id' = id::text),
  revisao integer NOT NULL DEFAULT 0 CHECK (revisao >= 0),
  lock_token uuid,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sim_vendas_sessoes_colab_fk FOREIGN KEY (colaborador_id, empresa_id) REFERENCES public.colaboradores(id, empresa_id),
  CONSTRAINT sim_vendas_sessoes_id_empresa_ux UNIQUE (id, empresa_id)
);
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_owner_idx ON public.sim_vendas_sessoes(empresa_id, owner_key, created_at DESC);
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_colab_idx ON public.sim_vendas_sessoes(colaborador_id, empresa_id);
CREATE UNIQUE INDEX IF NOT EXISTS sim_vendas_sessoes_aberta_ux ON public.sim_vendas_sessoes(empresa_id, owner_key)
  WHERE estado->>'status' IN ('preparando', 'em_andamento');
COMMENT ON COLUMN public.sim_vendas_sessoes.id IS 'UUID do comando de início, idempotente.';
COMMENT ON COLUMN public.sim_vendas_sessoes.empresa_id IS 'Tenant proprietário. Sempre filtrado pelo serviço.';
COMMENT ON COLUMN public.sim_vendas_sessoes.owner_key IS 'Identidade estável admin:<platform_admin_id> ou colab:<colaborador_id>.';
COMMENT ON COLUMN public.sim_vendas_sessoes.colaborador_id IS 'Participante da mesma empresa, garantido pela FK composta; NULL para teste admin.';
COMMENT ON COLUMN public.sim_vendas_sessoes.estado IS 'Snapshot privado: briefing, prompts/modelos, gabarito, mensagens, relatório e recibos. Nunca retornar integralmente ao browser.';
COMMENT ON COLUMN public.sim_vendas_sessoes.revisao IS 'Compare-and-swap de comandos e sincronização entre abas.';
COMMENT ON COLUMN public.sim_vendas_sessoes.lock_token IS 'Dono da lease. Somente ele pode confirmar ou liberar.';
COMMENT ON COLUMN public.sim_vendas_sessoes.lock_until IS 'Lease de 330s, superior ao limite de 300s da rota.';
COMMENT ON COLUMN public.sim_vendas_sessoes.created_at IS 'Criação original do treino.';
COMMENT ON COLUMN public.sim_vendas_sessoes.updated_at IS 'Última transição persistida.';

CREATE TABLE IF NOT EXISTS public.sim_vendas_tentativas (
  id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  sessao_id uuid NOT NULL,
  request_id uuid NOT NULL,
  etapa text NOT NULL CHECK (etapa IN ('criador','cliente','moderador','intencao','gerente')),
  tentativa integer NOT NULL CHECK (tentativa > 0),
  modelo text NOT NULL,
  prompt_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceita','rejeitada')),
  resultado jsonb,
  erro_codigo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT sim_vendas_tentativas_sessao_fk FOREIGN KEY (sessao_id, empresa_id) REFERENCES public.sim_vendas_sessoes(id, empresa_id),
  CONSTRAINT sim_vendas_tentativas_etapa_ux UNIQUE (sessao_id, request_id, etapa, tentativa)
);
CREATE INDEX IF NOT EXISTS sim_vendas_tentativas_empresa_idx ON public.sim_vendas_tentativas(empresa_id, sessao_id);
COMMENT ON COLUMN public.sim_vendas_tentativas.id IS 'Correlation ID compartilhado com ia_usage_log.';
COMMENT ON COLUMN public.sim_vendas_tentativas.empresa_id IS 'Tenant proprietário.';
COMMENT ON COLUMN public.sim_vendas_tentativas.sessao_id IS 'Treino associado, mesma empresa por FK composta.';
COMMENT ON COLUMN public.sim_vendas_tentativas.request_id IS 'Comando que originou a geração; reenvios reutilizam resultados aceitos.';
COMMENT ON COLUMN public.sim_vendas_tentativas.etapa IS 'Agente PACE responsável.';
COMMENT ON COLUMN public.sim_vendas_tentativas.tentativa IS 'Número da tentativa nesta etapa/comando.';
COMMENT ON COLUMN public.sim_vendas_tentativas.modelo IS 'Modelo solicitado no snapshot da sessão; efetivo registrado no ledger.';
COMMENT ON COLUMN public.sim_vendas_tentativas.prompt_hash IS 'SHA-256 do prompt renderizado, sem transcrição no log operacional.';
COMMENT ON COLUMN public.sim_vendas_tentativas.status IS 'Pendente antes da chamada paga; aceita apenas após validação.';
COMMENT ON COLUMN public.sim_vendas_tentativas.resultado IS 'Saída privada validada. Checkpoint para recuperação sem repetir agentes já aceitos.';
COMMENT ON COLUMN public.sim_vendas_tentativas.erro_codigo IS 'Classe de falha, sem texto bruto do provedor.';
COMMENT ON COLUMN public.sim_vendas_tentativas.created_at IS 'Início da tentativa, antes de acessar o provedor.';
COMMENT ON COLUMN public.sim_vendas_tentativas.finished_at IS 'Conclusão da tentativa.';


ALTER TABLE public.sim_vendas_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_vendas_sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sim_vendas_tentativas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_vendas_config, public.sim_vendas_sessoes, public.sim_vendas_tentativas FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sim_vendas_config, public.sim_vendas_sessoes, public.sim_vendas_tentativas TO service_role;

CREATE OR REPLACE FUNCTION public.sim_vendas_criar(p_id uuid, p_empresa uuid, p_owner text, p_colaborador uuid, p_estado jsonb, p_admin boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE limite integer; ativo boolean; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa::text || p_owner, 0));
  IF EXISTS (SELECT 1 FROM sim_vendas_sessoes WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner) THEN RETURN p_id; END IF;
  SELECT limite_sessoes, habilitado INTO limite, ativo FROM sim_vendas_config WHERE empresa_id=p_empresa;
  IF NOT FOUND OR (NOT p_admin AND NOT ativo) THEN RAISE EXCEPTION 'SIM_CONFIG'; END IF;
  IF EXISTS (SELECT 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND owner_key=p_owner AND estado->>'status' IN ('preparando','em_andamento')) THEN RAISE EXCEPTION 'SIM_ABERTA'; END IF;
  IF limite IS NOT NULL AND NOT p_admin THEN
    SELECT count(*) INTO n FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND owner_key=p_owner
      AND (estado->'cenario' <> 'null'::jsonb OR estado->>'status' = 'preparando');
    IF n >= limite THEN RAISE EXCEPTION 'SIM_LIMITE'; END IF;
  END IF;
  INSERT INTO sim_vendas_sessoes(id,empresa_id,owner_key,colaborador_id,estado) VALUES(p_id,p_empresa,p_owner,p_colaborador,p_estado);
  RETURN p_id;
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_claim(p_id uuid, p_empresa uuid, p_owner text, p_revisao integer, p_token uuid)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH claimed AS (
    UPDATE sim_vendas_sessoes SET lock_token=p_token, lock_until=now()+interval '330 seconds'
    WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner AND revisao=p_revisao
      AND (lock_until IS NULL OR lock_until < now()) RETURNING id
  ) SELECT EXISTS(SELECT 1 FROM claimed);
$$;
CREATE OR REPLACE FUNCTION public.sim_vendas_commit(p_id uuid, p_empresa uuid, p_owner text, p_revisao integer, p_token uuid, p_estado jsonb)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH committed AS (
    UPDATE sim_vendas_sessoes SET estado=p_estado, revisao=p_revisao+1, lock_token=NULL, lock_until=NULL, updated_at=now()
    WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner AND revisao=p_revisao
      AND lock_token=p_token AND lock_until>now() AND (p_estado->>'revisao')::integer=p_revisao+1
    RETURNING id
  ) SELECT EXISTS(SELECT 1 FROM committed);
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_criar(uuid,uuid,text,uuid,jsonb,boolean), public.sim_vendas_claim(uuid,uuid,text,integer,uuid), public.sim_vendas_commit(uuid,uuid,text,integer,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_criar(uuid,uuid,text,uuid,jsonb,boolean), public.sim_vendas_claim(uuid,uuid,text,integer,uuid), public.sim_vendas_commit(uuid,uuid,text,integer,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Rollback operacional: desabilitar sim_vendas_config.habilitado e reverter o deploy.
-- Preservar as três tabelas e seus dados; não há DROP automático de histórico.
