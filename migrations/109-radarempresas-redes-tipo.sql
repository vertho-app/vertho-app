-- ─────────────────────────────────────────────────────────────────────────
-- 109 — Radar Empresas: tipo de rede (franquia vs grupo)
--
-- A consolidação 108 só pegava FRANQUIA: mesma nome_fantasia em ≥3
-- cnpj_basico distintos (donos diferentes). Não pegava REDE PRÓPRIA /
-- GRUPO: 1 só empresa (mesmo cnpj_basico) com N filiais — ex. Sodexo
-- (25 filiais em Jundiaí, 1 CNPJ-base), Raia Drogasil, Casas Bahia.
-- A matriz real (cnpj_ordem 0001) quase nunca está no recorte e
-- is_matriz veio quebrado do pipeline (100% true) — então o sinal
-- confiável de "mesma mesa de negociação" é o cnpj_basico.
--
-- tipo = 'franquia' (multi-dono, mesma marca) | 'grupo' (1 dono, N
-- filiais). Para 'grupo' a marca é a razão social; n_donos = 1.
-- Mesma lógica de saída: vira 1 lead, sai da lista/funil individual.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE radarempresas_redes
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'franquia';

-- as 36 linhas existentes foram detectadas pela regra de franquia
UPDATE radarempresas_redes SET tipo = 'franquia' WHERE tipo IS NULL;

SELECT tipo, COUNT(*) AS n FROM radarempresas_redes GROUP BY tipo;
