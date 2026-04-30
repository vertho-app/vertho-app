-- Migration 082 — RPCs auxiliares pro painel /admin/radar/qualidade-dados
-- Calculam cobertura por fonte (chaves distintas no último ano) e universo
-- de municípios. Usadas só pelo admin (chamadas via service_role no RSC).

-- 1) Distintos da chave (codigo_inep ou municipio_ibge) numa tabela em um ano
CREATE OR REPLACE FUNCTION diag_qualidade_distinct_chave(
  p_tabela TEXT,
  p_chave  TEXT,
  p_ano    INT
) RETURNS TABLE (distintos BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Whitelist de tabelas e chaves para evitar SQL injection via parâmetro.
  tabelas_validas TEXT[] := ARRAY[
    'diag_saeb_snapshots','diag_censo_infra','diag_censo_docentes',
    'diag_enem_escola_snapshots','diag_ideb_metas','diag_saresp_snapshots',
    'diag_pdde_repasses','diag_ica_snapshots','diag_fundeb_repasses',
    'diag_fundeb_vaar','diag_fundeb_receita_prevista','diag_pdde_municipal'
  ];
  chaves_validas TEXT[] := ARRAY['codigo_inep','municipio_ibge'];
BEGIN
  IF NOT (p_tabela = ANY(tabelas_validas)) THEN
    RAISE EXCEPTION 'tabela não permitida: %', p_tabela;
  END IF;
  IF NOT (p_chave = ANY(chaves_validas)) THEN
    RAISE EXCEPTION 'chave não permitida: %', p_chave;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT COUNT(DISTINCT %I)::BIGINT AS distintos FROM %I WHERE ano = $1',
    p_chave, p_tabela
  ) USING p_ano;
END;
$$;

-- 2) Municípios distintos vistos em qualquer snapshot (para denominador da cobertura municipal)
CREATE OR REPLACE FUNCTION diag_qualidade_municipios_distintos()
RETURNS TABLE (total BIGINT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT municipio_ibge)::BIGINT
  FROM (
    SELECT municipio_ibge FROM diag_escolas WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_ica_snapshots         WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_repasses       WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_vaar           WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_fundeb_receita_prevista WHERE municipio_ibge IS NOT NULL
    UNION
    SELECT municipio_ibge FROM diag_pdde_municipal        WHERE municipio_ibge IS NOT NULL
  ) m;
$$;

-- Permitir chamada pelo service_role (que é quem o RSC usa)
GRANT EXECUTE ON FUNCTION diag_qualidade_distinct_chave(TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION diag_qualidade_municipios_distintos() TO service_role;
