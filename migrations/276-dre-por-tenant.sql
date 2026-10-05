-- 276 — DRE por tenant: contratos, parcelas, lançamentos manuais, câmbio e
-- fechamento semanal do custo de IA.
--
-- POR QUE EXISTE
-- O custo de IA por tenant já existe (`ia_usage_log` + e-mail semanal), mas a
-- RECEITA não tinha onde morar: `empresas` não tem campo comercial,
-- `sales_accounts`/`sales_proposals` não apontam para `empresas` e não existe
-- tabela de parcela nem de recebimento. Sem receita não há DRE, só custo.
--
-- REGIME: receita por CAIXA (a data em que a parcela entrou), custo por
-- competência semanal. É decisão do dono (05/10/2026) e fica escrita na tela.
--
-- POR QUE `ON DELETE SET NULL` NAS TRÊS PONTAS COM `empresa_id`
-- `ia_usage_log.empresa_id` é CASCADE: excluir um tenant apaga o custo histórico
-- dele. Registro financeiro não pode ter o mesmo destino, e também não pode
-- travar `excluirEmpresa` (RESTRICT daria 23503 na cara do operador). Então o
-- vínculo vira NULL e o registro sobrevive, legível por `empresa_nome`.
--
-- POR QUE `chave_empresa` (texto) AO LADO DE `empresa_id`
-- Depois do SET NULL, dois tenants excluídos teriam `empresa_id` nulo nas duas
-- linhas e colidiriam no índice único do fechamento — e a colisão acontece
-- DENTRO do `DELETE` do tenant, derrubando a exclusão. A `chave_empresa` é o
-- uuid do tenant (ou 'sem-tenant') gravado no nascimento da linha e nunca mais
-- alterado: é o que agrupa, e o que sobrevive à exclusão. `empresa_id` só serve
-- para juntar com `empresas` enquanto o tenant existe.
--
-- POR QUE `previsto` É UMA CÓPIA
-- `salvarOrcamento` ainda sobrescreve `orcamento_cenarios.resultado`. O previsto
-- que a DRE compara com o realizado tem de ser o que foi decidido na assinatura,
-- não o que a régua de hoje produz (mesma razão do par `entradas`/`resultado`
-- da mig 253).
--
-- ACESSO: tabelas INTERNAS da plataforma. Sem RLS de tenant: o isolamento é a
-- rota (`/admin/vertho/dre`), o gate `dre.view`/`dre.manage` nas actions e o
-- grant só para service_role. Nunca exponha isto em rota pública. A tabela de
-- parcelas e a de lançamentos têm DINHEIRO: toda escrita audita em
-- `admin_audit_log` (antes e depois).
--
-- COMPATIBILIDADE: aditivo e idempotente. Não altera nenhuma tabela existente.

-- ── 1) Contratos ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dre_contratos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            uuid REFERENCES empresas(id) ON DELETE SET NULL,
  empresa_nome          text NOT NULL,
  chave_empresa         text NOT NULL CHECK (chave_empresa <> ''),
  nome                  text NOT NULL CHECK (btrim(nome) <> ''),
  valor_total_brl       numeric(14,2) NOT NULL CHECK (valor_total_brl >= 0),
  inicio                date NOT NULL,
  status                text NOT NULL DEFAULT 'em_vigor'
                        CHECK (status IN ('em_vigor','encerrado','cancelado')),
  orcamento_id          uuid REFERENCES orcamento_cenarios(id) ON DELETE SET NULL,
  previsto              jsonb CHECK (previsto IS NULL OR jsonb_typeof(previsto) = 'object'),
  previsto_congelado_em timestamptz,
  criado_por            text NOT NULL,
  atualizado_por        text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dre_contratos IS
  'Contrato (projeto vendido) de um tenant, mig 276. Interno Vertho, sem RLS de tenant: gate dre.view/dre.manage nas actions. empresa_id vira NULL se o tenant for excluído (o contrato sobrevive); chave_empresa é o agrupador estável.';
COMMENT ON COLUMN dre_contratos.chave_empresa IS
  'uuid do tenant em texto, gravado na criação e NUNCA alterado. Agrupa a DRE depois que empresa_id virar NULL (tenant excluído).';
COMMENT ON COLUMN dre_contratos.previsto IS
  'Cópia congelada do ResumoOrcamento no dia em que o contrato foi ligado ao orçamento (valorFinal, parcela, parcelas, custoTotalBrl, custoIABrl, margemPct, piorSaldo, cotação). NULL = contrato criado sem orçamento.';
