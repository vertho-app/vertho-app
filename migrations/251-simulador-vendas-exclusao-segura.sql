-- PACE: exclusão administrativa com confirmação/backup e retenção retomável.
-- Não exclui registros existentes. Aplicar ANTES do código consumidor.
CREATE TABLE IF NOT EXISTS public.sim_vendas_manutencao (
  chave text PRIMARY KEY CHECK (chave = 'retencao'),
  cursor_empresa uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.sim_vendas_manutencao IS 'Registro global operacional, sem conversas ou dados de participantes. Cursor circular da manutenção.';
COMMENT ON COLUMN public.sim_vendas_manutencao.chave IS 'Identificador do job global de retenção PACE.';
COMMENT ON COLUMN public.sim_vendas_manutencao.cursor_empresa IS 'Última empresa concluída; sem FK para sobreviver à exclusão administrativa. NULL reinicia a varredura.';
COMMENT ON COLUMN public.sim_vendas_manutencao.updated_at IS 'Último checkpoint da manutenção.';
ALTER TABLE public.sim_vendas_manutencao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sim_vendas_manutencao FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.sim_vendas_manutencao TO service_role;

-- DELETE direto da empresa não pode contornar a proteção PACE.
-- A RPC abaixo remove dependentes e raiz na MESMA transação após backup.
-- A cascata sessão -> tentativas permanece, para o expurgo já existente.
ALTER TABLE public.sim_vendas_config DROP CONSTRAINT IF EXISTS sim_vendas_config_empresa_id_fkey;
ALTER TABLE public.sim_vendas_config ADD CONSTRAINT sim_vendas_config_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE NO ACTION;
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_empresa_id_fkey;
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE NO ACTION;
ALTER TABLE public.sim_vendas_sessoes DROP CONSTRAINT IF EXISTS sim_vendas_sessoes_colab_fk;
-- Caminhos legados (ex.: reset de demo) apenas desassociam o cadastro. Nunca
-- apagam o treino por efeito colateral, nem deixam o reset pela metade. A UI
-- administrativa usa a RPC com confirmação para excluir o acervo explicitamente.
ALTER TABLE public.sim_vendas_sessoes ADD CONSTRAINT sim_vendas_sessoes_colab_fk FOREIGN KEY(colaborador_id,empresa_id) REFERENCES public.colaboradores(id,empresa_id) ON DELETE SET NULL (colaborador_id);
ALTER TABLE public.sim_vendas_tentativas DROP CONSTRAINT IF EXISTS sim_vendas_tentativas_empresa_id_fkey;
ALTER TABLE public.sim_vendas_tentativas ADD CONSTRAINT sim_vendas_tentativas_empresa_id_fkey FOREIGN KEY(empresa_id) REFERENCES public.empresas(id) ON DELETE NO ACTION;
GRANT DELETE ON public.sim_vendas_config TO service_role;

CREATE OR REPLACE FUNCTION public.sim_vendas_exclusao_snapshot(p_empresa uuid,p_colaborador uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE cadastro jsonb; documento jsonb;
BEGIN
  IF p_colaborador IS NULL THEN
    SELECT to_jsonb(e) INTO cadastro FROM empresas e WHERE e.id=p_empresa;
  ELSE
    SELECT to_jsonb(c) INTO cadastro FROM colaboradores c WHERE c.empresa_id=p_empresa AND c.id=p_colaborador;
  END IF;
  IF cadastro IS NULL THEN RETURN NULL; END IF;
  documento=jsonb_build_object(
    'empresa_id',p_empresa,'colaborador_id',p_colaborador,'cadastro',cadastro,
    'colaboradores',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM colaboradores c
      WHERE c.empresa_id=p_empresa AND ((p_colaborador IS NOT NULL AND c.id=p_colaborador)
        OR (p_colaborador IS NULL AND EXISTS (SELECT 1 FROM sim_vendas_sessoes s WHERE s.empresa_id=p_empresa AND s.colaborador_id=c.id)))),'[]'::jsonb),
    'config',CASE WHEN p_colaborador IS NULL THEN (SELECT to_jsonb(c) FROM sim_vendas_config c WHERE c.empresa_id=p_empresa) ELSE NULL END,
    'sessoes',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM sim_vendas_sessoes s
      WHERE s.empresa_id=p_empresa AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador)),'[]'::jsonb),
    'tentativas',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM sim_vendas_tentativas t
      WHERE t.empresa_id=p_empresa AND EXISTS (SELECT 1 FROM sim_vendas_sessoes s
        WHERE s.id=t.sessao_id AND s.empresa_id=p_empresa AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador))),'[]'::jsonb)
  );
  RETURN jsonb_build_object('documento',documento,
    'hash',encode(sha256(convert_to(documento::text,'UTF8')),'hex'),
    'sessoes',jsonb_array_length(documento->'sessoes'),
    'tentativas',jsonb_array_length(documento->'tentativas'));
