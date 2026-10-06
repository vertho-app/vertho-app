-- Treinamento comercial interno: identidade Auth, distinta dos pilotos e colaboradores.
INSERT INTO public.empresas(id,nome,slug,segmento,default_locale)
VALUES('76520131-a559-4faf-a025-495d29ea5098','Vertho · Treinamento comercial','vertho-treinamento-comercial','corporativo','pt-BR')
ON CONFLICT(id) DO NOTHING;
-- O treinamento interno não tem prazo contratual. A exceção é deste único tenant.
ALTER TABLE public.sim_vendas_config DROP CONSTRAINT IF EXISTS sim_vendas_config_periodo_check;
ALTER TABLE public.sim_vendas_config ADD CONSTRAINT sim_vendas_config_periodo_check CHECK (
  (periodo_inicio IS NULL AND periodo_fim IS NULL AND (NOT habilitado OR empresa_id='76520131-a559-4faf-a025-495d29ea5098'::uuid))
  OR (periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL AND periodo_fim>periodo_inicio)
);
INSERT INTO public.sim_vendas_config(empresa_id,habilitado,briefing,updated_by)
VALUES('76520131-a559-4faf-a025-495d29ea5098',true,'Treinamento comercial Vertho: diagnóstico, desenvolvimento de competências, trilhas personalizadas, mentoria e simulações. O briefing factual e a base competitiva são versionados no servidor.','implantacao-autorizada')
ON CONFLICT(empresa_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.sim_vendas_vertho_participantes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  tipo text NOT NULL CHECK(tipo IN ('interno','representante')),
  representante_id uuid REFERENCES public.sales_representatives(id),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,empresa_id),
  CHECK(empresa_id='76520131-a559-4faf-a025-495d29ea5098'::uuid),
  CHECK((tipo='representante')=(representante_id IS NOT NULL))
);
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.user_id IS 'Conta Auth verificada; dono canônico vendedor:<user_id>.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.empresa_id IS 'Tenant fixo do treinamento interno, nunca escolhido pelo navegador.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.tipo IS 'Interno explicitamente cadastrado ou representante vinculado ao canal.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.representante_id IS 'Vínculo do RC, revalidado a cada operação e geração paga.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.nome IS 'Nome do vendedor apresentado no personagem fictício.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.ativo IS 'Liberação individual; vinculação automática não reativa suspensos.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.criado_por IS 'Responsável autenticado pelo cadastro ou implantação autorizada.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.created_at IS 'Data do primeiro vínculo individual.';
COMMENT ON COLUMN public.sim_vendas_vertho_participantes.updated_at IS 'Data da última alteração da liberação.';
CREATE INDEX IF NOT EXISTS sim_vertho_participantes_empresa_idx ON public.sim_vendas_vertho_participantes(empresa_id,ativo);
CREATE INDEX IF NOT EXISTS sim_vertho_participantes_rep_idx ON public.sim_vendas_vertho_participantes(representante_id);
ALTER TABLE public.sim_vendas_vertho_participantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_vendas_vertho_participantes FROM anon,authenticated;
GRANT ALL ON public.sim_vendas_vertho_participantes TO service_role;

-- Cadastro inicial explícito dos atuais responsáveis comerciais master com conta.
-- Novos administradores NÃO herdam acesso: precisam de cadastro individual pela gestão.
INSERT INTO public.sim_vendas_vertho_participantes(user_id,empresa_id,tipo,nome,criado_por)
SELECT u.id,'76520131-a559-4faf-a025-495d29ea5098','interno',coalesce(nullif(p.nome,''),'Vendedor Vertho'),'implantacao-autorizada-2026-10-06'
FROM auth.users u JOIN public.platform_admins p ON lower(p.email)=lower(u.email)
WHERE p.role='master' AND u.email_confirmed_at IS NOT NULL AND lower(u.email) NOT LIKE '%.demo@vertho.ai'
  AND NOT EXISTS(SELECT 1 FROM public.sim_vendas_vertho_participantes WHERE criado_por='implantacao-autorizada-2026-10-06')
