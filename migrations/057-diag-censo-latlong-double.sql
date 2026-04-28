-- Migration 057 — latitude/longitude do Censo como DOUBLE PRECISION
-- NUMERIC(10,7) estourava com valores INEP que podem chegar com mais
-- de 7 casas decimais. DOUBLE PRECISION é o tipo natural pra coords.

ALTER TABLE diag_censo_infra
  ALTER COLUMN latitude TYPE DOUBLE PRECISION,
  ALTER COLUMN longitude TYPE DOUBLE PRECISION;
