-- PACE v2: uso ilimitado dentro do prazo contratado (decisão 13/09/2026).
-- Não habilita empresas, não remove sessões e não recalcula relatórios existentes.
ALTER TABLE public.sim_vendas_config ADD COLUMN IF NOT EXISTS revisao integer NOT NULL DEFAULT 1;
ALTER TABLE public.sim_vendas_config ADD COLUMN IF NOT EXISTS periodo_inicio timestamptz;
ALTER TABLE public.sim_vendas_config ADD COLUMN IF NOT EXISTS periodo_fim timestamptz;
COMMENT ON COLUMN public.sim_vendas_config.revisao IS 'Compare-and-swap da configuração. Criação exige revisão 0; edição exige a versão lida.';
COMMENT ON COLUMN public.sim_vendas_config.periodo_inicio IS 'Início inclusivo do prazo contratado; sem limite de uso ou gasto no período.';
COMMENT ON COLUMN public.sim_vendas_config.periodo_fim IS 'Fim exclusivo do prazo contratado. Histórico continua consultável durante a retenção.';
COMMENT ON COLUMN public.sim_vendas_config.limite_sessoes IS 'Legado v1, não aplicado pelo v2. Uso ilimitado dentro do prazo contratado.';
ALTER TABLE public.sim_vendas_config DROP CONSTRAINT IF EXISTS sim_vendas_config_periodo_check;
ALTER TABLE public.sim_vendas_config ADD CONSTRAINT sim_vendas_config_periodo_check CHECK (
  (periodo_inicio IS NULL AND periodo_fim IS NULL AND NOT habilitado)
  OR (periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL AND periodo_fim > periodo_inicio)
);

CREATE TABLE IF NOT EXISTS public.sim_vendas_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa text NOT NULL CHECK (etapa IN ('criador','cliente','moderador','intencao','gerente')),
  versao text NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sim_vendas_prompt_versions_ux UNIQUE(etapa,versao,hash),
  CONSTRAINT sim_vendas_prompt_versions_conteudo_sha_check CHECK (hash = encode(sha256(convert_to(conteudo,'UTF8')),'hex'))
);
COMMENT ON COLUMN public.sim_vendas_prompt_versions.id IS 'Referência imutável de template do produto; não contém insumo de tenant.';
COMMENT ON COLUMN public.sim_vendas_prompt_versions.etapa IS 'Agente PACE consumidor do template.';
COMMENT ON COLUMN public.sim_vendas_prompt_versions.versao IS 'Versão literal do contrato de prompt.';
COMMENT ON COLUMN public.sim_vendas_prompt_versions.hash IS 'SHA-256 do conteúdo UTF-8, verificado pelo banco e pelo leitor.';
COMMENT ON COLUMN public.sim_vendas_prompt_versions.conteudo IS 'Template estático literal, sem briefing nem conversa interpolados.';
COMMENT ON COLUMN public.sim_vendas_prompt_versions.created_at IS 'Data do arquivamento; versões referenciadas são preservadas.';
ALTER TABLE public.sim_vendas_prompt_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_vendas_prompt_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.sim_vendas_prompt_versions TO service_role;
CREATE OR REPLACE FUNCTION public.sim_vendas_prompt_imutavel() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'SIM_PROMPT_IMUTAVEL'; END $$;
DROP TRIGGER IF EXISTS sim_vendas_prompt_imutavel ON public.sim_vendas_prompt_versions;
CREATE TRIGGER sim_vendas_prompt_imutavel BEFORE UPDATE OR DELETE ON public.sim_vendas_prompt_versions
FOR EACH ROW EXECUTE FUNCTION public.sim_vendas_prompt_imutavel();
REVOKE ALL ON FUNCTION public.sim_vendas_prompt_imutavel() FROM PUBLIC, anon, authenticated;

