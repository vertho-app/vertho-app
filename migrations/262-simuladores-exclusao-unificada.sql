-- 262: a exclusão confirmada de cadastro passa a cobrir os TRÊS simuladores
-- (vendas, atendimento e liderança), e o caminho legado deixa de travar.
--
-- Até aqui só o vendas tinha as duas pontas (mig 251):
--   * caminho legado (reset do demo, DELETE direto): o vínculo com o
--     colaborador vira NULL, o treino não some por efeito colateral;
--   * caminho da interface: prévia com hash, backup privado conferido e
--     exclusão explícita na MESMA transação, com auditoria.
-- Atendimento (`recepcao_sessoes`) e liderança (`sim_lideranca_jornadas`)
-- tinham FK para `colaboradores` SEM regra de exclusão. Efeitos medidos em
-- 18/09/2026: quem treinou atendimento ou liderança não podia ser excluído
-- (23503), e o primeiro treino de uma persona do ACME travaria o reset noturno,
-- que apaga `colaboradores` direto. Nenhum dado existente é apagado aqui.
--
-- Aplicar ANTES do código: o código anterior segue funcionando com as funções
-- novas (o documento do snapshot só GANHA chaves e a assinatura não muda).

-- 1) Caminho legado: desvincula, como o vendas.
ALTER TABLE public.recepcao_sessoes DROP CONSTRAINT IF EXISTS recepcao_sessoes_colaborador_id_fkey;
ALTER TABLE public.recepcao_sessoes ADD CONSTRAINT recepcao_sessoes_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE SET NULL;
ALTER TABLE public.sim_lideranca_jornadas DROP CONSTRAINT IF EXISTS sim_lideranca_jornadas_colaborador_id_empresa_id_fkey;
ALTER TABLE public.sim_lideranca_jornadas ADD CONSTRAINT sim_lideranca_jornadas_colaborador_id_empresa_id_fkey
  FOREIGN KEY (colaborador_id, empresa_id) REFERENCES public.colaboradores(id, empresa_id) ON DELETE SET NULL (colaborador_id);

-- 2) Prévia: o documento (e portanto o hash e o backup) inclui atendimento e liderança.
-- O treino é da PESSOA: casa pelo vínculo OU pela identidade estável (owner_key),
-- porque o vínculo pode já ter sido desfeito por um caminho legado.
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

