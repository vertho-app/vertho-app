-- 238 — agregação do ledger de IA por (empresa × feature × modelo) numa janela
--
-- Para o relatório semanal de custo por tenant (`lib/custo-ia/relatorio-semanal.ts`,
-- cron `custo_ia_semanal`). Existe como função porque o PostgREST não faz
-- GROUP BY: agregar no app obrigaria a trazer as linhas CRUAS da semana e somar
-- em JS. Medido em 01/09/2026, na semana 24–30/08: **7.198 linhas brutas** para
-- **108 grupos**. Trazer as 7.198 significaria paginar o teto de 1.000 do
-- PostgREST em 8 requisições — e o modo de falha de esquecer a paginação não é
-- erro, é um relatório que soma 1.000 linhas e apresenta o resultado como se
-- fosse a semana inteira. Conta parcial com cara de conta fechada.
--
-- `linhas_sem_custo` sai junto de propósito. `sum(cost_usd)` ignora NULL, então
-- uma chamada gravada sem custo entra na conta como zero e a ausência do dado
-- vira "não custou nada". Quem lê o relatório precisa poder distinguir as duas.
--
-- LEFT JOIN em `empresas`: linha sem `empresa_id` é trabalho de plataforma
-- (autoria de conteúdo, evals, copiloto) e NÃO pode sumir da conta — em 30 dias
-- ela responde por 35% do dinheiro. Volta com `empresa_id` nulo, para o
-- chamador rotular como não-atribuída em vez de descartar.

CREATE OR REPLACE FUNCTION public.custo_ia_agregado(p_ini timestamptz, p_fim timestamptz)
RETURNS TABLE (
  empresa_id uuid,
  empresa_nome text,
  empresa_slug text,
  feature text,
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
           COALESCE(l.provider, 'desconhecido'), COALESCE(l.model, 'desconhecido')
$$;

REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.custo_ia_agregado(timestamptz, timestamptz) IS
  'Ledger de IA agregado por empresa x feature x modelo numa janela [ini, fim). empresa_id nulo = trabalho de plataforma, nao descartar. So service_role executa.';

-- Rollback (se precisar):
-- DROP FUNCTION IF EXISTS public.custo_ia_agregado(timestamptz, timestamptz);