COMMENT ON COLUMN dre_contratos.status IS
  'em_vigor | encerrado | cancelado. Contrato com parcela recebida nunca é apagado: vira cancelado.';

CREATE INDEX IF NOT EXISTS idx_dre_contratos_empresa ON dre_contratos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_dre_contratos_chave ON dre_contratos (chave_empresa);

-- ── 2) Parcelas (a única fonte de receita da DRE) ───────────────────────────

CREATE TABLE IF NOT EXISTS dre_parcelas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT de propósito: parcela recebida é registro financeiro, e a ordem de
  -- exclusão (parcelas antes do contrato) fica imposta pelo banco.
  contrato_id         uuid NOT NULL REFERENCES dre_contratos(id) ON DELETE RESTRICT,
  numero              integer NOT NULL CHECK (numero >= 1),
  vencimento          date NOT NULL,
  valor_previsto_brl  numeric(14,2) NOT NULL CHECK (valor_previsto_brl >= 0),
  recebido_em         date,
  valor_recebido_brl  numeric(14,2) CHECK (valor_recebido_brl IS NULL OR valor_recebido_brl >= 0),
  nota_fiscal         text,
  observacao          text,
  criado_por          text NOT NULL,
  atualizado_por      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_parcelas_numero_unico UNIQUE (contrato_id, numero),
  -- Recebimento é o par (data, valor): um sem o outro é lixo que a DRE leria
  -- como receita de valor nulo ou como recebimento sem data.
  CONSTRAINT dre_parcelas_recebimento_par CHECK ((recebido_em IS NULL) = (valor_recebido_brl IS NULL))
);

COMMENT ON TABLE dre_parcelas IS
  'Parcelas do contrato, mig 276. Receita por CAIXA: a DRE soma valor_recebido_brl na semana de recebido_em. Parcela sem recebimento é previsão (a receber), nunca receita.';
COMMENT ON COLUMN dre_parcelas.recebido_em IS
  'Data em que o dinheiro entrou (date, sem fuso). Cai na semana por aritmética de calendário.';

CREATE INDEX IF NOT EXISTS idx_dre_parcelas_recebido
  ON dre_parcelas (recebido_em) WHERE recebido_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dre_parcelas_a_receber
  ON dre_parcelas (vencimento) WHERE recebido_em IS NULL;

-- ── 3) Lançamentos manuais (custos que não vêm do ledger) ───────────────────

CREATE TABLE IF NOT EXISTS dre_lancamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo          text NOT NULL CHECK (escopo IN ('empresa','plataforma')),
  empresa_id      uuid REFERENCES empresas(id) ON DELETE SET NULL,
  empresa_nome    text,
  chave_empresa   text NOT NULL CHECK (chave_empresa <> ''),
  semana_inicio   date NOT NULL CHECK (extract(isodow FROM semana_inicio) = 1),
  categoria       text NOT NULL
                  CHECK (categoria IN ('horas','impostos','comissao','infra','whatsapp','terceiros','outros')),
  descricao       text,
  horas           numeric(7,2) CHECK (horas IS NULL OR horas > 0),
  custo_hora_brl  numeric(10,2) CHECK (custo_hora_brl IS NULL OR custo_hora_brl >= 0),
  responsavel     text,
  valor_brl       numeric(14,2) NOT NULL CHECK (valor_brl > 0),
  criado_por      text NOT NULL,
  atualizado_por  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Horas: o valor É horas × custo/hora (arredondado a centavo). Gravar os dois
  -- sem amarra deixaria o relatório de horas e o de dinheiro divergirem.
  CONSTRAINT dre_lancamentos_horas_coerentes CHECK (
    horas IS NULL OR (custo_hora_brl IS NOT NULL AND valor_brl = round(horas * custo_hora_brl, 2))
  ),
  CONSTRAINT dre_lancamentos_horas_da_categoria CHECK (categoria <> 'horas' OR horas IS NOT NULL),
  -- Escopo 'plataforma' = custo geral, sem tenant. Escopo 'empresa' com
  -- empresa_id nulo = tenant excluído depois (SET NULL) — por isso NÃO há
  -- constraint amarrando as duas colunas: ela derrubaria a exclusão do tenant.
  CONSTRAINT dre_lancamentos_chave_plataforma CHECK (escopo <> 'plataforma' OR chave_empresa = 'sem-tenant')
);

COMMENT ON TABLE dre_lancamentos IS
  'Custos lançados à mão (horas, impostos, comissão, infra, WhatsApp, terceiros, outros), mig 276. semana_inicio é a segunda-feira (BRT) da competência.';
