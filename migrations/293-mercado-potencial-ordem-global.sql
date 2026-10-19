-- 293 — Mercado Potencial: a tabela traz as N primeiras do FILTRO INTEIRO na ordem escolhida
--
-- A tela lia as N primeiras linhas pela CHAVE (`codigo_inep`, `municipio_ibge`) e só então
-- ordenava por score no servidor. Com 25.540 escolas e limite 1.000, a tabela mostrava as
-- 1.000 de menor INEP (o INEP começa pelo código da UF), não as 1.000 de maior score. O mesmo
-- valia para a exportação e o plano do enriquecimento (teto de 10.000). Medido em 19/10/2026:
-- ler o filtro inteiro pelo PostgREST para ordenar no servidor custa 4,5 s em MG (24 mil
-- escolas) e 9 a 15 s com 47 MB no Brasil inteiro, A CADA clique de ordenação.
--
-- Três funções, todas SECURITY INVOKER e só para service_role:
--
-- 1. `mercado_potencial_base`: o filtro, num lugar só (era o WHERE da mig 292). Devolve as
--    linhas da visão com as colunas normalizadas (chave, nome, rede, INSE, contagens).
-- 2. `mercado_potencial_totais`: mesma assinatura e mesmo resultado da mig 292, agora
--    somando a base (o TS não muda).
-- 3. `mercado_potencial_linhas`: ordena a base inteira e devolve UM jsonb
--    `{ total, linhas: [linha da MV, ...] }` com as N primeiras. Um valor só, e não um
--    conjunto de linhas, porque o `max-rows` do PostgREST corta conjunto em 1.000 sem avisar.
--    O `to_jsonb` roda só nas N escolhidas, voltando à MV pela chave.
--
-- A ORDEM espelha `ordenarRows` + `calcularMercadoScores` (TS) e é a parte frágil:
--   - a conta é em double precision, na MESMA ordem das operações do TS, para dar o mesmo
--     número bit a bit (numeric daria empates e desempates diferentes);
--   - nulo vale -Infinity no TS: DESC NULLS LAST e ASC NULLS FIRST;
--   - empate fica na ordem da chave, ASC nos dois sentidos (o sort do JS é estável sobre a
--     leitura, que vem pela chave);
--   - texto compara por ponto de código (COLLATE "C"), como o `<` do JS;
--   - o nome da visão Rede é a string que o TS monta: municipio || ' — ' || rede.
-- O guard `mercado-potencial-ordem-global.test.ts` falha se `scoring.ts` mudar sem esta
-- função ser revista, e a action confere em execução que a ordem devolvida bate com os
-- valores que o TS calcula.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.mercado_potencial_base(
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
  chave text,
  nome text,
  uf text,
  rede text,
  inse double precision,
  qt_escolas bigint,
  qt_professores bigint,
  qt_docs_jovens bigint,
  qt_docs_0_24 bigint,
  qt_docs_pos bigint,
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
      e.codigo_inep,
      e.nome,
      e.uf,
      e.rede,
      e.inse_efetivo::double precision,
      1::bigint,
      COALESCE(e.qt_professores, 0)::bigint,
      COALESCE(e.qt_docs_jovens, 0)::bigint,
      COALESCE(e.qt_doc_0_24, 0)::bigint,
      COALESCE(e.qt_docs_pos, 0)::bigint,
      (COALESCE(e.qt_coord_pedag, 0) + COALESCE(e.qt_diretor_proxy, 0))::bigint
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
      r.municipio_ibge || '::' || r.rede,
      r.municipio || ' — ' || r.rede,
      r.uf,
      r.rede,
      r.inse_medio::double precision,
      COALESCE(r.qt_escolas, 0)::bigint,
      COALESCE(r.qt_professores, 0)::bigint,
      COALESCE(r.qt_docs_jovens, 0)::bigint,
      COALESCE(r.qt_docs_0_24, 0)::bigint,
      COALESCE(r.qt_docs_pos, 0)::bigint,
      COALESCE(r.qt_gestores, 0)::bigint
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
      m.municipio_ibge,
      m.municipio,
      m.uf,
      NULL::text,
      m.inse_medio::double precision,
      COALESCE(m.qt_escolas, 0)::bigint,
      COALESCE(m.qt_professores, 0)::bigint,
      COALESCE(m.qt_docs_jovens, 0)::bigint,
      COALESCE(m.qt_docs_0_24, 0)::bigint,
      COALESCE(m.qt_docs_pos, 0)::bigint,
      COALESCE(m.qt_gestores, 0)::bigint
    FROM public.diag_mv_mercado_municipio m
    WHERE (p_ufs IS NULL OR m.uf = ANY (p_ufs))
      AND (p_municipios_ibge IS NULL OR m.municipio_ibge = ANY (p_municipios_ibge))
      AND (p_inse_min IS NULL OR m.inse_medio >= p_inse_min)
      AND (p_inse_max IS NULL OR m.inse_medio <= p_inse_max)
      AND (p_professores_min IS NULL OR m.qt_professores >= p_professores_min)
      AND (p_gestores_coluna_min IS NULL OR m.qt_gestores >= p_gestores_coluna_min)
      AND (p_cidades IS NULL OR m.municipio ILIKE ANY (p_cidades));
  ELSE
    RAISE EXCEPTION 'mercado_potencial_base: visão inválida (%)', p_visao USING ERRCODE = '22023';
  END IF;
END;
$$;

-- Mesma assinatura e mesmo resultado da mig 292; o filtro agora vem da base.
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
  RETURN QUERY
  SELECT
    count(*)::bigint,
    COALESCE(sum(b.qt_escolas), 0)::bigint,
    COALESCE(sum(b.qt_professores), 0)::bigint,
    COALESCE(sum(b.qt_docs_jovens), 0)::bigint,
    COALESCE(sum(b.qt_docs_0_24), 0)::bigint,
    COALESCE(sum(b.qt_gestores), 0)::bigint
  FROM public.mercado_potencial_base(
    p_visao, p_ufs, p_municipios_ibge, p_inse_min, p_inse_max,
    p_professores_min, p_gestores_coluna_min, p_cidades, p_redes
  ) b;
END;
$$;

CREATE OR REPLACE FUNCTION public.mercado_potencial_linhas(
  p_visao text,
  p_ufs text[] DEFAULT NULL,
  p_municipios_ibge text[] DEFAULT NULL,
  p_inse_min numeric DEFAULT NULL,
  p_inse_max numeric DEFAULT NULL,
  p_professores_min integer DEFAULT NULL,
  p_gestores_coluna_min integer DEFAULT NULL,
  p_cidades text[] DEFAULT NULL,
  p_redes text[] DEFAULT NULL,
  p_preco_prof double precision DEFAULT 100,
  p_preco_gestor double precision DEFAULT 100,
  p_idade integer DEFAULT 29,
  p_ordem text DEFAULT 'score_completo',
  p_desc boolean DEFAULT true,
  p_limite integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_chaves text[];
  v_linhas jsonb;
BEGIN
  IF p_ordem IS NULL OR p_ordem NOT IN (
    'nome', 'uf', 'rede', 'qt_escolas', 'qt_professores', 'qt_professores_onboarding', 'qt_gestores',
    'pct_jovens', 'pct_sem_pos', 'inse_medio', 'tam_mensal_mentor_ia', 'tam_mensal_onboarding',
    'fit_pedagogico', 'score_completo'
  ) THEN
    RAISE EXCEPTION 'mercado_potencial_linhas: ordem inválida (%)', p_ordem USING ERRCODE = '22023';
  END IF;
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 25000 THEN
    RAISE EXCEPTION 'mercado_potencial_linhas: limite fora de 1..25000 (%)', p_limite USING ERRCODE = '22023';
  END IF;
  IF p_desc IS NULL OR p_preco_prof IS NULL OR p_preco_gestor IS NULL OR p_idade IS NULL THEN
    RAISE EXCEPTION 'mercado_potencial_linhas: direção, preços e idade são obrigatórios' USING ERRCODE = '22023';
  END IF;

  WITH b AS MATERIALIZED (
    SELECT * FROM public.mercado_potencial_base(
      p_visao, p_ufs, p_municipios_ibge, p_inse_min, p_inse_max,
      p_professores_min, p_gestores_coluna_min, p_cidades, p_redes
    )
  ),
  -- calcularMercadoScores, operação por operação
  c AS (
    SELECT
      b.chave, b.nome, b.uf, b.rede, b.inse, b.qt_escolas,
      b.qt_professores::double precision AS profs,
      (CASE WHEN p_idade <= 24 THEN b.qt_docs_0_24 ELSE b.qt_docs_jovens END)::double precision AS jovens,
      b.qt_docs_pos::double precision AS pos,
      b.qt_gestores::double precision AS gest
    FROM b
  ),
  d AS (
    SELECT
      c.*,
      CASE WHEN c.profs > 0 THEN greatest(0::double precision, 1::double precision - c.pos / c.profs) ELSE 0::double precision END AS pct_sem_pos,
      CASE WHEN c.profs > 0 THEN c.jovens / c.profs ELSE 0::double precision END AS pct_jovens,
      c.profs * p_preco_prof + c.gest * p_preco_gestor AS tam,
      c.jovens * p_preco_prof + c.gest * p_preco_gestor AS tam_onb,
      CASE
        WHEN c.inse IS NULL THEN NULL
        WHEN upper(COALESCE(c.rede, '')) = 'PRIVADA'
          THEN 0.4::double precision + 0.6::double precision * ((c.inse - 1::double precision) / 5::double precision)
        WHEN upper(COALESCE(c.rede, '')) IN ('MUNICIPAL', 'ESTADUAL', 'FEDERAL')
          THEN 0.5::double precision + 0.4::double precision * (1::double precision - (c.inse - 1::double precision) / 5::double precision)
        ELSE 0.5::double precision
      END AS fit_fin
    FROM c
  ),
  e AS (
    SELECT
      d.*,
      least(1::double precision, 0.4::double precision + 0.3::double precision * d.pct_sem_pos + 0.3::double precision * d.pct_jovens) AS fit_ped
    FROM d
  ),
  k AS (
    SELECT
      e.chave,
      CASE p_ordem
        WHEN 'qt_escolas' THEN e.qt_escolas::double precision
        WHEN 'qt_professores' THEN e.profs
        WHEN 'qt_professores_onboarding' THEN e.jovens
        WHEN 'qt_gestores' THEN e.gest
        WHEN 'pct_jovens' THEN e.pct_jovens
        WHEN 'pct_sem_pos' THEN e.pct_sem_pos
        WHEN 'inse_medio' THEN e.inse
        WHEN 'tam_mensal_mentor_ia' THEN e.tam
        WHEN 'tam_mensal_onboarding' THEN e.tam_onb
        WHEN 'fit_pedagogico' THEN e.fit_ped
        WHEN 'score_completo' THEN CASE WHEN e.fit_fin IS NULL THEN NULL ELSE (e.tam * e.fit_ped) * e.fit_fin END
      END AS k_num,
      CASE p_ordem WHEN 'nome' THEN e.nome WHEN 'uf' THEN e.uf WHEN 'rede' THEN e.rede END AS k_txt
    FROM e
  ),
  o AS (
    SELECT
      k.chave,
      row_number() OVER (
        ORDER BY
          (CASE WHEN p_desc THEN k.k_num END) DESC NULLS LAST,
          (CASE WHEN NOT p_desc THEN k.k_num END) ASC NULLS FIRST,
          (CASE WHEN p_desc THEN k.k_txt END) COLLATE "C" DESC NULLS LAST,
          (CASE WHEN NOT p_desc THEN k.k_txt END) COLLATE "C" ASC NULLS FIRST,
          k.chave COLLATE "C" ASC
      ) AS rn
    FROM k
  )
  SELECT
    (SELECT count(*) FROM b),
    (SELECT array_agg(o.chave ORDER BY o.rn) FROM o WHERE o.rn <= p_limite)
  INTO v_total, v_chaves;

  IF p_visao = 'escola' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY t.ord), '[]'::jsonb) INTO v_linhas
    FROM unnest(v_chaves) WITH ORDINALITY AS t(chave, ord)
    JOIN public.diag_mv_mercado_escola m ON m.codigo_inep = t.chave;
  ELSIF p_visao = 'rede' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY t.ord), '[]'::jsonb) INTO v_linhas
    FROM unnest(v_chaves) WITH ORDINALITY AS t(chave, ord)
    JOIN public.diag_mv_mercado_rede m
      ON m.municipio_ibge = split_part(t.chave, '::', 1) AND m.rede = split_part(t.chave, '::', 2);
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY t.ord), '[]'::jsonb) INTO v_linhas
    FROM unnest(v_chaves) WITH ORDINALITY AS t(chave, ord)
    JOIN public.diag_mv_mercado_municipio m ON m.municipio_ibge = t.chave;
  END IF;

  RETURN jsonb_build_object('total', v_total, 'linhas', v_linhas);
