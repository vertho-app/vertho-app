-- 280 — DRE: lançamento de custo MENSAL, além do semanal.
--
-- POR QUE EXISTE
-- `dre_lancamentos` (mig 276) só aceitava custo por semana (`semana_inicio`). Custo
-- de infraestrutura, assinatura e comissão costuma chegar FECHADO POR MÊS, e
-- obrigar a pessoa a dividir à mão em 4 ou 5 semanas de tamanhos diferentes é
-- convidar o erro (e a soma das semanas deixar de bater com a fatura).
--
-- COMO FICA
-- O lançamento mensal é UMA linha (`periodicidade = 'mensal'`, `mes_competencia`
-- = primeiro dia do mês, `semana_inicio` nulo). Quem aloca nas semanas é a DRE, na
-- leitura (`lib/dre/rateio.ts`): o valor do mês é rateado por DIA, então cada semana
-- recebe a parte dos dias dela que caem no mês (semana que cruza dois meses recebe
-- uma fatia de cada). A soma das semanas é SEMPRE o valor do mês, sem centavo
-- perdido. Guardar o mês, e não as semanas, mantém o registro igual ao que a pessoa
-- digitou e à fatura, e a auditoria mostra um lançamento, não cinco.
--
-- COMPATIBILIDADE: aditivo e idempotente. Toda linha existente é semanal e continua
-- válida (a coluna nova tem DEFAULT 'semanal' e a de mês fica nula). O código antigo
-- segue gravando semanal sem saber da coluna; por isso esta migration pode (e deve)
-- ser aplicada ANTES do deploy.

-- ── 1) Colunas novas ────────────────────────────────────────────────────────

ALTER TABLE dre_lancamentos
  ADD COLUMN IF NOT EXISTS periodicidade text NOT NULL DEFAULT 'semanal'
    CHECK (periodicidade IN ('semanal','mensal'));

ALTER TABLE dre_lancamentos
  ADD COLUMN IF NOT EXISTS mes_competencia date
    CHECK (mes_competencia IS NULL OR extract(day FROM mes_competencia) = 1);

-- O lançamento mensal não tem semana: a coluna passa a aceitar nulo.
ALTER TABLE dre_lancamentos ALTER COLUMN semana_inicio DROP NOT NULL;

-- ── 2) Coerência: ou é semanal (com semana) ou é mensal (com mês), nunca os dois ──
-- ADD CONSTRAINT não tem IF NOT EXISTS: o bloco confere o catálogo para ser idempotente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dre_lancamentos_periodo_coerente'
      AND conrelid = 'public.dre_lancamentos'::regclass
  ) THEN
    ALTER TABLE dre_lancamentos
      ADD CONSTRAINT dre_lancamentos_periodo_coerente CHECK (
        (periodicidade = 'semanal' AND semana_inicio IS NOT NULL AND mes_competencia IS NULL)
        OR
        (periodicidade = 'mensal' AND mes_competencia IS NOT NULL AND semana_inicio IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN dre_lancamentos.periodicidade IS
  'semanal = custo de UMA semana (semana_inicio); mensal = custo de UM mês (mes_competencia), rateado pelas semanas por dia na leitura (lib/dre/rateio.ts). Mig 280.';
COMMENT ON COLUMN dre_lancamentos.mes_competencia IS
  'Primeiro dia do mês do lançamento mensal. NULL nos semanais. A DRE aloca valor_brl nas semanas proporcional aos dias de cada semana que caem no mês; a soma das semanas é sempre valor_brl.';
COMMENT ON COLUMN dre_lancamentos.semana_inicio IS
  'Segunda-feira (BRT) da competência dos lançamentos SEMANAIS. NULL nos mensais (ver mes_competencia).';

CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_mes
  ON dre_lancamentos (mes_competencia) WHERE mes_competencia IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- Rollback (só se NENHUM lançamento mensal tiver sido gravado; senão apague-os antes):
-- ALTER TABLE dre_lancamentos DROP CONSTRAINT IF EXISTS dre_lancamentos_periodo_coerente;
-- DROP INDEX IF EXISTS idx_dre_lancamentos_mes;
-- ALTER TABLE dre_lancamentos ALTER COLUMN semana_inicio SET NOT NULL;
-- ALTER TABLE dre_lancamentos DROP COLUMN IF EXISTS mes_competencia;
-- ALTER TABLE dre_lancamentos DROP COLUMN IF EXISTS periodicidade;
