BEGIN;
-- Revisões humanas entram no backup e no hash de exclusão/retenção.
-- A trava FOR UPDATE dos pais já impede inserções concorrentes pelas FKs.
-- Aplicar antes do app. Não apaga nem altera avaliações existentes.
ALTER TABLE public.sim_lideranca_revisoes ADD COLUMN IF NOT EXISTS contexto jsonb;
COMMENT ON COLUMN public.sim_lideranca_revisoes.contexto IS 'Recorte imutável das devolutivas revisadas, com SHA-256. NULL identifica revisões anteriores à migração 265.';

CREATE OR REPLACE FUNCTION public.sim_vendas_exclusao_snapshot(p_empresa uuid,p_colaborador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cadastro jsonb; documento jsonb; dono text;
BEGIN
  IF p_colaborador IS NULL THEN
    SELECT to_jsonb(e) INTO cadastro FROM empresas e WHERE e.id=p_empresa;
  ELSE
    SELECT to_jsonb(c) INTO cadastro FROM colaboradores c WHERE c.empresa_id=p_empresa AND c.id=p_colaborador;
  END IF;
  IF cadastro IS NULL THEN RETURN NULL; END IF;
  dono := CASE WHEN p_colaborador IS NULL THEN NULL ELSE 'colab:'||p_colaborador::text END;
  documento=jsonb_build_object(
    'empresa_id',p_empresa,'colaborador_id',p_colaborador,'cadastro',cadastro,
    'colaboradores',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM colaboradores c
      WHERE c.empresa_id=p_empresa AND ((p_colaborador IS NOT NULL AND c.id=p_colaborador)
        OR (p_colaborador IS NULL AND (
          EXISTS (SELECT 1 FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa AND s.colaborador_id=c.id)
          OR EXISTS (SELECT 1 FROM recepcao_sessoes r WHERE r.empresa_id=p_empresa AND r.colaborador_id=c.id)
          OR EXISTS (SELECT 1 FROM sim_lideranca_jornadas j WHERE j.empresa_id=p_empresa AND j.colaborador_id=c.id))))),'[]'::jsonb),
    'config',CASE WHEN p_colaborador IS NULL THEN (SELECT to_jsonb(c) FROM sim_vendas_config c WHERE c.empresa_id=p_empresa) ELSE NULL END,
    'sessoes',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM sim_vendas_sessoes s
      WHERE s.empresa_id=p_empresa AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador)),'[]'::jsonb),
    'tentativas',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM sim_vendas_tentativas t
      WHERE t.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_vendas_sessoes s
        WHERE s.id=t.sessao_id AND s.empresa_id=p_empresa AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador))),'[]'::jsonb),
    'vendas_revisoes',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM sim_vendas_revisoes v
      WHERE v.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_vendas_sessoes s WHERE s.id=v.sessao_id AND s.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador))),'[]'::jsonb),
    'recepcao_config',CASE WHEN p_colaborador IS NULL THEN (SELECT to_jsonb(c) FROM recepcao_config c WHERE c.empresa_id=p_empresa) ELSE NULL END,
    'recepcao_cenarios',CASE WHEN p_colaborador IS NULL THEN coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id)
      FROM recepcao_cenarios c WHERE c.empresa_id=p_empresa),'[]'::jsonb) ELSE '[]'::jsonb END,
    'recepcao_sessoes',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM recepcao_sessoes r
      WHERE r.empresa_id=p_empresa AND (p_colaborador IS NULL OR r.colaborador_id=p_colaborador OR r.owner_key=dono)),'[]'::jsonb),
    'recepcao_tentativas',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM recepcao_tentativas t
      WHERE t.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM recepcao_sessoes r WHERE r.id=t.sessao_id AND r.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR r.colaborador_id=p_colaborador OR r.owner_key=dono))),'[]'::jsonb),
    'recepcao_revisoes',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM recepcao_revisoes v
      WHERE v.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM recepcao_sessoes r WHERE r.id=v.sessao_id AND r.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR r.colaborador_id=p_colaborador OR r.owner_key=dono))),'[]'::jsonb),
    'lideranca_jornadas',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM sim_lideranca_jornadas j
      WHERE j.empresa_id=p_empresa AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono)),'[]'::jsonb),
    'lideranca_episodios',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM sim_lideranca_episodios e
      WHERE e.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_lideranca_jornadas j WHERE j.id=e.jornada_id AND j.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono))),'[]'::jsonb),
    'lideranca_revisoes',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM sim_lideranca_revisoes v
      WHERE v.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_lideranca_jornadas j WHERE j.id=v.jornada_id AND j.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono))),'[]'::jsonb),
    'lideranca_chamadas',coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.id) FROM sim_lideranca_chamadas k
      WHERE k.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_lideranca_jornadas j WHERE j.id=k.jornada_id AND j.empresa_id=p_empresa
        AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono))),'[]'::jsonb)
  );
  RETURN jsonb_build_object('documento',documento,
    'hash',encode(sha256(convert_to(documento::text,'UTF8')),'hex'),
    'sessoes',jsonb_array_length(documento->'sessoes'),
    'tentativas',jsonb_array_length(documento->'tentativas'),
    'atendimento',jsonb_array_length(documento->'recepcao_sessoes'),
    'lideranca_jornadas',jsonb_array_length(documento->'lideranca_jornadas'),
    'lideranca_encontros',jsonb_array_length(documento->'lideranca_episodios'));
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_backup_sessao(p_empresa uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT jsonb_build_object('sessao',to_jsonb(s),'tentativas',coalesce((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM sim_vendas_tentativas t
    WHERE t.empresa_id=p_empresa AND t.sessao_id=s.id),'[]'::jsonb),
    'revisoes',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM sim_vendas_revisoes v
      WHERE v.empresa_id=p_empresa AND v.sessao_id=s.id),'[]'::jsonb))
  FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa AND s.id=p_id
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_backup_sessao(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_backup_sessao(uuid,uuid) TO service_role;
-- Uma revisão recente permanece pelo mesmo prazo de seis meses das tentativas.
CREATE OR REPLACE FUNCTION public.sim_vendas_retencao_lote(p_empresa uuid,p_limite integer DEFAULT 5) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH candidatas AS (
    SELECT s.id FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa
      AND sim_vendas_retencao_expira(coalesce(nullif(s.estado->>'encerradoEm','')::timestamptz,s.updated_at))<=now()
      AND (s.lock_until IS NULL OR s.lock_until<now())
      AND NOT EXISTS(SELECT 1 FROM sim_vendas_tentativas t WHERE t.empresa_id=p_empresa AND t.sessao_id=s.id
        AND sim_vendas_retencao_expira(greatest(t.created_at,t.finished_at))>now())
      AND NOT EXISTS(SELECT 1 FROM sim_vendas_revisoes v WHERE v.empresa_id=p_empresa AND v.sessao_id=s.id
        AND sim_vendas_retencao_expira(v.created_at)>now())
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
  IF EXISTS(SELECT 1 FROM sim_vendas_revisoes WHERE empresa_id=p_empresa AND sessao_id=p_id
    AND sim_vendas_retencao_expira(created_at)>now()) THEN RETURN false; END IF;
  documento=sim_vendas_backup_sessao(p_empresa,p_id);
  IF encode(sha256(convert_to(documento::text,'UTF8')),'hex') IS DISTINCT FROM p_hash THEN RETURN false; END IF;
  DELETE FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND id=p_id;
  RETURN true;
END $$;

NOTIFY pgrst, 'reload schema';
-- Rollback do app é compatível; manter funções e coluna para preservar os backups.

COMMIT;
