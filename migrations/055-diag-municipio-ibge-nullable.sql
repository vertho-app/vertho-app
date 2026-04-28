-- ═════════════════════════════════════════════════════════════════
-- Migration 055 — torna municipio_ibge e uf nullable em diag_escolas
-- O XLSX gerado pelo saeb_pipeline (Python) não inclui o IBGE; o
-- importador derive via lookup da microrregião quando possível, mas
-- precisamos permitir nulo defensivamente para escolas fora da
-- microrregião alvo (importação parcial / debug / V1.5+ nacional).
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE diag_escolas ALTER COLUMN municipio_ibge DROP NOT NULL;
ALTER TABLE diag_escolas ALTER COLUMN uf DROP NOT NULL;
ALTER TABLE diag_escolas ALTER COLUMN municipio DROP NOT NULL;
