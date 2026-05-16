-- ─────────────────────────────────────────────────────────────────────────
-- Stage 5 (BR) — priority_rank NACIONAL + redes (SQL) + agregados
--
-- Substitui a paginação REST frágil (scripts/radarempresas-redes.ts +
-- o priority_rank do score-script) por SQL DuckDB sobre Parquet. Porta
-- 1:1 a heurística de redes já validada (franquia 35 + grupo 229 = 264).
--
-- Entradas: out/scored.parquet (Stage 4) + out/base (Stage 2).
-- Saídas Parquet: scored_final (com priority_rank + rede_marca),
--   redes, cidades_agg, funil_agg, kpi_agg, priorizados/municipio=*.
--
-- Env: OUT_DIR.
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

-- ── scored ⋈ base (fantasia/razão/uf/município) ──────────────────────────
CREATE OR REPLACE TEMP TABLE est AS
SELECT
  s.cnpj_completo, s.cnpj_basico, s.score_total, s.classificacao,
  s.low_team_probability, s.elegivel, s.segmento_key, s.score_confidence,
  b.nome_fantasia, b.razao_social, b.uf, b.municipio_nome, b.municipio_ibge,
  b.municipio_cod,
  trim(regexp_replace(regexp_replace(
    upper(strip_accents(coalesce(b.nome_fantasia, ''))),
    '[^A-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g'))            AS fant_norm,
  trim(regexp_replace(regexp_replace(
    upper(strip_accents(coalesce(b.razao_social, ''))),
    '[^A-Z0-9 ]', ' ', 'g'), ' +', ' ', 'g'))            AS razao_norm
FROM read_parquet(getenv('OUT_DIR') || '/scored.parquet') s
JOIN read_parquet(getenv('OUT_DIR') || '/base/**/*.parquet') b
  ON b.cnpj_completo = s.cnpj_completo;

-- regex de ruído (idênticas a 13_rank_redes ↔ scripts/radarempresas-redes.ts)
-- RUIDO: entidade religiosa/pública/sem-fins. RUIDO_GRUPO: PJ patrimonial.
CREATE OR REPLACE MACRO is_ruido(s) AS
  regexp_matches(s, '\b(ASSOCIACAO|SINDICATO|CONDOMINIO|IGREJA|PARAQUI|PAROQUI|MITRA|DIOCESAN|CONGREGAC|ASSEMBLEIA|CARTORIO|FUNDACAO|INSTITUTO|COOPERATIVA|CONSELHO|PREFEITURA|MUNICIPIO|APM|AABB)');
CREATE OR REPLACE MACRO is_ruido_grupo(s) AS
  regexp_matches(s, '\b(PARTICIPAC|HOLDING|ESPOLIO|CONSULTORIA|EMPREENDIMENTOS IMOBILIARIOS|INCORPORAC|ADMINISTRADORA DE BENS)');
-- token genérico único (coincidência de nome, não marca)
CREATE OR REPLACE MACRO is_generico_unico(s) AS
  (position(' ' IN s) = 0 AND s IN ('FARMACIA','DROGARIA','PADARIA','RESTAURANTE',
   'LANCHONETE','MERCADO','MERCEARIA','ESCOLA','COLEGIO','CLINICA','BAR',
   'ACADEMIA','OTICA','PIZZARIA','SORVETERIA','BUFFET','PETSHOP','BARBEARIA',
   'SALAO','LAVANDERIA'));

-- ── FRANQUIA: mesma fantasia em >=3 cnpj_basico distintos ─────────────────
CREATE OR REPLACE TEMP TABLE franquia AS
WITH g AS (
  SELECT fant_norm,
         COUNT(*)                       AS n_unidades,
         COUNT(DISTINCT cnpj_basico)     AS n_donos
  FROM est WHERE fant_norm <> '' GROUP BY fant_norm
), valid AS (
  SELECT fant_norm, n_unidades, n_donos FROM g
  WHERE length(fant_norm) >= 5 AND n_donos >= 3
    AND NOT is_ruido(fant_norm) AND NOT is_ruido_grupo(fant_norm)
    AND NOT is_generico_unico(fant_norm)
)
SELECT v.fant_norm AS marca_norm, v.n_unidades, v.n_donos,
  -- nome de exibição = fantasia original mais frequente
  (SELECT e2.nome_fantasia FROM est e2 WHERE e2.fant_norm = v.fant_norm
     AND e2.nome_fantasia IS NOT NULL
   GROUP BY e2.nome_fantasia ORDER BY COUNT(*) DESC LIMIT 1) AS nome_exibicao
FROM valid v;

-- unidades absorvidas por franquia
CREATE OR REPLACE TEMP TABLE u_franquia AS
SELECT e.cnpj_completo, f.marca_norm
FROM est e JOIN franquia f ON f.marca_norm = e.fant_norm;

-- ── GRUPO: mesmo cnpj_basico com >=3 filiais NÃO absorvidas ──────────────
CREATE OR REPLACE TEMP TABLE grupo AS
WITH livre AS (
  SELECT e.* FROM est e
  WHERE e.cnpj_completo NOT IN (SELECT cnpj_completo FROM u_franquia)
), g AS (
  SELECT cnpj_basico,
         any_value(razao_social) AS razao_social,
         any_value(razao_norm)   AS razao_norm,
         COUNT(*)                AS n_unidades
  FROM livre GROUP BY cnpj_basico
)
SELECT 'GRP:' || cnpj_basico AS marca_norm, razao_social AS nome_exibicao,
       cnpj_basico, n_unidades
FROM g
WHERE n_unidades >= 3 AND length(razao_norm) >= 5
  AND NOT is_ruido(razao_norm) AND NOT is_ruido_grupo(razao_norm);

CREATE OR REPLACE TEMP TABLE u_grupo AS
SELECT e.cnpj_completo, g.marca_norm
FROM est e JOIN grupo g ON g.cnpj_basico = e.cnpj_basico
WHERE e.cnpj_completo NOT IN (SELECT cnpj_completo FROM u_franquia);

-- ── rede_marca por unidade (franquia tem precedência) ────────────────────
CREATE OR REPLACE TEMP TABLE rede_marca AS
SELECT cnpj_completo, marca_norm FROM u_franquia
UNION ALL
SELECT cnpj_completo, marca_norm FROM u_grupo;

-- ── scored_final: priority_rank NACIONAL + rede_marca ────────────────────
COPY (
  SELECT e.* EXCLUDE (fant_norm, razao_norm),
    rm.marca_norm AS rede_marca,
    -- percentil ordinal idêntico ao validado: Math.round(idx/(ne-1)*1000)/10
    -- (idx 0-based = row_number-1; empates pela ordem, não compartilhados)
    CASE WHEN e.elegivel THEN round(
      (row_number() OVER (PARTITION BY e.elegivel
         ORDER BY e.score_total, e.cnpj_completo) - 1)::DOUBLE
      / nullif(count(*) OVER (PARTITION BY e.elegivel) - 1, 0) * 100, 1)
      END AS priority_rank
  FROM est e LEFT JOIN rede_marca rm ON rm.cnpj_completo = e.cnpj_completo
) TO (getenv('OUT_DIR') || '/scored_final.parquet') (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- ── redes consolidadas (1 linha/rede) ────────────────────────────────────
COPY (
  WITH membros AS (
    SELECT rm.marca_norm,
      CASE WHEN rm.marca_norm LIKE 'GRP:%' THEN 'grupo' ELSE 'franquia' END AS tipo,
      e.score_total, e.classificacao, e.segmento_key, e.uf, e.municipio_nome,
      e.cnpj_basico, e.cnpj_completo
    FROM rede_marca rm JOIN est e ON e.cnpj_completo = rm.cnpj_completo
  ), agg AS (
    SELECT marca_norm, any_value(tipo) AS tipo,
      COUNT(*) AS n_unidades,
      COUNT(DISTINCT cnpj_basico) AS n_donos,
      round(avg(score_total), 1) AS score_medio,
      max(score_total) AS score_max,
      mode(segmento_key) AS segmento_key,
      list(DISTINCT uf) AS ufs,
      list(DISTINCT municipio_nome)[1:20] AS municipios,
      any_value(cnpj_completo) AS exemplo_cnpj
    FROM membros GROUP BY marca_norm
  )
  SELECT a.marca_norm,
    coalesce(f.nome_exibicao, g.nome_exibicao, a.marca_norm) AS nome_exibicao,
    a.tipo, a.n_unidades,
    CASE WHEN a.tipo = 'grupo' THEN 1 ELSE a.n_donos END AS n_donos,
    a.segmento_key, a.score_medio, a.score_max,
    CASE WHEN a.score_medio >= 80 THEN 'abordar_agora'
         WHEN a.score_medio >= 60 THEN 'boa'
         WHEN a.score_medio >= 40 THEN 'nutrir' ELSE 'baixa' END AS classificacao,
    a.ufs, a.municipios, a.exemplo_cnpj,
    CASE WHEN a.tipo = 'grupo'
      THEN CASE WHEN a.n_unidades >= 5 THEN 'alta' ELSE 'media' END
      ELSE CASE WHEN a.n_donos >= 6 THEN 'alta' ELSE 'media' END END AS confianca_rede
  FROM agg a
  LEFT JOIN franquia f ON f.marca_norm = a.marca_norm
  LEFT JOIN grupo g    ON g.marca_norm = a.marca_norm
) TO (getenv('OUT_DIR') || '/redes.parquet') (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- ── conjunto "priorizado endereçável" (o que vira XLSX/agregado) ──────────
-- regra do app: rede_marca null + elegível + segmento != franquia solta
-- + priority_rank >= 90. (consultoria já saiu no score = sem segmento)
CREATE OR REPLACE TEMP TABLE prio AS
SELECT * FROM read_parquet(getenv('OUT_DIR') || '/scored_final.parquet')
WHERE rede_marca IS NULL AND elegivel
  AND segmento_key IS NOT NULL AND segmento_key <> 'franquias_multiunidade'
  AND priority_rank >= 90;

COPY (SELECT * FROM prio)
  TO (getenv('OUT_DIR') || '/priorizados') (FORMAT PARQUET,
      PARTITION_BY (municipio_ibge), OVERWRITE_OR_IGNORE true,
      FILENAME_PATTERN 'prio_{i}');

-- ── cidades_agg (o que a TELA mostra) ────────────────────────────────────
COPY (
  WITH ativ AS (
    SELECT municipio_ibge, any_value(municipio_nome) AS municipio_nome,
           any_value(uf) AS uf, COUNT(*) AS total_ativos
    FROM read_parquet(getenv('OUT_DIR') || '/base/**/*.parquet')
    GROUP BY municipio_ibge
  ), p AS (
    SELECT municipio_ibge,
      COUNT(*) AS n_priorizados,
      SUM(CASE WHEN classificacao='abordar_agora' THEN 1 ELSE 0 END) AS n_abordar,
      SUM(CASE WHEN classificacao='boa' THEN 1 ELSE 0 END)           AS n_boa,
      round(avg(score_total), 1) AS score_medio,
      mode(segmento_key) AS seg_top
    FROM prio GROUP BY municipio_ibge
  ), r AS (
    SELECT e.municipio_ibge, COUNT(DISTINCT rm.marca_norm) AS n_redes
    FROM rede_marca rm JOIN est e ON e.cnpj_completo = rm.cnpj_completo
    GROUP BY e.municipio_ibge
  )
  SELECT a.municipio_ibge, a.municipio_nome, a.uf, a.total_ativos,
    coalesce(p.n_priorizados,0) AS n_priorizados,
    coalesce(p.n_abordar,0) AS n_abordar, coalesce(p.n_boa,0) AS n_boa,
    p.score_medio, p.seg_top, coalesce(r.n_redes,0) AS n_redes
  FROM ativ a LEFT JOIN p ON p.municipio_ibge=a.municipio_ibge
              LEFT JOIN r ON r.municipio_ibge=a.municipio_ibge
  WHERE coalesce(p.n_priorizados,0) > 0 OR coalesce(r.n_redes,0) > 0
) TO (getenv('OUT_DIR') || '/cidades_agg.parquet') (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- ── funil_agg + kpi_agg (poucas linhas — funil/cards do app) ──────────────
COPY (
  SELECT 'ativos' AS etapa, COUNT(*) AS n FROM read_parquet(getenv('OUT_DIR')||'/base/**/*.parquet')
  UNION ALL SELECT 'nao_micro', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/scored_final.parquet')
    WHERE NOT low_team_probability AND rede_marca IS NULL
  UNION ALL SELECT 'aderente', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/scored_final.parquet')
    WHERE NOT low_team_probability AND rede_marca IS NULL AND segmento_key IS NOT NULL
      AND segmento_key <> 'franquias_multiunidade'
  UNION ALL SELECT 'score60', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/scored_final.parquet')
    WHERE NOT low_team_probability AND rede_marca IS NULL AND segmento_key IS NOT NULL
      AND segmento_key <> 'franquias_multiunidade' AND score_total >= 60
  UNION ALL SELECT 'priorizados', (SELECT COUNT(*) FROM prio)
  UNION ALL SELECT 'redes', (SELECT COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/redes.parquet'))
) TO (getenv('OUT_DIR') || '/funil_agg.parquet') (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- sanity
SELECT 'scored' AS t, COUNT(*) n FROM read_parquet(getenv('OUT_DIR')||'/scored_final.parquet')
UNION ALL SELECT 'redes', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/redes.parquet')
UNION ALL SELECT 'redes_franquia', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/redes.parquet') WHERE tipo='franquia'
UNION ALL SELECT 'redes_grupo', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/redes.parquet') WHERE tipo='grupo'
UNION ALL SELECT 'priorizados', COUNT(*) FROM prio
UNION ALL SELECT 'cidades', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/cidades_agg.parquet');