ON CONFLICT(user_id) DO NOTHING;

-- Auth não é legível por service_role. Definer restrito ao serviço, com tenant fixo;
-- os endpoints passam somente o ID retornado por auth.getUser. Sem grants no auth.
CREATE OR REPLACE FUNCTION public.sim_vendas_vertho_acesso(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT jsonb_build_object('nome',p.nome,'ativo',
    p.ativo AND cfg.habilitado AND (p.tipo='interno' OR
      (r.status='active' AND lower(r.email)=lower(u.email) AND (r.user_id IS NULL OR r.user_id=u.id))))
    FROM sim_vendas_vertho_participantes p JOIN auth.users u ON u.id=p.user_id
    JOIN sim_vendas_config cfg ON cfg.empresa_id=p.empresa_id
    LEFT JOIN sales_representatives r ON r.id=p.representante_id
    WHERE p.user_id=p_user AND p.empresa_id='76520131-a559-4faf-a025-495d29ea5098' AND u.email_confirmed_at IS NOT NULL AND lower(u.email) NOT LIKE '%.demo@vertho.ai'),'{"ativo":false}'::jsonb)
$$;

CREATE OR REPLACE FUNCTION public.sim_vendas_vertho_vincular_representante(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sim-vertho:'||p_user::text,0));
  INSERT INTO sim_vendas_vertho_participantes(user_id,empresa_id,tipo,representante_id,nome,criado_por)
  SELECT u.id,'76520131-a559-4faf-a025-495d29ea5098','representante',r.id,r.name,'vinculo-representante-ativo'
  FROM auth.users u JOIN sales_representatives r ON lower(r.email)=lower(u.email)
  WHERE u.id=p_user AND u.email_confirmed_at IS NOT NULL AND r.status='active'
    AND lower(u.email) NOT LIKE '%.demo@vertho.ai'
    AND (r.user_id IS NULL OR r.user_id=u.id)
    AND (SELECT count(*) FROM sales_representatives r2 WHERE lower(r2.email)=lower(u.email))=1
  ON CONFLICT(user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_vertho_inscrever_interno(p_email text,p_ativo boolean,p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE alvo uuid; nome_alvo text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM platform_admins WHERE lower(email)=lower(p_actor) AND role='master') THEN RAISE EXCEPTION 'SIM_GESTAO'; END IF;
  IF lower(trim(p_email)) LIKE '%.demo@vertho.ai' THEN RAISE EXCEPTION 'SIM_CONTA'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email)=lower(trim(p_email)) AND email_confirmed_at IS NOT NULL)<>1 THEN RAISE EXCEPTION 'SIM_CONTA'; END IF;
  SELECT id,coalesce(nullif(raw_user_meta_data->>'full_name',''),nullif(raw_user_meta_data->>'name',''),split_part(email,'@',1)) INTO alvo,nome_alvo
  FROM auth.users WHERE lower(email)=lower(trim(p_email)) AND email_confirmed_at IS NOT NULL;
  INSERT INTO sim_vendas_vertho_participantes(user_id,empresa_id,tipo,nome,ativo,criado_por)
  VALUES(alvo,'76520131-a559-4faf-a025-495d29ea5098','interno',nome_alvo,p_ativo,p_actor)
  ON CONFLICT(user_id) DO UPDATE SET ativo=p_ativo,updated_at=now();
  -- Preserve tipo/vínculo do RC: inscrição interna nunca contorna suspensão do canal.
  RETURN alvo;