-- 3) Exclusão confirmada: mesmas travas, mesma transação, os três simuladores.
-- SECURITY DEFINER de propósito: tentativas e revisões do atendimento são
-- só-acréscimo para o service_role (sem DELETE), e continuam assim para todo
-- o resto do código. Só esta função, confirmada por hash e backup, apaga.
CREATE OR REPLACE FUNCTION public.sim_vendas_excluir_cadastro(
  p_empresa uuid,p_colaborador uuid,p_hash text,p_backup text,p_backup_sha256 text,p_autor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET lock_timeout='5s' AS $$
DECLARE snapshot jsonb; cadastro jsonb; dono text;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR nullif(trim(p_autor),'') IS NULL THEN
    RAISE EXCEPTION 'SIM_CONFIRMACAO';
  END IF;
  dono := CASE WHEN p_colaborador IS NULL THEN NULL ELSE 'colab:'||p_colaborador::text END;
  -- A raiz impede novos filhos; as linhas dos treinos impedem alterações de
  -- estado e novos checkpoints. Ordem estável, janela curta, sem upload sob lock.
  PERFORM 1 FROM empresas WHERE id=p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  PERFORM 1 FROM colaboradores WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR id=p_colaborador) ORDER BY id FOR UPDATE;
  IF p_colaborador IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  PERFORM 1 FROM sim_vendas_config WHERE empresa_id=p_empresa FOR UPDATE;
  PERFORM 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR colaborador_id=p_colaborador) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM sim_vendas_tentativas t WHERE t.empresa_id=p_empresa AND EXISTS (
    SELECT 1 FROM sim_vendas_sessoes s WHERE s.id=t.sessao_id AND s.empresa_id=p_empresa
      AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador)) ORDER BY t.id FOR UPDATE;
  PERFORM 1 FROM recepcao_sessoes WHERE empresa_id=p_empresa
    AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM sim_lideranca_jornadas WHERE empresa_id=p_empresa
    AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono) ORDER BY id FOR UPDATE;
  snapshot=sim_vendas_exclusao_snapshot(p_empresa,p_colaborador);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  IF snapshot->>'hash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'SIM_CONFIRMACAO'; END IF;
  IF EXISTS (SELECT 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa
      AND (p_colaborador IS NULL OR colaborador_id=p_colaborador) AND lock_until>=now())
    OR EXISTS (SELECT 1 FROM recepcao_sessoes WHERE empresa_id=p_empresa
      AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono) AND lock_until>=now())
    OR EXISTS (SELECT 1 FROM sim_lideranca_jornadas WHERE empresa_id=p_empresa
      AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono) AND lock_until>=now()) THEN
    RAISE EXCEPTION 'SIM_OCUPADA';
  END IF;
  IF p_backup IS NULL OR p_backup !~ '^pace-exclusao/[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9a-f-]{36}\.json\.gz$'
    OR p_backup_sha256 IS NULL OR p_backup_sha256 !~ '^[0-9a-f]{64}$'
    OR NOT EXISTS (SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
      WHERE o.bucket_id='backups' AND o.name=p_backup AND NOT b.public) THEN
    RAISE EXCEPTION 'SIM_BACKUP';
  END IF;
  cadastro=snapshot#>'{documento,cadastro}';
  -- Auditoria é parte da transação: não se perde quando a empresa é removida
  -- (FK SET NULL), e erro de auditoria também impede a exclusão.
  INSERT INTO admin_audit_log(admin_email,acao,empresa_id,empresa_slug,alvo,detalhes,resultado)
  VALUES(p_autor,'sim_vendas.exclusao_cadastro',p_empresa,cadastro->>'slug',coalesce(p_colaborador,p_empresa)::text,
    jsonb_build_object('empresaId',p_empresa,'colaboradorId',p_colaborador,'sessoes',snapshot->'sessoes',
      'tentativas',snapshot->'tentativas','atendimento',snapshot->'atendimento',
      'liderancaJornadas',snapshot->'lideranca_jornadas','liderancaEncontros',snapshot->'lideranca_encontros',
      'snapshotHash',p_hash,'backup',p_backup,'backupSha256',p_backup_sha256),'ok');
  -- Liderança: filhos antes da jornada (as FKs não cascateiam).
  DELETE FROM sim_lideranca_chamadas k WHERE k.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_lideranca_jornadas j
    WHERE j.id=k.jornada_id AND j.empresa_id=p_empresa AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono));
  DELETE FROM sim_lideranca_episodios e WHERE e.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_lideranca_jornadas j
    WHERE j.id=e.jornada_id AND j.empresa_id=p_empresa AND (p_colaborador IS NULL OR j.colaborador_id=p_colaborador OR j.owner_key=dono));
  DELETE FROM sim_lideranca_jornadas WHERE empresa_id=p_empresa
    AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono);
  -- Atendimento: revisões e tentativas antes da sessão.
  DELETE FROM recepcao_revisoes v WHERE v.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM recepcao_sessoes r
    WHERE r.id=v.sessao_id AND r.empresa_id=p_empresa AND (p_colaborador IS NULL OR r.colaborador_id=p_colaborador OR r.owner_key=dono));
  DELETE FROM recepcao_tentativas t WHERE t.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM recepcao_sessoes r
    WHERE r.id=t.sessao_id AND r.empresa_id=p_empresa AND (p_colaborador IS NULL OR r.colaborador_id=p_colaborador OR r.owner_key=dono));
  DELETE FROM recepcao_sessoes WHERE empresa_id=p_empresa
    AND (p_colaborador IS NULL OR colaborador_id=p_colaborador OR owner_key=dono);
  -- Vendas (cascata sessão -> tentativas, como na 251).
  DELETE FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR colaborador_id=p_colaborador);
  IF p_colaborador IS NULL THEN
    DELETE FROM recepcao_cenarios WHERE empresa_id=p_empresa;
    DELETE FROM recepcao_config WHERE empresa_id=p_empresa;
    DELETE FROM sim_vendas_config WHERE empresa_id=p_empresa;
    DELETE FROM empresas WHERE id=p_empresa;
  ELSE
    DELETE FROM colaboradores WHERE empresa_id=p_empresa AND id=p_colaborador;
  END IF;
  RETURN jsonb_build_object('id',cadastro->'id','nome_completo',cadastro->'nome_completo','nome',cadastro->'nome','slug',cadastro->'slug');
END $$;
REVOKE ALL ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_excluir_cadastro(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_excluir_cadastro(uuid,uuid,text,text,text,text) TO service_role;

NOTIFY pgrst, 'reload schema';
-- Rollback: reaplicar as duas funções da 251 (SECURITY INVOKER, só vendas).
-- As FKs com SET NULL podem permanecer: o caminho legado só desvincula, nunca apaga.
