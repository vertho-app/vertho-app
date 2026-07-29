-- 196: CONARH 52 — qualificação e sessão da demo no lead de feira
--
-- Motivador concreto: a captura da feira (scope_id 'conarh-2026', allowlist da
-- mig 195) gravava nome/empresa/WhatsApp mas perdia as duas coisas que valem
-- mais que todos os campos — a PORTA que o visitante apontou e a COMPETÊNCIA
-- que ele citou com as palavras dele. Sem elas, o follow-up de T+0 vira
-- automação genérica. A sessão da porta 2 (nota instintiva, reavaliação,
-- divergências vs. motor) também é o ativo de dados de setembro — hoje se
-- perderia no dispositivo.
--
-- Sete colunas novas em diag_leads, todas nullable (linhas antigas de outras
-- origens não têm esses dados e não precisam):
--   porta_escolhida     — 1–5, a porta que ele apontou no gesto de direcionar
--   competencia_critica — a competência com as palavras dele
--   horizonte           — 'rodando' | 'ate_3m' | '3_a_6m' | 'sem_data'
--   classe              — 'A' | 'B' | 'C' (classificação na hora)
--   reuniao_em          — slot marcado no estande (agenda na hora)
--   sessao              — JSON da sessão: nota instintiva, reavaliação por
--                         descritor, divergências vs. motor, rotas concluídas
--   followup_step       — régua T+0→T+5: último toque executado (0 = nenhum)
-- Idempotente.

ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS porta_escolhida     SMALLINT;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS competencia_critica TEXT;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS horizonte           TEXT;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS classe              TEXT;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS reuniao_em          TIMESTAMPTZ;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS sessao              JSONB;
ALTER TABLE diag_leads ADD COLUMN IF NOT EXISTS followup_step       SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN diag_leads.porta_escolhida IS
  'CONARH: porta (1–5) que o visitante apontou no estande. Diz por onde recomeçar a conversa no follow-up.';
COMMENT ON COLUMN diag_leads.competencia_critica IS
  'CONARH: competência crítica citada pelo visitante, com as palavras dele. É o que faz o T+1 parecer escrito por gente.';
COMMENT ON COLUMN diag_leads.horizonte IS
  'CONARH: horizonte de decisão — rodando | ate_3m | 3_a_6m | sem_data.';
COMMENT ON COLUMN diag_leads.classe IS
  'CONARH: classificação do lead na hora — A (decide/recomenda + dor clara + horizonte + próximo passo), B (aderente sem urgência), C (fora da cadência).';
COMMENT ON COLUMN diag_leads.reuniao_em IS
  'CONARH: data/hora da reunião marcada no estande. Lead A sai com data no calendário, não com "a gente se fala".';
COMMENT ON COLUMN diag_leads.sessao IS
  'CONARH: sessão da demo em JSON — nota instintiva, reavaliação por descritor, divergências vs. motor, rotas concluídas. Anônimo até a captura; alimenta o ativo de dados de setembro.';
COMMENT ON COLUMN diag_leads.followup_step IS
  'CONARH: último toque da régua executado — 0 nenhum, 1 T+0, 2 T+1, 3 T+3, 4 T+5. B e C só avançam se responderem.';

-- Guardas leves: porta só faz sentido entre 1 e 5; classe só A/B/C.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diag_leads_porta_valida'
  ) THEN
    ALTER TABLE diag_leads
      ADD CONSTRAINT diag_leads_porta_valida
      CHECK (porta_escolhida IS NULL OR porta_escolhida BETWEEN 1 AND 5) NOT VALID;
    ALTER TABLE diag_leads VALIDATE CONSTRAINT diag_leads_porta_valida;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'diag_leads_classe_valida'
  ) THEN
    ALTER TABLE diag_leads
      ADD CONSTRAINT diag_leads_classe_valida
      CHECK (classe IS NULL OR classe IN ('A', 'B', 'C')) NOT VALID;
    ALTER TABLE diag_leads VALIDATE CONSTRAINT diag_leads_classe_valida;
  END IF;
END $$;

-- Painel diário e régua: varredura por campanha + dia
CREATE INDEX IF NOT EXISTS idx_diag_leads_conarh
  ON diag_leads (scope_id, criado_em DESC)
  WHERE scope_id = 'conarh-2026';

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP INDEX IF EXISTS idx_diag_leads_conarh;
-- ALTER TABLE diag_leads DROP CONSTRAINT IF EXISTS diag_leads_classe_valida;
-- ALTER TABLE diag_leads DROP CONSTRAINT IF EXISTS diag_leads_porta_valida;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS followup_step;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS sessao;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS reuniao_em;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS classe;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS horizonte;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS competencia_critica;
-- ALTER TABLE diag_leads DROP COLUMN IF EXISTS porta_escolhida;
