-- 244 — `custo_ia_agregado` passa a devolver `empresa_is_demo`
--
-- Decisão do dono (07/09/2026): ambiente de demonstração e trabalho sem tenant
-- não são OPERAÇÃO — o número por empresa existe para responder "quanto custa
-- atender este cliente", e um tenant de demo não é cliente.
--
-- `is_demo` vem do banco de propósito, em vez de uma lista de slugs no código:
-- é a mesma coluna que o guardrail de envio já usa para não mandar WhatsApp de
-- ambiente de demo, então um demo novo entra na conta sem ninguém lembrar de
-- editar duas listas. A lista de slugs no código cobre só o resto — hoje o
-- tenant `acme` original, que tem `is_demo = false`.
--
-- DROP + CREATE porque `CREATE OR REPLACE` não muda o tipo de retorno (`42P13`).

DROP FUNCTION IF EXISTS public.custo_ia_agregado(timestamptz, timestamptz);

CREATE FUNCTION public.custo_ia_agregado(p_ini timestamptz, p_fim timestamptz)
RETURNS TABLE (
  empresa_id uuid,
  empresa_nome text,
  empresa_slug text,
  empresa_is_demo boolean,
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
    COALESCE(e.is_demo, false),
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
  GROUP BY l.empresa_id, e.nome, e.slug, COALESCE(e.is_demo, false), l.feature,
           COALESCE(l.source, 'wrapper'),
           COALESCE(l.provider, 'desconhecido'), COALESCE(l.model, 'desconhecido')
$$;

REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) IS
  'Ledger de IA agregado por empresa x feature x source x modelo numa janela [ini, fim). empresa_id nulo = sem tenant; is_demo marca ambiente de demonstracao. So service_role executa.';

-- Rollback (se precisar): volta ao formato da 239, sem `empresa_is_demo`.
