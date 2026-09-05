BEGIN;
ALTER TABLE public.recepcao_sessoes ADD COLUMN IF NOT EXISTS owner_key text;
UPDATE public.recepcao_sessoes s SET owner_key='admin:'||a.id::text
FROM public.platform_admins a WHERE lower(trim(a.email))=lower(trim(s.owner_email)) AND s.owner_key IS NULL;
UPDATE public.recepcao_sessoes SET owner_key='colab:'||colaborador_id::text WHERE owner_key IS NULL AND colaborador_id IS NOT NULL;
UPDATE public.recepcao_sessoes s SET owner_key='colab:'||c.id::text, colaborador_id=c.id
FROM public.colaboradores c WHERE c.empresa_id=s.empresa_id AND lower(trim(c.email))=lower(trim(s.owner_email)) AND s.owner_key IS NULL
AND (SELECT count(*) FROM public.colaboradores x WHERE x.empresa_id=s.empresa_id AND lower(trim(x.email))=lower(trim(s.owner_email)))=1;
CREATE INDEX IF NOT EXISTS recepcao_sessoes_actor ON public.recepcao_sessoes(empresa_id,owner_key,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recepcao_sessoes_tenant_id ON public.recepcao_sessoes(id,empresa_id);
-- Compatibilidade durante o deploy: a versão anterior ainda cria por e-mail.
-- A chave é resolvida uma vez na criação e não muda quando o e-mail muda.
CREATE OR REPLACE FUNCTION public.recepcao_owner_inicial() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid;
BEGIN
 IF NEW.owner_key IS NULL THEN
  SELECT id INTO ident FROM platform_admins WHERE lower(trim(email))=lower(trim(NEW.owner_email));
  IF ident IS NOT NULL THEN NEW.owner_key='admin:'||ident::text;
  ELSIF NEW.colaborador_id IS NOT NULL THEN
   SELECT id INTO ident FROM colaboradores WHERE id=NEW.colaborador_id AND empresa_id=NEW.empresa_id;
   IF ident IS NOT NULL THEN NEW.owner_key='colab:'||ident::text; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recepcao_owner_inicial ON public.recepcao_sessoes;
CREATE TRIGGER recepcao_owner_inicial BEFORE INSERT ON public.recepcao_sessoes FOR EACH ROW EXECUTE FUNCTION public.recepcao_owner_inicial();

CREATE TABLE IF NOT EXISTS public.recepcao_cenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid REFERENCES public.empresas(id),
 codigo text NOT NULL, versao text NOT NULL, conteudo jsonb NOT NULL,
 estado text NOT NULL DEFAULT 'rascunho' CHECK(estado IN('rascunho','publicado','arquivado')),
 revisao integer NOT NULL DEFAULT 0, created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS recepcao_cenarios_version ON public.recepcao_cenarios(coalesce(empresa_id,'00000000-0000-0000-0000-000000000000'::uuid),codigo,versao);
CREATE OR REPLACE FUNCTION public.recepcao_cenario_imutavel() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.estado<>'rascunho' AND (NEW.conteudo IS DISTINCT FROM OLD.conteudo OR NEW.codigo<>OLD.codigo OR NEW.versao<>OLD.versao OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.estado NOT IN('publicado','arquivado')) THEN
  RAISE EXCEPTION 'Versão publicada é imutável; crie nova versão';
 END IF;
 IF OLD.estado='arquivado' AND NEW.estado<>'arquivado' THEN RAISE EXCEPTION 'Versão arquivada é imutável'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS recepcao_cenario_imutavel ON public.recepcao_cenarios;
CREATE TRIGGER recepcao_cenario_imutavel BEFORE UPDATE ON public.recepcao_cenarios FOR EACH ROW EXECUTE FUNCTION public.recepcao_cenario_imutavel();

CREATE TABLE IF NOT EXISTS public.recepcao_tentativas (
 id uuid PRIMARY KEY, sessao_id uuid NOT NULL REFERENCES public.recepcao_sessoes(id),
 empresa_id uuid NOT NULL REFERENCES public.empresas(id), etapa text NOT NULL,
 modelo_solicitado text, prompt_hash text, prompt_versao text, cenario_versao text,
 estado text NOT NULL DEFAULT 'iniciada', erro_codigo text, erro_campo text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, duracao_ms integer,
 FOREIGN KEY(sessao_id,empresa_id) REFERENCES public.recepcao_sessoes(id,empresa_id)
);
CREATE INDEX IF NOT EXISTS recepcao_tentativas_session ON public.recepcao_tentativas(empresa_id,sessao_id,created_at);
ALTER TABLE public.ia_usage_log ADD COLUMN IF NOT EXISTS correlation_id uuid;
CREATE INDEX IF NOT EXISTS ia_usage_log_correlation ON public.ia_usage_log(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.recepcao_revisoes (
 id uuid PRIMARY KEY, empresa_id uuid NOT NULL REFERENCES public.empresas(id),
 sessao_id uuid NOT NULL REFERENCES public.recepcao_sessoes(id), revisor_key text NOT NULL,
 revisor_nome text NOT NULL, parecer text NOT NULL CHECK(parecer IN('concordo','parcialmente','discordo')),
 motivo text NOT NULL CHECK(length(motivo) BETWEEN 1 AND 4000), dimensoes jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(sessao_id,empresa_id) REFERENCES public.recepcao_sessoes(id,empresa_id)
);
CREATE INDEX IF NOT EXISTS recepcao_revisoes_session ON public.recepcao_revisoes(empresa_id,sessao_id,created_at DESC);

ALTER TABLE public.recepcao_cenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepcao_tentativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recepcao_revisoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recepcao_cenarios,public.recepcao_tentativas,public.recepcao_revisoes FROM anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.recepcao_cenarios,public.recepcao_tentativas TO service_role;
GRANT SELECT,INSERT ON public.recepcao_revisoes TO service_role;

CREATE OR REPLACE FUNCTION public.recepcao_claim_v2(p_id uuid,p_empresa uuid,p_owner text,p_revisao integer,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE recepcao_sessoes SET lock_token=p_token,lock_until=clock_timestamp()+interval '330 seconds'
 WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner AND revisao=p_revisao
 AND(lock_until IS NULL OR lock_until<clock_timestamp());
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
CREATE OR REPLACE FUNCTION public.recepcao_commit_v2(p_id uuid,p_empresa uuid,p_owner text,p_revisao integer,p_token uuid,p_estado jsonb,p_chamadas jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF (p_estado->>'revisao')::integer IS DISTINCT FROM p_revisao+1 THEN RAISE EXCEPTION 'revisao invalida'; END IF;
 UPDATE recepcao_sessoes SET estado=p_estado,revisao=p_revisao+1,chamadas=chamadas||p_chamadas,lock_token=NULL,lock_until=NULL,updated_at=clock_timestamp()
 WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner AND revisao=p_revisao AND lock_token=p_token;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.recepcao_claim_v2(uuid,uuid,text,integer,uuid),public.recepcao_commit_v2(uuid,uuid,text,integer,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recepcao_claim_v2(uuid,uuid,text,integer,uuid),public.recepcao_commit_v2(uuid,uuid,text,integer,uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
