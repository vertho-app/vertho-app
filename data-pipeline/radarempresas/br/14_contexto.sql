-- ─────────────────────────────────────────────────────────────────────────
-- Stage 3 (BR) — contexto setorial por município×CNAE → contexto.parquet
--
-- 3a (agregação raw CAGED/RAIS → município×cnae) já é feita pelos
-- caged_agg.sql / rais_estab_agg.sql existentes — JÁ são nacionais
-- (agrupam por município; o pipeline Jundiaí só carregava 1 fatia).
-- Este script é o 3b: resolve a ROTATIVIDADE REAL bayesiana + percentil
-- POR MUNICÍPIO + corroboração CEMPRE. Porta 1:1 a lógica que estava
-- inline em radarempresas-score.ts (α=30, cap 1.5, pisos 30/10), agora
-- vetorizada por município em SQL.
--
-- CEMPRE = CORROBORAÇÃO (decisão fechada): NÃO altera o
-- caged_contexto_score nem vira eixo. Só (a) preenche
-- rais_tam_medio_setor onde RAIS é ralo (porte setorial via
-- pessoal_assal/empresas do CEMPRE, casado por CNAE-divisão) e
-- (b) sobe confiança 'baixa'→'media' quando o CEMPRE confirma que o
-- setor tem equipe no município. Emite cempre_corrobora p/ auditoria
-- (quanto o CEMPRE adicionou além do RAIS — base p/ decidir, com
-- evidência BR, se um dia vira eixo).
--
-- Entradas (env OUT_DIR): caged_municipio_cnae_6m.parquet,
--   rais_estab_municipio_cnae.parquet, cempre_sidra.parquet (opcional).
-- Saída: out/contexto.parquet (municipio_ibge, cnae, caged_contexto_
--   score, contexto_confianca, rais_tam_medio_setor, cempre_corrobora).
-- ─────────────────────────────────────────────────────────────────────────

SET memory_limit = '8GB';
SET temp_directory = './tmp_duck';
SET preserve_insertion_order = false;

-- parâmetros idênticos ao motor validado
-- ALPHA=30, CAP=1.5, PISO_EST=30, PISO_MOV=10

CREATE OR REPLACE TEMP TABLE cg AS
SELECT regexp_replace(municipio_ibge, '\D', '', 'g')     AS mun,
       regexp_replace(cnae, '\D', '', 'g')               AS cnae,
       (coalesce(admissoes_6m,0) + coalesce(desligamentos_6m,0)) AS mov
FROM read_parquet(getenv('OUT_DIR') || '/caged_municipio_cnae_6m.parquet');

CREATE OR REPLACE TEMP TABLE rs AS
SELECT regexp_replace(municipio_ibge, '\D', '', 'g')     AS mun,
       regexp_replace(cnae, '\D', '', 'g')               AS cnae,
       coalesce(estoque_vinculos,0)                       AS estoque,
       tam_medio_estimado                                 AS tam
FROM read_parquet(getenv('OUT_DIR') || '/rais_estab_municipio_cnae.parquet');

-- CEMPRE agregado por município × CNAE-DIVISÃO (2 díg) — corroboração grossa
CREATE OR REPLACE TEMP TABLE cempre AS
SELECT mun, div2,
       SUM(emp) AS cempre_emp, SUM(pess) AS cempre_pess,
       CASE WHEN SUM(emp) > 0 THEN SUM(pess) / SUM(emp) END AS cempre_porte
FROM (
  SELECT regexp_replace(municipio_ibge, '\D', '', 'g')   AS mun,
         substr(regexp_replace(cnae, '\D', '', 'g'), 1, 2) AS div2,
         coalesce(cempre_n_empresas, 0)                   AS emp,
         coalesce(cempre_pessoal_assal, 0)                AS pess
  FROM (SELECT * FROM read_parquet(getenv('OUT_DIR') || '/cempre_sidra.parquet'))
) GROUP BY mun, div2;