COMMENT ON COLUMN dre_lancamentos.escopo IS
  'empresa = custo de um tenant; plataforma = custo geral sem tenant (aparece no bloco "Fora de cliente"). escopo=empresa com empresa_id NULL = tenant excluído depois.';
COMMENT ON COLUMN dre_lancamentos.custo_hora_brl IS
  'Custo/hora aplicado NA HORA do lançamento (padrão do orçamento: R$ 500). Gravado na linha: mudar o padrão depois não reescreve o passado.';

CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_semana ON dre_lancamentos (semana_inicio);
CREATE INDEX IF NOT EXISTS idx_dre_lancamentos_chave ON dre_lancamentos (chave_empresa, semana_inicio);

-- ── 4) Câmbio semanal (USD→BRL) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dre_cambio_semanal (
  semana_inicio date PRIMARY KEY CHECK (extract(isodow FROM semana_inicio) = 1),
  usd_brl       numeric(8,4) NOT NULL CHECK (usd_brl > 0),
  fonte         text NOT NULL CHECK (fonte IN ('ptax_bcb','manual','herdado','orcamento')),
  obtido_em     timestamptz NOT NULL DEFAULT now(),
  definido_por  text
);

COMMENT ON TABLE dre_cambio_semanal IS
  'Cotação USD→BRL de cada semana, mig 276. ptax_bcb = média da PTAX de venda dos dias úteis; manual = definida por um sócio (nunca sobrescrita pelo cron); herdado = BCB indisponível, repete a semana anterior; orcamento = BCB indisponível e sem semana anterior, usa a cotação do orçamento.';

-- ── 5) Fechamento semanal do custo de IA ────────────────────────────────────

CREATE TABLE IF NOT EXISTS dre_custo_ia_semana (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_inicio     date NOT NULL CHECK (extract(isodow FROM semana_inicio) = 1),
  natureza          text NOT NULL CHECK (natureza IN ('operacao','pd')),
  chave_empresa     text NOT NULL CHECK (chave_empresa <> ''),
  empresa_id        uuid REFERENCES empresas(id) ON DELETE SET NULL,
  empresa_nome      text,
  custo_usd         numeric(14,6) NOT NULL CHECK (custo_usd >= 0),
  usd_brl           numeric(8,4) NOT NULL CHECK (usd_brl > 0),
  custo_brl         numeric(14,2) NOT NULL CHECK (custo_brl >= 0),
  chamadas          integer NOT NULL DEFAULT 0,
  linhas_sem_custo  integer NOT NULL DEFAULT 0,
  fechado_em        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dre_custo_ia_semana_grupo UNIQUE (semana_inicio, natureza, chave_empresa)
);

COMMENT ON TABLE dre_custo_ia_semana IS
  'Fechamento durável do custo de IA por (semana, natureza, tenant), mig 276. Existe por três razões: sobrevive à exclusão do tenant (ia_usage_log é CASCADE), congela o câmbio da semana e deixa a tela ler 12 semanas em uma query. natureza segue lib/custo-ia/classificacao.ts (operacao = cliente pagante; pd = o resto).';
COMMENT ON COLUMN dre_custo_ia_semana.linhas_sem_custo IS
  'Chamadas do ledger sem cost_usd (modelo fora do catálogo). O custo da linha é PISO enquanto isto for > 0.';

CREATE INDEX IF NOT EXISTS idx_dre_custo_ia_semana_semana ON dre_custo_ia_semana (semana_inicio);

-- ── 6) Postura de acesso ────────────────────────────────────────────────────
-- App roda 100% service-role (BYPASSRLS); RLS + revoke + policy deny-all é a
-- rede de segurança caso a tabela seja alcançada por chave anon (padrão da
-- mig 253).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dre_contratos','dre_parcelas','dre_lancamentos','dre_cambio_semanal','dre_custo_ia_semana'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('REVOKE ALL ON %I FROM authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_sem_acesso_direto', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      t || '_sem_acesso_direto', t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Rollback (se precisar; as parcelas caem antes dos contratos por causa do RESTRICT):
-- DROP TABLE IF EXISTS dre_custo_ia_semana;
-- DROP TABLE IF EXISTS dre_cambio_semanal;
-- DROP TABLE IF EXISTS dre_lancamentos;
-- DROP TABLE IF EXISTS dre_parcelas;
-- DROP TABLE IF EXISTS dre_contratos;
