-- 292 — totais do Mercado Potencial sobre o FILTRO INTEIRO, não sobre as linhas da tabela
--
-- A tela somava os cartões (linhas, escolas, professores, gestores, TAM) no navegador,
-- sobre as linhas que vieram. Na visão Escola o padrão é 1.000 linhas: medido em
-- 19/10/2026, o print do dono mostrava "1.000 de 25.540" e os cartões eram de 1.000.
-- Trazer as 25.540 só para somar seria paginar o teto de 1.000 do PostgREST 26 vezes
-- (e o Brasil inteiro tem ~210 mil escolas); o PostgREST não faz SUM, então a soma é aqui.
--
-- Só contagens e somas BRUTAS. Preço e idade de corte ficam fora de propósito: o TAM é
-- linear nas contagens, e a tela passa a linha somada por `calcularMercadoScores`
-- (`lib/mercado-potencial/scoring.ts`), a mesma fórmula das linhas.
--
-- Os parâmetros vêm de `argsDosTotais` (`lib/mercado-potencial/totais.ts`), montados
-- pelos MESMOS helpers que filtram a tabela. A action confere `linhas` contra o
-- `count: 'exact'` da tabela: se divergir, a tela volta a somar as linhas mostradas e diz
-- isso no aviso. Semântica de cada parâmetro (espelha o `aplicarFiltrosBase`):
--   NULL                = não filtra
--   p_municipios_ibge   = '{}' (vazio) é "nenhuma linha" (região que não existe)
--   p_inse_min/max      = com o filtro ligado, INSE NULL SAI (como o gte/lte do PostgREST)
--   p_gestores_coluna_min = já deslocado pelo proxy de diretor na escola (coord >= N - 1)
--   p_cidades           = padrões ILIKE prontos ('%termo%', com % e _ escapados)
--   p_redes             = ignorado na visão município (a lista também ignora)
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.mercado_potencial_totais(
  p_visao text,
  p_ufs text[] DEFAULT NULL,
  p_municipios_ibge text[] DEFAULT NULL,
  p_inse_min numeric DEFAULT NULL,
  p_inse_max numeric DEFAULT NULL,
  p_professores_min integer DEFAULT NULL,
  p_gestores_coluna_min integer DEFAULT NULL,
  p_cidades text[] DEFAULT NULL,
  p_redes text[] DEFAULT NULL
)
RETURNS TABLE (
  linhas bigint,
  qt_escolas bigint,
  qt_professores bigint,
  qt_docs_jovens bigint,
  qt_docs_0_24 bigint,
  qt_gestores bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF p_visao = 'escola' THEN
    RETURN QUERY
    SELECT
      count(*)::bigint,
      count(*)::bigint,
      COALESCE(sum(e.qt_professores), 0)::bigint,
      COALESCE(sum(e.qt_docs_jovens), 0)::bigint,
      COALESCE(sum(e.qt_doc_0_24), 0)::bigint,
      COALESCE(sum(e.qt_coord_pedag + e.qt_diretor_proxy), 0)::bigint
    FROM public.diag_mv_mercado_escola e
    WHERE (p_ufs IS NULL OR e.uf = ANY (p_ufs))
      AND (p_municipios_ibge IS NULL OR e.municipio_ibge = ANY (p_municipios_ibge))
      AND (p_inse_min IS NULL OR e.inse_efetivo >= p_inse_min)
      AND (p_inse_max IS NULL OR e.inse_efetivo <= p_inse_max)
      AND (p_professores_min IS NULL OR e.qt_professores >= p_professores_min)
      AND (p_gestores_coluna_min IS NULL OR e.qt_coord_pedag >= p_gestores_coluna_min)
      AND (p_cidades IS NULL OR e.municipio ILIKE ANY (p_cidades))
      AND (p_redes IS NULL OR e.rede = ANY (p_redes));
  ELSIF p_visao = 'rede' THEN
    RETURN QUERY
    SELECT
      count(*)::bigint,
      COALESCE(sum(r.qt_escolas), 0)::bigint,
      COALESCE(sum(r.qt_professores), 0)::bigint,
      COALESCE(sum(r.qt_docs_jovens), 0)::bigint,
      COALESCE(sum(r.qt_docs_0_24), 0)::bigint,
      COALESCE(sum(r.qt_gestores), 0)::bigint
    FROM public.diag_mv_mercado_rede r
    WHERE (p_ufs IS NULL OR r.uf = ANY (p_ufs))
      AND (p_municipios_ibge IS NULL OR r.municipio_ibge = ANY (p_municipios_ibge))
      AND (p_inse_min IS NULL OR r.inse_medio >= p_inse_min)
      AND (p_inse_max IS NULL OR r.inse_medio <= p_inse_max)
      AND (p_professores_min IS NULL OR r.qt_professores >= p_professores_min)
      AND (p_gestores_coluna_min IS NULL OR r.qt_gestores >= p_gestores_coluna_min)
      AND (p_cidades IS NULL OR r.municipio ILIKE ANY (p_cidades))
      AND (p_redes IS NULL OR r.rede = ANY (p_redes));
  ELSIF p_visao = 'municipio' THEN
    RETURN QUERY
    SELECT
      count(*)::bigint,
      COALESCE(sum(m.qt_escolas), 0)::bigint,
      COALESCE(sum(m.qt_professores), 0)::bigint,
      COALESCE(sum(m.qt_docs_jovens), 0)::bigint,
      COALESCE(sum(m.qt_docs_0_24), 0)::bigint,
      COALESCE(sum(m.qt_gestores), 0)::bigint
    FROM public.diag_mv_mercado_municipio m
    WHERE (p_ufs IS NULL OR m.uf = ANY (p_ufs))
      AND (p_municipios_ibge IS NULL OR m.municipio_ibge = ANY (p_municipios_ibge))
      AND (p_inse_min IS NULL OR m.inse_medio >= p_inse_min)
      AND (p_inse_max IS NULL OR m.inse_medio <= p_inse_max)
      AND (p_professores_min IS NULL OR m.qt_professores >= p_professores_min)
      AND (p_gestores_coluna_min IS NULL OR m.qt_gestores >= p_gestores_coluna_min)
      AND (p_cidades IS NULL OR m.municipio ILIKE ANY (p_cidades));
  ELSE
    RAISE EXCEPTION 'mercado_potencial_totais: visão inválida (%)', p_visao USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) TO service_role;

COMMENT ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) IS
  'Mercado Potencial: contagens e somas brutas do filtro inteiro (municipio, rede ou escola), para os cartões da tela. Sem preço: o TAM sai de calcularMercadoScores. Parâmetros montados por argsDosTotais. Só service_role executa.';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP FUNCTION IF EXISTS public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]);
