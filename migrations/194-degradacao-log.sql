-- 194 · Telemetria de degradação (§3.3/prioridade-7 do docs/FMEA-PIPELINE.md).
--
-- Decisão de produto de 28/07: fallback pode existir, mas nunca INVISÍVEL. Vários
-- fluxos (DUO→single, missão placeholder, overlay sem kit, síntese do PPP) caíam
-- no caminho degradado com só um console.warn — que ninguém lê. Esta tabela é o
-- rastro persistido: cada queda em fallback vira UMA linha por (fluxo, tipo,
-- chave), com `ocorrencias` incrementada a cada repetição (dedup pelo UNIQUE —
-- o overlay roda a cada leitura de página, e sem dedup o log viraria ruído).
--
-- A escrita é SEMPRE via service_role (lib/degradacao.ts, nunca lança — o ponto
-- é o caminho de fallback não quebrar mais por causa da telemetria). A leitura é
-- do health-check estrutural (R10 em lib/pipeline-health/regras.ts).
--
-- RLS ON sem policy + REVOKE (modelo: mig 186): o detalhe pode carregar contexto
-- de tenant; ninguém lê por anon/authenticated. NOTA: a mig é numerada 194 porque
-- 192/193 foram ocupadas pelas migs do /board enquanto esta era escrita.
CREATE TABLE IF NOT EXISTS degradacao_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo text NOT NULL,              -- 'trilha' | 'build' | 'overlay' | 'contexto-empresa'
  tipo text NOT NULL,               -- constantes de lib/degradacao.ts (DEGRADACAO)
  chave text NOT NULL DEFAULT '',   -- dedup: ex. colaborador_id, empresaId:semana
  empresa_id uuid,
  colaborador_id uuid,
  severidade text NOT NULL DEFAULT 'aviso' CHECK (severidade IN ('info','aviso','critico')),
  detalhe jsonb,
  ocorrencias integer NOT NULL DEFAULT 1,
  primeiro_em timestamptz NOT NULL DEFAULT now(),
  ultima_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_degradacao_log ON degradacao_log (fluxo, tipo, chave);

COMMENT ON TABLE degradacao_log IS
  'Rastro persistido de quedas em fallback (FMEA §3.3): fallback pode existir, nunca invisível. Escrita por lib/degradacao.ts (service_role, nunca lança); leitura pelo health estrutural (R10). Uma linha por (fluxo, tipo, chave) — repetições incrementam ocorrencias.';

ALTER TABLE degradacao_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON degradacao_log FROM anon;
REVOKE ALL ON degradacao_log FROM authenticated;

-- Rollback:
-- DROP TABLE IF EXISTS degradacao_log;

NOTIFY pgrst, 'reload schema';
