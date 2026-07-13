-- 178: agregação do ledger de IA no banco (painel estimado-vs-real, S1.3).
--
-- O simulador de custo (/admin/vertho/simulador-custo) mostra o custo ESTIMADO
-- pelo catálogo. Esta função devolve o custo REAL medido, agregado por
-- (feature × provider × model) numa janela de dias — para comparar estimativa
-- vs. medição sem puxar todas as linhas cruas do ledger para o Node.
--
-- `custo_conhecido_frac` < 1 sinaliza chamadas cujo modelo não está no catálogo
-- (cost_usd NULL) — ou seja, custo real subestimado; a UI avisa.

CREATE OR REPLACE FUNCTION ia_uso_resumo(p_dias integer DEFAULT 30)
RETURNS TABLE (
  feature text,
  provider text,
  model text,
  chamadas bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_write_tokens bigint,
  custo_usd numeric,
  custo_conhecido_frac numeric,
  latencia_ms_media numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    feature,
    coalesce(provider, 'desconhecido')                 AS provider,
    coalesce(model, 'desconhecido')                     AS model,
    count(*)                                            AS chamadas,
    coalesce(sum(input_tokens), 0)                      AS input_tokens,
    coalesce(sum(output_tokens), 0)                     AS output_tokens,
    coalesce(sum(cache_read_tokens), 0)                 AS cache_read_tokens,
    coalesce(sum(cache_write_tokens), 0)                AS cache_write_tokens,
    coalesce(sum(cost_usd), 0)                          AS custo_usd,
    avg((cost_usd IS NOT NULL)::int::numeric)           AS custo_conhecido_frac,
    avg(latency_ms)                                     AS latencia_ms_media
  FROM ia_usage_log
  WHERE created_at >= now() - make_interval(days => p_dias)
  GROUP BY feature, coalesce(provider, 'desconhecido'), coalesce(model, 'desconhecido')
  ORDER BY coalesce(sum(cost_usd), 0) DESC;
$$;

-- Custo é dado sensível de plataforma: só service_role executa (a action gateia
-- por requireAdminAction). Fecha a exposição via PostgREST para anon/authenticated.
REVOKE ALL ON FUNCTION ia_uso_resumo(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia_uso_resumo(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