-- mov ÷ estoque, suavização bayesiana, confiança — por linha
CREATE OR REPLACE TEMP TABLE base AS
SELECT cg.mun, cg.cnae, cg.mov,
       rs.estoque, rs.tam,
       (rs.estoque >= 30 AND cg.mov >= 10)                AS robusto,
       (rs.estoque >= 30 OR  cg.mov >= 10)                AS meio,
       CASE WHEN rs.estoque IS NOT NULL THEN cg.mov::DOUBLE / nullif(rs.estoque,0) END AS razao_bruta
FROM cg LEFT JOIN rs ON rs.mun = cg.mun AND rs.cnae = cg.cnae;

-- média global POR MUNICÍPIO (só CNAEs robustos); fallback 0.3
CREATE OR REPLACE TEMP TABLE mg AS
SELECT mun,
       coalesce(avg(CASE WHEN robusto THEN razao_bruta END), 0.3) AS media_global
FROM base GROUP BY mun;

CREATE OR REPLACE TEMP TABLE val AS
SELECT b.mun, b.cnae, b.tam,
  CASE
    WHEN b.estoque > 0
      THEN least((b.mov + 30 * m.media_global) / (b.estoque + 30), 1.5)
    ELSE least(b.mov / 1000.0, 1.5)
  END AS val,
  CASE
    WHEN b.estoque > 0 AND b.robusto THEN 'alta'
    WHEN b.estoque > 0 AND b.meio    THEN 'media'
    ELSE 'baixa'
  END AS conf_base
FROM base b JOIN mg m ON m.mun = b.mun;

-- percentil ordinal POR MUNICÍPIO (idêntico ao Math.round(idx/(n-1)*100))
CREATE OR REPLACE TEMP TABLE ctx AS
SELECT v.mun AS municipio_ibge, v.cnae, v.tam,
  CASE WHEN cnt.n > 1
    THEN round((rn - 1)::DOUBLE / (cnt.n - 1) * 100)
    ELSE 50 END                                          AS caged_contexto_score,
  v.conf_base
FROM (
  SELECT mun, cnae, tam, conf_base,
    row_number() OVER (PARTITION BY mun ORDER BY val, cnae) AS rn
  FROM val
) v
JOIN (SELECT mun, COUNT(*) AS n FROM val GROUP BY mun) cnt ON cnt.mun = v.mun;

-- ── corroboração CEMPRE (não muda score; cobre RAIS ralo + confiança) ────
COPY (
  SELECT
    c.municipio_ibge, c.cnae,
    c.caged_contexto_score,
    -- rais_tam_medio_setor: RAIS quando há; senão fallback CEMPRE (porte
    -- setorial = pessoal_assal/empresas da divisão no município)
    coalesce(c.tam, round(e.cempre_porte, 1))            AS rais_tam_medio_setor,
    -- confiança: CEMPRE sobe 'baixa'→'media' SÓ se confirma setor com
    -- equipe local (porte >= 10, mesmo piso do low_team do score)
    CASE
      WHEN c.conf_base = 'baixa' AND e.cempre_porte >= 10 THEN 'media'
      ELSE c.conf_base
    END                                                  AS contexto_confianca,
    -- auditoria: 1 = CEMPRE adicionou sinal que RAIS não tinha
    CASE WHEN c.tam IS NULL AND e.cempre_porte IS NOT NULL THEN 1 ELSE 0 END
                                                         AS cempre_corrobora
  FROM ctx c
  LEFT JOIN cempre e
    ON e.mun = c.municipio_ibge
   AND e.div2 = substr(c.cnae, 1, 2)
) TO (getenv('OUT_DIR') || '/contexto.parquet') (FORMAT PARQUET, OVERWRITE_OR_IGNORE true);

-- ── sanity ───────────────────────────────────────────────────────────────
SELECT 'linhas'         AS check, COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet')
UNION ALL SELECT 'municipios', COUNT(DISTINCT municipio_ibge) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet')
UNION ALL SELECT 'conf_alta',  COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet') WHERE contexto_confianca='alta'
UNION ALL SELECT 'conf_media', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet') WHERE contexto_confianca='media'
UNION ALL SELECT 'conf_baixa', COUNT(*) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet') WHERE contexto_confianca='baixa'
UNION ALL SELECT 'cempre_corrobora', SUM(cempre_corrobora) FROM read_parquet(getenv('OUT_DIR')||'/contexto.parquet');
