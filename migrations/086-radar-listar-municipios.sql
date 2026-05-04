-- ═════════════════════════════════════════════════════════════════
-- Migration 086 — RPC para listar municípios de uma UF
--
-- Action listarMunicipiosPorUf usava ilike + limit(20000) em
-- diag_escolas mas o PostgREST tem cap default de 1000 rows. SP tem
-- ~600 municípios distintos espalhados por ~60k escolas — só os
-- alfabeticamente iniciais vinham, "jundiai" nunca chegava no cliente.
--
-- RPC faz o DISTINCT direto no SQL e retorna ~600 linhas, dentro do
-- cap padrão.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION diag_listar_municipios(p_uf TEXT)
RETURNS TABLE (
  municipio_ibge TEXT,
  municipio TEXT
)
LANGUAGE SQL STABLE AS $$
  SELECT DISTINCT ON (e.municipio_ibge)
    e.municipio_ibge::TEXT,
    e.municipio
  FROM diag_escolas e
  WHERE e.uf = p_uf
    AND e.municipio_ibge IS NOT NULL
  ORDER BY e.municipio_ibge, e.municipio;
$$;

GRANT EXECUTE ON FUNCTION diag_listar_municipios(TEXT) TO anon, authenticated, service_role;
