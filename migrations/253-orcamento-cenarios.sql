-- 253 — Orçamentos salvos: o deal desk passa a persistir o cenário que calcula.
--
-- POR QUE EXISTE
-- `/admin/vertho/orcamento` calcula um projeto inteiro no navegador e não grava
-- NADA (docs/ORCAMENTO.md dizia isso explicitamente: "A tela de orçamento
-- calcula um cenário no navegador; ela não cria nem persiste uma proposta").
-- São ~20 entradas livres — escopo, jornada contratada, régua de preço editável,
-- peças de conteúdo por formato, extração de vídeo, preset de modelos IA,
-- contingência, impostos, canal de comissão. Recarregou a página, perdeu.
--
-- O que isso custava na prática: uma negociação que leva dias não tem onde
-- morar. Cada retomada refaz o cenário à mão, e nada registra QUAL número foi
-- aprovado — só o que a régua de hoje produz.
--
-- POR QUE `entradas` E `resultado`, OS DOIS
-- A régua (`ORCAMENTO_DEFAULTS`) e o catálogo de IA evoluem: a cotação é a PTAX
-- de 10/09/2026, o preset "atual" é o que está em produção no dia. Então:
--   · só `resultado` = foto sem reprodução (vê o número, não volta à tela);
--   · só `entradas`  = recalcula com a régua NOVA e mostra outro valor, sem que
--                      ninguém tenha decidido nada.
-- Um orçamento aprovado em setembro e reaberto em novembro tem de mostrar o que
-- foi aprovado. Daí o par, espelhando `copilot_plans.inputs`/`.plan` (mig 235).
--
-- POR QUE NÃO TEM `empresa_id`
-- Tabela NÃO é multi-tenant: não pertence a nenhum cliente. É a ferramenta
-- interna de precificação da Vertho, como `board_paineis` (mig 192) e
-- `radarempresas_listas` (mig 099) — o `cliente` é texto livre do cenário, não
-- um tenant. O isolamento é a rota (/admin/vertho/*, atrás do gate de plataforma)
-- e o grant: service_role apenas. Nunca exponha isto em rota pública.
--
-- COMPATIBILIDADE: aditivo e idempotente. Não altera nenhuma tabela existente.

-- ── 1) Tabela ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orcamento_cenarios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  cliente        text,
  entradas       jsonb NOT NULL CHECK (jsonb_typeof(entradas) = 'object'),
  resultado      jsonb NOT NULL CHECK (jsonb_typeof(resultado) = 'object'),
  criado_por     text NOT NULL,
  atualizado_por text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE orcamento_cenarios IS
  'Orçamentos salvos do deal desk (/admin/vertho/orcamento), mig 253. Interno Vertho — SEM empresa_id: o isolamento é a rota + grant service_role, não RLS de tenant. `entradas` reproduz a tela; `resultado` congela a decisão do dia (a régua evolui, o aprovado não).';

COMMENT ON COLUMN orcamento_cenarios.nome IS
  'Rótulo do cenário, obrigatório. Sem nome a lista vira "R$ 5.569.000 · 14/09" repetido, onde nada distingue um orçamento do outro.';

COMMENT ON COLUMN orcamento_cenarios.cliente IS
  'Cliente em TEXTO LIVRE (decisão de 14/09/2026), não FK para sales_accounts: o deal desk orça antes de o prospect existir no CRM. NULL = cenário interno/sem cliente.';

COMMENT ON COLUMN orcamento_cenarios.entradas IS
  'EntradasOrcamento (lib/orcamento/cenario.ts): escopo, jornada, régua de preço, conteúdo por formato, extração, preset IA. É o que REPRODUZ a tela. Sempre lido por normalizarEntradas — campo ausente cai no default da régua, nunca vira NaN.';

COMMENT ON COLUMN orcamento_cenarios.resultado IS
  'ResumoOrcamento (lib/orcamento/cenario.ts): valor, parcela, margem, desconto máximo, custo all-in, pior saldo de caixa. CONGELADO no save — não é cache, é o registro do que foi decidido com a régua daquele dia.';

COMMENT ON COLUMN orcamento_cenarios.criado_por IS
  'E-mail do platform admin que salvou (mesma postura de board_paineis.criado_por, mig 192: ator é e-mail, não FK).';

COMMENT ON COLUMN orcamento_cenarios.atualizado_por IS
  'E-mail de quem sobrescreveu o cenário por último. NULL = nunca atualizado depois de criado.';

-- ── 2) Índices ──────────────────────────────────────────────────────────────

-- A lista abre ordenada por recência; o filtro por autor é a outra consulta real.
CREATE INDEX IF NOT EXISTS idx_orcamento_cenarios_created
  ON orcamento_cenarios (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_cenarios_autor
  ON orcamento_cenarios (criado_por, created_at DESC);

-- ── 3) Postura de acesso ────────────────────────────────────────────────────
-- App roda 100% service-role (BYPASSRLS); RLS + revoke + policy deny-all é a
-- rede de segurança para o caso de a tabela ser alcançada por chave anon. É o
-- padrão mais estrito dos três aceitos no repo (copilot_plans, mig 235).
ALTER TABLE orcamento_cenarios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON orcamento_cenarios FROM anon;
REVOKE ALL ON orcamento_cenarios FROM authenticated;

DROP POLICY IF EXISTS orcamento_cenarios_sem_acesso_direto ON orcamento_cenarios;
CREATE POLICY orcamento_cenarios_sem_acesso_direto
  ON orcamento_cenarios
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar):
-- DROP TABLE IF EXISTS orcamento_cenarios;
-- (a policy e os índices caem junto com a tabela; nenhuma outra tabela é tocada)
