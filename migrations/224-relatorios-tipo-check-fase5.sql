-- 🔴 Achado NOVO, durante o conserto do B11 (24/08/2026).
--
-- `relatorios_tipo_check` (herdado do baseline do GAS) aceita apenas
-- 'individual', 'gestor', 'rh', 'plenaria', 'evolucao'. Só que a fase 5 grava
-- QUATRO tipos que não estão nessa lista:
--
--   actions/fase5/evolucao.ts:415          → 'plenaria_evolucao'
--   actions/fase5/relatorios-envios.ts:134 → 'rh_manual'
--   actions/fase5/relatorios-envios.ts:227 → 'plenaria_relatorio'
--   actions/fase5/relatorios-envios.ts:361 → 'dossie_gestor'
--
-- As quatro escritas passavam por `upsertRelatorioAgregado`, que NÃO capturava
-- `{ error }` — então o Postgres recusava por violação de CHECK, o erro era
-- descartado e a action devolvia `success: true`. `Medido em 24/08:` os quatro
-- tipos têm **ZERO linhas** na tabela; o que existe é 'individual' (84), 'rh' (3)
-- e 'gestor' (2), todos gravados por outros caminhos.
--
-- Não é risco futuro: a cadeia nunca funcionou. E ela se propaga —
-- `plenaria_evolucao` e `rh_manual` são LIDOS em três pontos para compor o
-- relatório de RH, o de plenária e o dossiê. `gerarRelatorioPlenaria` chega a
-- devolver "Plenária de evolução não encontrada": o insumo tinha sido gerado
-- (com custo de IA) e descartado na gravação.
--
-- Este é o conserto certo em vez de renomear para os tipos antigos: os quatro
-- são semanticamente distintos dos canônicos ('rh_manual' não é o 'rh', que é
-- gravado por actions/relatorios.ts:371), e há consumidor lendo cada um.
--
-- Idempotente: dropa a constraint pelo nome e recria.

ALTER TABLE relatorios DROP CONSTRAINT IF EXISTS relatorios_tipo_check;

ALTER TABLE relatorios ADD CONSTRAINT relatorios_tipo_check CHECK (
  tipo = ANY (ARRAY[
    -- canônicos, herdados do GAS
    'individual'::text,
    'gestor'::text,
    'rh'::text,
    'plenaria'::text,
    'evolucao'::text,
    -- fase 5 agregada (nunca couberam no CHECK original)
    'plenaria_evolucao'::text,
    'rh_manual'::text,
    'plenaria_relatorio'::text,
    'dossie_gestor'::text
  ])
);
