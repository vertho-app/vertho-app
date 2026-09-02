-- 239 — `custo_ia_agregado` passa a devolver o `source`
--
-- O relatório semanal separa OPERAÇÃO de P&D (pedido do dono, 02/09/2026), e a
-- régua tem duas portas: o `source` declarado no call-site (`simulator`, `eval`,
-- `experimento`, `medicao`…) e, para o que roda sob o `source` default, a lista
-- de features cujo motor não tem consumidor de produção. Sem o `source` no
-- agregado, só a segunda porta era aplicável, e ela é a mais frágil das duas —
-- a primeira é declarada por quem chama, e é a que o próprio código já usava
-- para "netar" a simulação do baseline (ver `lib/season-engine/simulador-core.ts`).
--
-- DROP + CREATE porque `CREATE OR REPLACE` não muda o tipo de retorno de uma
-- função existente (`42P13`). Idempotente pelo `IF EXISTS`.

DROP FUNCTION IF EXISTS public.custo_ia_agregado(timestamptz, timestamptz);

CREATE FUNCTION public.custo_ia_agregado(p_ini timestamptz, p_fim timestamptz)
RETURNS TABLE (
  empresa_id uuid,
  empresa_nome text,
  empresa_slug text,
  feature text,
  source text,
  provider text,
  model text,
  chamadas bigint,
  chamadas_erro bigint,
  linhas_sem_custo bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  custo_usd numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    l.empresa_id,
    e.nome,
    e.slug,
    l.feature,
    COALESCE(l.source, 'wrapper'),
    COALESCE(l.provider, 'desconhecido'),
    COALESCE(l.model, 'desconhecido'),
    count(*),
    count(*) FILTER (WHERE l.status IS DISTINCT FROM 'ok'),
    count(*) FILTER (WHERE l.cost_usd IS NULL),
    COALESCE(sum(l.input_tokens), 0),
    COALESCE(sum(l.output_tokens), 0),
    COALESCE(sum(l.cache_read_tokens), 0),
    COALESCE(sum(l.cache_write_tokens), 0),
    COALESCE(sum(l.cost_usd), 0)::numeric
  FROM public.ia_usage_log l
  LEFT JOIN public.empresas e ON e.id = l.empresa_id
  WHERE l.created_at >= p_ini
    AND l.created_at <  p_fim
  GROUP BY l.empresa_id, e.nome, e.slug, l.feature,
           COALESCE(l.source, 'wrapper'),
           COALESCE(l.provider, 'desconhecido'), COALESCE(l.model, 'desconhecido')
$$;

REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) IS
  'Ledger de IA agregado por empresa x feature x source x modelo numa janela [ini, fim). empresa_id nulo = plataforma; source distingue operacao de medicao. So service_role executa.';

-- Rollback (se precisar): volta ao formato da 238, sem `source`.