END $$;
REVOKE ALL ON FUNCTION public.sim_vendas_vertho_acesso(uuid),public.sim_vendas_vertho_vincular_representante(uuid),public.sim_vendas_vertho_inscrever_interno(text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_vertho_acesso(uuid),public.sim_vendas_vertho_vincular_representante(uuid),public.sim_vendas_vertho_inscrever_interno(text,boolean,text) TO service_role;

ALTER TABLE public.sim_vendas_sessoes ADD COLUMN IF NOT EXISTS vendedor_user_id uuid;
COMMENT ON COLUMN public.sim_vendas_sessoes.vendedor_user_id IS 'Conta individual do treinamento comercial; null para colaborador ou piloto legado.';
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_vendedor_idx ON public.sim_vendas_sessoes(vendedor_user_id,empresa_id);
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_owner_key_check;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_owner_key_check CHECK(owner_key ~ '^(admin|colab|vendedor):[0-9a-f-]{36}$');
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_vendedor_fk;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_vendedor_fk FOREIGN KEY(vendedor_user_id,empresa_id) REFERENCES public.sim_vendas_vertho_participantes(user_id,empresa_id);
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_vendedor_owner_check;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_vendedor_owner_check CHECK(
  (owner_key LIKE 'vendedor:%' AND vendedor_user_id IS NOT NULL AND owner_key='vendedor:'||vendedor_user_id::text AND colaborador_id IS NULL)
  OR (owner_key NOT LIKE 'vendedor:%' AND vendedor_user_id IS NULL));
COMMENT ON COLUMN public.sim_vendas_sessoes.owner_key IS 'Dono estável: admin:<platform_admin_id>, colab:<colaborador_id> ou vendedor:<auth_user_id>. Pilotos e treinos comerciais têm históricos separados.';

CREATE OR REPLACE FUNCTION public.sim_vendas_criar(p_id uuid,p_empresa uuid,p_owner text,p_colaborador uuid,p_estado jsonb,p_admin boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cfg sim_vendas_config%ROWTYPE; vendedor uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_owner,0));
  IF p_owner NOT LIKE 'vendedor:%' AND EXISTS(SELECT 1 FROM sim_vendas_sessoes WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner) THEN RETURN p_id; END IF;
  SELECT * INTO cfg FROM sim_vendas_config WHERE empresa_id=p_empresa;
  IF NOT FOUND OR (NOT p_admin AND NOT cfg.habilitado) THEN RAISE EXCEPTION 'SIM_CONFIG'; END IF;
  IF p_owner LIKE 'vendedor:%' THEN
    IF p_admin OR p_colaborador IS NOT NULL OR p_empresa<>'76520131-a559-4faf-a025-495d29ea5098'::uuid THEN RAISE EXCEPTION 'SIM_OWNER'; END IF;
    vendedor:=substring(p_owner from 10)::uuid;
    IF NOT coalesce((sim_vendas_vertho_acesso(vendedor)->>'ativo')::boolean,false) THEN RAISE EXCEPTION 'SIM_OWNER'; END IF;
  ELSE
    IF p_admin IS DISTINCT FROM (p_owner LIKE 'admin:%') OR (NOT p_admin AND (p_colaborador IS NULL OR p_owner IS DISTINCT FROM 'colab:'||p_colaborador::text)) THEN RAISE EXCEPTION 'SIM_OWNER'; END IF;
    IF NOT p_admin AND (cfg.periodo_inicio IS NULL OR cfg.periodo_fim IS NULL OR now()<cfg.periodo_inicio OR now()>=cfg.periodo_fim) THEN RAISE EXCEPTION 'SIM_PERIODO'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM sim_vendas_sessoes WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner) THEN RETURN p_id; END IF;
  PERFORM sim_vendas_recuperar(p_empresa,p_owner);
  IF EXISTS(SELECT 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND owner_key=p_owner AND estado->>'status' IN ('preparando','em_andamento')) THEN RAISE EXCEPTION 'SIM_ABERTA'; END IF;
  INSERT INTO sim_vendas_sessoes(id,empresa_id,owner_key,colaborador_id,vendedor_user_id,estado) VALUES(p_id,p_empresa,p_owner,p_colaborador,vendedor,p_estado);
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.sim_vendas_criar(uuid,uuid,text,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_criar(uuid,uuid,text,uuid,jsonb,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';

-- Rollback manual: desabilitar o config deste tenant; reverter app. Para remover schema,
-- preservar primeiro as sessões vendedor e participantes; só depois remover constraints,
-- coluna vendedor_user_id e funções novas, e restaurar sim_vendas_criar da mig 250.
-- Não apagar o tenant nem as sessões como parte de um rollback de código.