-- Somente conversões JSON/texto/bool; sem locale, datas ou relógio na função imutável.
CREATE OR REPLACE FUNCTION public.sim_vendas_resumo(estado jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path=public AS $$ SELECT
  jsonb_build_object('status',estado->>'status','nivel',estado->'nivel',
    'nome',estado#>>'{cenario,personagem,nome}','nomeVendedor',estado->>'nomeVendedor',
    'nota',estado#>'{relatorio,Media}','temRelatorio',estado->'relatorio' IS NOT NULL AND estado->'relatorio'<>'null'::jsonb,
    'versaoRegua',coalesce(estado->>'versaoRegua','pace-1'))
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_resumo(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_resumo(jsonb) TO service_role;
-- Coluna projetada: listagens nunca precisam de estado, mensagens ou templates.
ALTER TABLE public.sim_vendas_sessoes ADD COLUMN IF NOT EXISTS resumo jsonb GENERATED ALWAYS AS (public.sim_vendas_resumo(estado)) STORED;
COMMENT ON COLUMN public.sim_vendas_sessoes.resumo IS 'Projeção mínima de histórico/gestão, sem conversa, gabarito ou briefing.';
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_empresa_ordem_idx ON public.sim_vendas_sessoes(empresa_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_owner_ordem_idx ON public.sim_vendas_sessoes(empresa_id,owner_key,created_at DESC,id DESC);

-- Excluir um cadastro exclui também seus treinos. Não há exclusão executada aqui.
-- Aplicações devem apresentar prévia/confirmar esse impacto antes do DELETE da entidade raiz.
ALTER TABLE public.sim_vendas_config DROP CONSTRAINT IF EXISTS sim_vendas_config_empresa_id_fkey;
ALTER TABLE public.sim_vendas_config ADD CONSTRAINT sim_vendas_config_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_empresa_id_fkey;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_colab_fk;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_colab_fk FOREIGN KEY(colaborador_id,empresa_id) REFERENCES public.colaboradores(id,empresa_id) ON DELETE CASCADE;
ALTER TABLE public.sim_vendas_tentativas DROP CONSTRAINT IF EXISTS sim_vendas_tentativas_empresa_id_fkey;
ALTER TABLE public.sim_vendas_tentativas ADD CONSTRAINT sim_vendas_tentativas_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
ALTER TABLE public.sim_vendas_tentativas DROP CONSTRAINT IF EXISTS sim_vendas_tentativas_sessao_fk;
ALTER TABLE public.sim_vendas_tentativas ADD CONSTRAINT sim_vendas_tentativas_sessao_fk FOREIGN KEY(sessao_id,empresa_id) REFERENCES public.sim_vendas_sessoes(id,empresa_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.sim_vendas_configurar(p_empresa uuid,p_revisao integer,p_habilitado boolean,p_briefing text,p_inicio timestamptz,p_fim timestamptz,p_autor text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE atual integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sim-vendas-config:'||p_empresa::text,0));
  IF NOT EXISTS(SELECT 1 FROM empresas WHERE id=p_empresa) THEN RAISE EXCEPTION 'SIM_EMPRESA'; END IF;
  SELECT revisao INTO atual FROM sim_vendas_config WHERE empresa_id=p_empresa FOR UPDATE;
  IF coalesce(atual,0) <> p_revisao THEN RAISE EXCEPTION 'SIM_REVISAO'; END IF;
  INSERT INTO sim_vendas_config(empresa_id,habilitado,briefing,limite_sessoes,revisao,periodo_inicio,periodo_fim,updated_by)
  VALUES(p_empresa,p_habilitado,p_briefing,NULL,1,p_inicio,p_fim,p_autor)
  ON CONFLICT(empresa_id) DO UPDATE SET habilitado=p_habilitado,briefing=p_briefing,limite_sessoes=NULL,
    revisao=sim_vendas_config.revisao+1,periodo_inicio=p_inicio,periodo_fim=p_fim,updated_by=p_autor,updated_at=now();
  RETURN coalesce(atual,0)+1;
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_recuperar(p_empresa uuid,p_owner text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  -- Apenas preparação sem cenário, sem lease viva e sem atividade técnica há uma hora.
  UPDATE sim_vendas_sessoes s SET estado=jsonb_set(jsonb_set(jsonb_set(s.estado,'{status}','"abandonada"'),'{encerradoEm}',to_jsonb(now())),'{revisao}',to_jsonb(s.revisao+1)),
    revisao=s.revisao+1,lock_token=NULL,lock_until=NULL,updated_at=now()
  WHERE s.empresa_id=p_empresa AND s.owner_key=p_owner AND s.estado->>'status'='preparando'
    AND (s.estado->'cenario' IS NULL OR s.estado->'cenario'='null'::jsonb)
    AND (s.lock_until IS NULL OR s.lock_until<now()) AND s.updated_at<now()-interval '1 hour'
    AND NOT EXISTS(SELECT 1 FROM sim_vendas_tentativas t WHERE t.empresa_id=p_empresa AND t.sessao_id=s.id AND t.created_at>=now()-interval '1 hour');
  GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_criar(p_id uuid,p_empresa uuid,p_owner text,p_colaborador uuid,p_estado jsonb,p_admin boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cfg sim_vendas_config%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa::text||p_owner,0));
  IF EXISTS(SELECT 1 FROM sim_vendas_sessoes WHERE id=p_id AND empresa_id=p_empresa AND owner_key=p_owner) THEN RETURN p_id; END IF;
  SELECT * INTO cfg FROM sim_vendas_config WHERE empresa_id=p_empresa;
  IF NOT FOUND OR (NOT p_admin AND NOT cfg.habilitado) THEN RAISE EXCEPTION 'SIM_CONFIG'; END IF;
  IF NOT p_admin AND (cfg.periodo_inicio IS NULL OR cfg.periodo_fim IS NULL OR now()<cfg.periodo_inicio OR now()>=cfg.periodo_fim) THEN RAISE EXCEPTION 'SIM_PERIODO'; END IF;
  IF p_admin IS DISTINCT FROM (p_owner LIKE 'admin:%') OR (NOT p_admin AND p_owner IS DISTINCT FROM 'colab:'||p_colaborador::text) THEN RAISE EXCEPTION 'SIM_OWNER'; END IF;
  PERFORM sim_vendas_recuperar(p_empresa,p_owner);
  IF EXISTS(SELECT 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND owner_key=p_owner AND estado->>'status' IN ('preparando','em_andamento')) THEN RAISE EXCEPTION 'SIM_ABERTA'; END IF;
  INSERT INTO sim_vendas_sessoes(id,empresa_id,owner_key,colaborador_id,estado) VALUES(p_id,p_empresa,p_owner,p_colaborador,p_estado);
  RETURN p_id;
END $$;

REVOKE ALL ON FUNCTION public.sim_vendas_configurar(uuid,integer,boolean,text,timestamptz,timestamptz,text),public.sim_vendas_recuperar(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_configurar(uuid,integer,boolean,text,timestamptz,timestamptz,text),public.sim_vendas_recuperar(uuid,text) TO service_role;
GRANT DELETE ON public.sim_vendas_sessoes,public.sim_vendas_tentativas TO service_role;

-- Um SELECT = um snapshot MVCC, sem offset entre páginas e sem enviar conversas ao exportador.
CREATE OR REPLACE FUNCTION public.sim_vendas_exportar(p_empresa uuid,p_colaboradores uuid[],p_inicio timestamptz,p_fim timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH recorte AS (
    SELECT id,created_at,colaborador_id,estado FROM sim_vendas_sessoes
    WHERE empresa_id=p_empresa AND (p_colaboradores IS NULL OR colaborador_id=ANY(p_colaboradores))
      AND (p_inicio IS NULL OR created_at>=p_inicio) AND (p_fim IS NULL OR created_at<p_fim)
    ORDER BY created_at DESC,id DESC LIMIT 3001
  ), linhas AS (
    SELECT jsonb_build_object('id',id,'nomeVendedor',estado->>'nomeVendedor','testeAdmin',colaborador_id IS NULL,
      'criadoEm',created_at,'nivel',estado->'nivel','status',estado->>'status','versaoRegua',coalesce(estado->>'versaoRegua','pace-1'),
      'P',estado#>'{relatorio,P}','A',estado#>'{relatorio,A}','C',estado#>'{relatorio,C}','E',estado#>'{relatorio,E}',
      'Media',estado#>'{relatorio,Media}','Resumo',estado#>>'{relatorio,Resumo}') linha,created_at,id FROM recorte
  ) SELECT CASE WHEN (SELECT count(*) FROM recorte)>3000 THEN jsonb_build_object('excedido',true,'linhas','[]'::jsonb)
    ELSE jsonb_build_object('excedido',false,'linhas',coalesce((SELECT jsonb_agg(linha ORDER BY created_at DESC,id DESC) FROM linhas),'[]'::jsonb)) END;
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_exportar(uuid,uuid[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_exportar(uuid,uuid[],timestamptz,timestamptz) TO service_role;
-- Retenção: seis MESES corridos em UTC, não 180 dias. Cada sessão carrega suas
-- tentativas até vencerem também; atividade recente/lease viva impede o expurgo.
CREATE OR REPLACE FUNCTION public.sim_vendas_retencao_expira(p_base timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT (p_base AT TIME ZONE 'UTC' + interval '6 months') AT TIME ZONE 'UTC'
$$;
CREATE OR REPLACE FUNCTION public.sim_vendas_backup_sessao(p_empresa uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT jsonb_build_object('sessao',to_jsonb(s),'tentativas',coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM sim_vendas_tentativas t
    WHERE t.empresa_id=p_empresa AND t.sessao_id=s.id),'[]'::jsonb))
  FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa AND s.id=p_id
$$;
CREATE OR REPLACE FUNCTION public.sim_vendas_retencao_lote(p_empresa uuid,p_limite integer DEFAULT 5) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH candidatas AS (
    SELECT s.id FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa
      AND sim_vendas_retencao_expira(coalesce(nullif(s.estado->>'encerradoEm','')::timestamptz,s.updated_at))<=now()
      AND (s.lock_until IS NULL OR s.lock_until<now())
      AND NOT EXISTS(SELECT 1 FROM sim_vendas_tentativas t WHERE t.empresa_id=p_empresa AND t.sessao_id=s.id
        AND sim_vendas_retencao_expira(greatest(t.created_at,t.finished_at))>now())
    ORDER BY s.updated_at,s.id LIMIT greatest(1,least(p_limite,10))
  ), snapshots AS (SELECT id,sim_vendas_backup_sessao(p_empresa,id) documento FROM candidatas)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'documento',documento,
    'hash',encode(sha256(convert_to(documento::text,'UTF8')),'hex'))),'[]'::jsonb) FROM snapshots
$$;
CREATE OR REPLACE FUNCTION public.sim_vendas_expurgar(p_empresa uuid,p_id uuid,p_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s sim_vendas_sessoes%ROWTYPE; documento jsonb;
BEGIN
  SELECT * INTO s FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF (s.lock_until IS NOT NULL AND s.lock_until>=now()) OR
    sim_vendas_retencao_expira(coalesce(nullif(s.estado->>'encerradoEm','')::timestamptz,s.updated_at))>now() THEN RETURN false; END IF;
  -- Bloqueia alterações de checkpoint; a FK impede novas tentativas enquanto a
  -- sessão está travada. Hash inclui TODAS as colunas, não só a revisão da UI.
  PERFORM 1 FROM sim_vendas_tentativas WHERE empresa_id=p_empresa AND sessao_id=p_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM sim_vendas_tentativas WHERE empresa_id=p_empresa AND sessao_id=p_id
    AND sim_vendas_retencao_expira(greatest(created_at,finished_at))>now()) THEN RETURN false; END IF;
  documento=sim_vendas_backup_sessao(p_empresa,p_id);
  IF encode(sha256(convert_to(documento::text,'UTF8')),'hex') IS DISTINCT FROM p_hash THEN RETURN false; END IF;
  DELETE FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND id=p_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.sim_vendas_retencao_expira(timestamptz),public.sim_vendas_backup_sessao(uuid,uuid),
  public.sim_vendas_retencao_lote(uuid,integer),public.sim_vendas_expurgar(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_retencao_expira(timestamptz),public.sim_vendas_backup_sessao(uuid,uuid),
  public.sim_vendas_retencao_lote(uuid,integer),public.sim_vendas_expurgar(uuid,uuid,text) TO service_role;
CREATE INDEX IF NOT EXISTS sim_vendas_sessoes_retencao_idx ON public.sim_vendas_sessoes(empresa_id,updated_at,id);

-- POST/RPC evita URLs quilométricas de .in() em equipes grandes.
CREATE OR REPLACE FUNCTION public.sim_vendas_historico_equipe(p_empresa uuid,p_colaboradores uuid[],p_em timestamptz,p_id uuid)
RETURNS TABLE(id uuid,created_at timestamptz,colaborador_id uuid,resumo jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT s.id,s.created_at,s.colaborador_id,s.resumo FROM sim_vendas_sessoes s
  WHERE s.empresa_id=p_empresa AND (p_colaboradores IS NULL OR s.colaborador_id=ANY(p_colaboradores))
    AND (p_em IS NULL OR (s.created_at,s.id)<(p_em,p_id))
  ORDER BY s.created_at DESC,s.id DESC LIMIT 51
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid) TO service_role;

-- Compactação de snapshots legados: arquiva o MESMO literal/hash e troca só a
-- representação. Não toca notas, evidências, recibos, versão da régua ou datas.
-- Aplicar com backup JSON prévio das três tabelas, pelo procedimento do projeto.
DO $$
DECLARE s record; v_etapa text; spec jsonb; refs jsonb; prompt_id uuid;
BEGIN
  FOR s IN SELECT id,empresa_id,estado FROM sim_vendas_sessoes
    WHERE (lock_until IS NULL OR lock_until<now()) AND EXISTS(
      SELECT 1 FROM jsonb_each(estado->'prompts') p WHERE p.value ? 'texto') FOR UPDATE
  LOOP
    refs=s.estado->'prompts';
    FOREACH v_etapa IN ARRAY ARRAY['criador','cliente','moderador','intencao','gerente'] LOOP
      spec=refs->v_etapa;
      IF spec ? 'texto' THEN
        INSERT INTO sim_vendas_prompt_versions(etapa,versao,hash,conteudo)
          VALUES(v_etapa,spec->>'versao',spec->>'hash',spec->>'texto') ON CONFLICT DO NOTHING;
        SELECT id INTO STRICT prompt_id FROM sim_vendas_prompt_versions p
          WHERE p.etapa=v_etapa AND p.versao=spec->>'versao' AND p.hash=spec->>'hash' AND p.conteudo=spec->>'texto';
        refs=jsonb_set(refs,ARRAY[v_etapa],(spec-'texto')||jsonb_build_object('id',prompt_id));
      END IF;
    END LOOP;
    UPDATE sim_vendas_sessoes SET estado=jsonb_set(estado,'{prompts}',refs) WHERE id=s.id AND empresa_id=s.empresa_id;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
-- Rollback operacional: desabilitar o módulo e reverter o deploy; manter dados e catálogo.
-- Não reverter automaticamente para cotas v1 nem apagar versões arquivadas.