END $$;

CREATE OR REPLACE FUNCTION public.sim_vendas_excluir_cadastro(
  p_empresa uuid,p_colaborador uuid,p_hash text,p_backup text,p_backup_sha256 text,p_autor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public SET lock_timeout='5s' AS $$
DECLARE snapshot jsonb; cadastro jsonb;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR nullif(trim(p_autor),'') IS NULL THEN
    RAISE EXCEPTION 'SIM_CONFIRMACAO';
  END IF;
  -- A raiz impede novos filhos; sessões/tentativas impedem alterações de estado
  -- e novos checkpoints. Ordem estável, janela curta, sem upload sob lock.
  PERFORM 1 FROM empresas WHERE id=p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  PERFORM 1 FROM colaboradores WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR id=p_colaborador) ORDER BY id FOR UPDATE;
  IF p_colaborador IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  PERFORM 1 FROM sim_vendas_config WHERE empresa_id=p_empresa FOR UPDATE;
  PERFORM 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR colaborador_id=p_colaborador) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM sim_vendas_tentativas t WHERE t.empresa_id=p_empresa AND EXISTS (
    SELECT 1 FROM sim_vendas_sessoes s WHERE s.id=t.sessao_id AND s.empresa_id=p_empresa
      AND (p_colaborador IS NULL OR s.colaborador_id=p_colaborador)) ORDER BY t.id FOR UPDATE;
  snapshot=sim_vendas_exclusao_snapshot(p_empresa,p_colaborador);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'SIM_CADASTRO'; END IF;
  IF snapshot->>'hash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'SIM_CONFIRMACAO'; END IF;
  IF EXISTS (SELECT 1 FROM sim_vendas_sessoes WHERE empresa_id=p_empresa
    AND (p_colaborador IS NULL OR colaborador_id=p_colaborador) AND lock_until>=now()) THEN
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
      'tentativas',snapshot->'tentativas','snapshotHash',p_hash,'backup',p_backup,'backupSha256',p_backup_sha256),'ok');
  DELETE FROM sim_vendas_sessoes WHERE empresa_id=p_empresa AND (p_colaborador IS NULL OR colaborador_id=p_colaborador);
  IF p_colaborador IS NULL THEN
    DELETE FROM sim_vendas_config WHERE empresa_id=p_empresa;
    DELETE FROM empresas WHERE id=p_empresa;
  ELSE
    DELETE FROM colaboradores WHERE empresa_id=p_empresa AND id=p_colaborador;
  END IF;
  RETURN jsonb_build_object('id',cadastro->'id','nome_completo',cadastro->'nome_completo','nome',cadastro->'nome','slug',cadastro->'slug');
END $$;
REVOKE ALL ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_excluir_cadastro(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_exclusao_snapshot(uuid,uuid),public.sim_vendas_excluir_cadastro(uuid,uuid,text,text,text,text) TO service_role;

-- Prazo: claim é infraestrutura de lock/recibo. O serviço e o gerador conferem
-- periodo_fim antes de responder/encerrar e antes de CADA nova chamada paga.
-- Sessão aberta não concede continuidade comercial além do fim do período.
NOTIFY pgrst, 'reload schema';
-- Rollback: reverter o código consumidor primeiro. Preservar backups e auditoria.
-- As FKs NO ACTION podem permanecer: não reabrir exclusão silenciosa por CASCADE.
-- DROP FUNCTION IF EXISTS public.sim_vendas_excluir_cadastro(uuid,uuid,text,text,text,text);
-- DROP FUNCTION IF EXISTS public.sim_vendas_exclusao_snapshot(uuid,uuid);
