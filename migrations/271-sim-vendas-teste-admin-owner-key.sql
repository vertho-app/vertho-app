-- 271 — "Teste administrativo" do simulador de vendas pelo DONO do treino
--
-- V-6 da revisão dos simuladores de 27/09/2026. O rótulo era derivado de
-- `colaborador_id IS NULL` (TS em `lib/simulador-vendas/historico.ts` e SQL em
-- `sim_vendas_exportar`, mig 250). Só que a exclusão legada de um colaborador
-- apenas zera `colaborador_id` na sessão PACE (mig 251): o treino REAL da
-- pessoa desvinculada passava a sair como "Teste administrativo" no CSV e na
-- lista do admin. Quem cria o treino fica em `owner_key` ('admin:<id>' para
-- administrador da plataforma, 'colab:<id>' para participante; a
-- `sim_vendas_criar` já exige essa forma), então o rótulo sai dele.
--
-- 1) `sim_vendas_exportar`: mesma assinatura e mesmo recorte; só a expressão
--    de 'testeAdmin' muda. CREATE OR REPLACE.
-- 2) `sim_vendas_historico_equipe`: passa a devolver `owner_key`, para o
--    servidor derivar o rótulo (o valor não vai ao navegador:
--    `paginaDeHistorico` só publica o booleano). Mudar o tipo de retorno exige
--    DROP + CREATE; o arquivo inteiro roda numa transação
--    (`apply-migration.mjs`), então não há janela sem a função. Enquanto a
--    migration não estiver aplicada, o código cai na regra antiga para as
--    linhas sem `owner_key` (mesmo comportamento de hoje).
--
-- Idempotente: reaplicar recria as duas funções com o mesmo corpo.

CREATE OR REPLACE FUNCTION public.sim_vendas_exportar(p_empresa uuid,p_colaboradores uuid[],p_inicio timestamptz,p_fim timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  WITH recorte AS (
    SELECT id,created_at,owner_key,estado FROM sim_vendas_sessoes
    WHERE empresa_id=p_empresa AND (p_colaboradores IS NULL OR colaborador_id=ANY(p_colaboradores))
      AND (p_inicio IS NULL OR created_at>=p_inicio) AND (p_fim IS NULL OR created_at<p_fim)
    ORDER BY created_at DESC,id DESC LIMIT 3001
  ), linhas AS (
    SELECT jsonb_build_object('id',id,'nomeVendedor',estado->>'nomeVendedor','testeAdmin',owner_key LIKE 'admin:%',
      'criadoEm',created_at,'nivel',estado->'nivel','status',estado->>'status','versaoRegua',coalesce(estado->>'versaoRegua','pace-1'),
      'P',estado#>'{relatorio,P}','A',estado#>'{relatorio,A}','C',estado#>'{relatorio,C}','E',estado#>'{relatorio,E}',
      'Media',estado#>'{relatorio,Media}','Resumo',estado#>>'{relatorio,Resumo}') linha,created_at,id FROM recorte
  ) SELECT CASE WHEN (SELECT count(*) FROM recorte)>3000 THEN jsonb_build_object('excedido',true,'linhas','[]'::jsonb)
    ELSE jsonb_build_object('excedido',false,'linhas',coalesce((SELECT jsonb_agg(linha ORDER BY created_at DESC,id DESC) FROM linhas),'[]'::jsonb)) END;
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_exportar(uuid,uuid[],timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_exportar(uuid,uuid[],timestamptz,timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid);
CREATE FUNCTION public.sim_vendas_historico_equipe(p_empresa uuid,p_colaboradores uuid[],p_em timestamptz,p_id uuid)
RETURNS TABLE(id uuid,created_at timestamptz,colaborador_id uuid,owner_key text,resumo jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT s.id,s.created_at,s.colaborador_id,s.owner_key,s.resumo FROM sim_vendas_sessoes s
  WHERE s.empresa_id=p_empresa AND (p_colaboradores IS NULL OR s.colaborador_id=ANY(p_colaboradores))
    AND (p_em IS NULL OR (s.created_at,s.id)<(p_em,p_id))
  ORDER BY s.created_at DESC,s.id DESC LIMIT 51
$$;
REVOKE ALL ON FUNCTION public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Rollback manual (volta às definições da mig 250):
--   reaplicar os dois CREATE da mig 250 (linhas de `sim_vendas_exportar` e
--   `sim_vendas_historico_equipe`), com
--   DROP FUNCTION IF EXISTS public.sim_vendas_historico_equipe(uuid,uuid[],timestamptz,uuid);
--   antes do CREATE da segunda (o tipo de retorno muda de novo).
