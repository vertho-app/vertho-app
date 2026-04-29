-- ═════════════════════════════════════════════════════════════════
-- Migration 077 — Recalcula score_* na diag_censo_infra usando
-- agrupamento por famílias de campo (fix do falso negativo).
-- Família vale 1 se QUALQUER campo dela > 0; vazia (todos null) não
-- entra no denominador.
-- ═════════════════════════════════════════════════════════════════

-- Função helper: dada uma lista de chaves e o JSONB indicadores,
-- retorna 1 se qualquer chave > 0, 0 se todas medidas e zeradas, NULL
-- se nenhuma chave foi medida (todas null/ausentes).
CREATE OR REPLACE FUNCTION diag_familia_valor(ind JSONB, chaves TEXT[])
RETURNS INTEGER
LANGUAGE SQL IMMUTABLE
AS $$
  WITH vals AS (
    SELECT (ind->>k)::numeric AS v
    FROM unnest(chaves) AS k
    WHERE ind ? k AND ind->>k IS NOT NULL AND ind->>k <> ''
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM vals) THEN NULL
    WHEN EXISTS (SELECT 1 FROM vals WHERE v > 0) THEN 1
    ELSE 0
  END;
$$;

-- Função para calcular score de um grupo (lista de famílias).
-- Cada família: avalia presença, conta como 1 item se medida.
CREATE OR REPLACE FUNCTION diag_score_dimensao(ind JSONB, familias TEXT[][])
RETURNS NUMERIC
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  fam TEXT[];
  v INTEGER;
  total INTEGER := 0;
  count INTEGER := 0;
BEGIN
  FOREACH fam SLICE 1 IN ARRAY familias LOOP
    v := diag_familia_valor(ind, fam);
    IF v IS NOT NULL THEN
      total := total + v;
      count := count + 1;
    END IF;
  END LOOP;
  IF count = 0 THEN RETURN NULL; END IF;
  RETURN ROUND((total::numeric / count) * 100, 2);
END;
$$;

-- Recalcula tudo em uma única UPDATE
UPDATE diag_censo_infra SET
  score_basica = diag_score_dimensao(indicadores, ARRAY[
    ARRAY['IN_AGUA_POTAVEL', 'IN_AGUA_REDE_PUBLICA'],
    ARRAY['IN_ENERGIA_REDE_PUBLICA', NULL],
    ARRAY['IN_ESGOTO_REDE_PUBLICA', NULL],
    ARRAY['IN_BANHEIRO', 'IN_BANHEIRO_DENTRO_PREDIO'],
    ARRAY['IN_LIXO_DESTINO_REDE_LIMPEZA_URBANA', NULL],
    ARRAY['IN_ALMOXARIFADO', NULL]
  ]::TEXT[][]),
  score_pedagogica = diag_score_dimensao(indicadores, ARRAY[
    ARRAY['IN_BIBLIOTECA', 'IN_BIBLIOTECA_SALA_LEITURA', 'IN_SALA_LEITURA'],
    ARRAY['IN_LABORATORIO_INFORMATICA', NULL, NULL],
    ARRAY['IN_LABORATORIO_CIENCIAS', NULL, NULL],
    ARRAY['IN_AUDITORIO', NULL, NULL],
    ARRAY['IN_AREA_VERDE', NULL, NULL],
    ARRAY['IN_PARQUE_INFANTIL', NULL, NULL],
    ARRAY['IN_QUADRA_ESPORTES', 'IN_QUADRA_ESPORTES_COBERTA', 'IN_PATIO_COBERTO'],
    ARRAY['IN_REFEITORIO', 'IN_COZINHA', NULL]
  ]::TEXT[][]),
  score_acessibilidade = diag_score_dimensao(indicadores, ARRAY[
    ARRAY['IN_ACESSIBILIDADE_RAMPAS', NULL],
    ARRAY['IN_ACESSIBILIDADE_CORRIMAO', NULL],
    ARRAY['IN_ACESSIBILIDADE_ELEVADOR', NULL],
    ARRAY['IN_ACESSIBILIDADE_PISOS_TATEIS', NULL],
    ARRAY['IN_ACESSIBILIDADE_VAO_LIVRE', NULL],
    ARRAY['IN_ACESSIBILIDADE_BARRAS_BANHEIRO', NULL],
    ARRAY['IN_ACESSIBILIDADE_BANHEIRO', 'IN_BANHEIRO_PNE'],
    ARRAY['IN_ACESSIBILIDADE_SINAL_SONORO', NULL],
    ARRAY['IN_ACESSIBILIDADE_SINAL_TATIL', NULL],
    ARRAY['IN_ACESSIBILIDADE_SINAL_VISUAL', NULL]
  ]::TEXT[][]),
  score_conectividade = diag_score_dimensao(indicadores, ARRAY[
    ARRAY['IN_INTERNET', NULL],
    ARRAY['IN_INTERNET_APRENDIZAGEM', 'IN_INTERNET_ALUNOS'],
    ARRAY['IN_INTERNET_ADMINISTRATIVO', NULL],
    ARRAY['IN_BANDA_LARGA', NULL]
  ]::TEXT[][]),
  atualizado_em = now();

-- Refresh MV que depende dos scores
REFRESH MATERIALIZED VIEW diag_mv_escola_infra_saeb;