END;
$$;

REVOKE ALL ON FUNCTION public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) TO service_role;

REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_potencial_totais(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) TO service_role;

REVOKE ALL ON FUNCTION public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer) FROM anon;
REVOKE ALL ON FUNCTION public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer) TO service_role;

COMMENT ON FUNCTION public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]) IS
  'Mercado Potencial: o filtro da tela num lugar só (linhas da visão com colunas normalizadas). Usada por mercado_potencial_totais e mercado_potencial_linhas. Só service_role executa.';
COMMENT ON FUNCTION public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer) IS
  'Mercado Potencial: as N primeiras linhas do filtro inteiro na ordem da tela, como jsonb {total, linhas}. A ordem espelha ordenarRows + calcularMercadoScores (TS). Só service_role executa.';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; a tela volta sozinha à leitura por chave, avisando que a ordem é parcial):
-- DROP FUNCTION IF EXISTS public.mercado_potencial_linhas(text, text[], text[], numeric, numeric, integer, integer, text[], text[], double precision, double precision, integer, text, boolean, integer);
-- e reaplicar a mig 292 (devolve o WHERE aos totais) antes de:
-- DROP FUNCTION IF EXISTS public.mercado_potencial_base(text, text[], text[], numeric, numeric, integer, integer, text[], text[]);
