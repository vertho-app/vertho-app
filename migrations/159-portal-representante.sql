-- 159 — Portal do Representante (canal comercial de representantes autônomos)
--
-- CONTEXTO: workspace comercial para representantes comerciais (RCs) autônomos:
-- CRM/pipeline, proteção de oportunidade (90 dias), propostas com aprovação
-- interna Vertho, comissão estimada, carteira e materiais aprovados.
--
-- MODELO: NÃO é tenant. Isolamento por representante_id, aplicado 100%
-- server-side (guards em lib/sales/permissions.ts + actions/sales/*).
--
-- SEGURANÇA (padrão pós-mig 156/158, guard de postura INV1-5):
--   • RLS habilitada em TODAS as tabelas, SEM policies → service_role-only.
--   • REVOKE explícito de anon/authenticated (defesa em profundidade).
--   • Sem SECURITY DEFINER, sem MV, sem grants novos.
--
-- HOOKS MVP 2-4 já no schema: sales_commission_events (forecast/accrued/paid/
-- chargeback), campos de renovação/risco em accounts, playbook por segmento em
-- sales_materials (category+segment).

-- ── 1. Representantes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_representatives (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid UNIQUE,                    -- auth.users.id (login do RC)
  email             text NOT NULL UNIQUE,           -- lookup canônico (lowercase)
  name              text NOT NULL,
  company_name      text,
  cnpj              text,
  core_registration text,                           -- registro CORE (representante)
  phone             text,
  region            text,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','suspended')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Contas (empresas/escolas prospectadas) ────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id    uuid NOT NULL REFERENCES sales_representatives(id),
  legal_name          text NOT NULL,
  trade_name          text,
  cnpj                text,
  segment             text,                         -- escola | empresa | rede_ensino | fundacao | outro
  city                text,
  state               text,
  number_of_employees integer CHECK (number_of_employees IS NULL OR number_of_employees >= 0),
  number_of_units     integer CHECK (number_of_units IS NULL OR number_of_units >= 0),
  notes               text,
  status              text NOT NULL DEFAULT 'prospect'
                      CHECK (status IN ('prospect','active_client','inactive','lost')),
  -- hooks MVP 3 (carteira/renovação/risco)
  contract_start_date date,
  renewal_date        date,
  churn_risk          text CHECK (churn_risk IS NULL OR churn_risk IN ('baixo','medio','alto')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_accounts_rep ON sales_accounts (representante_id);
CREATE INDEX IF NOT EXISTS idx_sales_accounts_status ON sales_accounts (representante_id, status);

-- ── 3. Contatos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES sales_accounts(id) ON DELETE CASCADE,
  representante_id uuid NOT NULL REFERENCES sales_representatives(id),
  name             text NOT NULL,
  role             text,
  email            text,
  phone            text,
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_contacts_account ON sales_contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_sales_contacts_rep ON sales_contacts (representante_id);

-- ── 4. Oportunidades (núcleo do CRM) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_opportunities (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id      uuid NOT NULL REFERENCES sales_representatives(id),
  account_id            uuid NOT NULL REFERENCES sales_accounts(id),
  primary_contact_id    uuid REFERENCES sales_contacts(id),
  opportunity_name      text NOT NULL,
  origin                text,                       -- indicação | prospecção | evento | inbound | outro
  product_interest      text,                       -- onboarding | completo | mentor_ia | pulso | custom
  identified_need       text,
  stage                 text NOT NULL DEFAULT 'lead_identificado'
                        CHECK (stage IN (
                          'lead_identificado','contato_iniciado','diagnostico_reuniao_realizada',
                          'proposta_enviada','negociacao','aguardando_aceite_vertho',
                          'contrato_enviado','fechado_ganho','fechado_perdido','sem_avanco_expirado')),
  estimated_value       numeric(14,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  estimated_close_date  date,
  next_action           text,
  next_action_date      date,
  interaction_evidence  text,                       -- evidência de interação real (valida a oportunidade)
  protection_start_date date,
  protection_end_date   date,
  protection_status     text NOT NULL DEFAULT 'active'
                        CHECK (protection_status IN ('active','expiring','expired','extended')),
  quality_score         integer NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  probability           numeric(4,3) CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1)),
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','won','lost','expired')),
  loss_reason           text,
  competitors           text,
  objections            text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_opps_rep ON sales_opportunities (representante_id);
CREATE INDEX IF NOT EXISTS idx_sales_opps_stage ON sales_opportunities (representante_id, stage);
CREATE INDEX IF NOT EXISTS idx_sales_opps_status ON sales_opportunities (representante_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_opps_protection ON sales_opportunities (protection_end_date)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_sales_opps_account ON sales_opportunities (account_id);

-- ── 5. Propostas / orçamentos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_proposals (
  id                               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id                 uuid NOT NULL REFERENCES sales_representatives(id),
  opportunity_id                   uuid REFERENCES sales_opportunities(id),
  account_id                       uuid REFERENCES sales_accounts(id),
  proposal_number                  text NOT NULL UNIQUE,   -- ex.: PROP-2026-0001
  customer_type                    text CHECK (customer_type IS NULL OR customer_type IN
                                     ('escola','empresa','rede_ensino','fundacao','outro')),
  number_of_users                  integer CHECK (number_of_users IS NULL OR number_of_users > 0),
  number_of_roles_mapped           integer CHECK (number_of_roles_mapped IS NULL OR number_of_roles_mapped >= 0),
  product_package                  text CHECK (product_package IS NULL OR product_package IN
                                     ('onboarding','completo','mentor_ia','pulso','custom')),
  contract_duration_months         integer CHECK (contract_duration_months IS NULL OR contract_duration_months IN (12,24,36)),
  discount_requested               numeric(5,2) CHECK (discount_requested IS NULL OR (discount_requested >= 0 AND discount_requested <= 100)),
  payment_terms                    text,
  included_scope                   text,
  commercial_notes                 text,
  monthly_value                    numeric(14,2) CHECK (monthly_value IS NULL OR monthly_value >= 0),
  total_contract_value             numeric(14,2) CHECK (total_contract_value IS NULL OR total_contract_value >= 0),
  estimated_acquisition_commission numeric(14,2),
  estimated_recurring_commission   numeric(14,2),
  estimated_total_commission       numeric(14,2),
  margin_alert                     boolean NOT NULL DEFAULT false,
  status                           text NOT NULL DEFAULT 'draft'
                                   CHECK (status IN ('draft','submitted_for_approval','approved',
                                     'changes_requested','rejected','sent_to_client','accepted','lost')),
  approved_by                      text,             -- e-mail do admin que aprovou
  approved_at                      timestamptz,
  rejection_reason                 text,
  created_at                       timestamptz NOT NULL DEFAULT now(),
  updated_at                       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_proposals_rep ON sales_proposals (representante_id);
CREATE INDEX IF NOT EXISTS idx_sales_proposals_status ON sales_proposals (status);
CREATE INDEX IF NOT EXISTS idx_sales_proposals_opp ON sales_proposals (opportunity_id);

-- ── 6. Eventos de comissão (hook MVP 2 — forecast/accrued/paid/chargeback) ──
CREATE TABLE IF NOT EXISTS sales_commission_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id      uuid NOT NULL REFERENCES sales_representatives(id),
  proposal_id           uuid REFERENCES sales_proposals(id),
  account_id            uuid REFERENCES sales_accounts(id),
  type                  text NOT NULL CHECK (type IN ('aquisicao','recorrente','renovacao','expansao','chargeback')),
  status                text NOT NULL DEFAULT 'potencial'
                        CHECK (status IN ('potencial','forecast','accrued','paid','cancelled')),
  base_value            numeric(14,2) CHECK (base_value IS NULL OR base_value >= 0),
  percent               numeric(5,2) CHECK (percent IS NULL OR percent >= 0),
  amount                numeric(14,2) NOT NULL DEFAULT 0,
  reference_month       date,                       -- competência (1º dia do mês)
  expected_payment_date date,
  paid_at               timestamptz,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_rep ON sales_commission_events (representante_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_proposal ON sales_commission_events (proposal_id);

-- ── 7. Materiais / playbook aprovados ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_materials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  category     text NOT NULL DEFAULT 'material'
               CHECK (category IN ('material','playbook','diagnostico','objecoes','politica','case')),
  segment      text,                                -- escola | empresa | rede_ensino | fundacao | geral
  description  text,
  file_url     text,
  external_url text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_materials_active ON sales_materials (is_active, category);

-- ── 8. Notas de atividade (timeline da oportunidade) ────────────────────────
CREATE TABLE IF NOT EXISTS sales_activity_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  representante_id uuid NOT NULL REFERENCES sales_representatives(id),
  opportunity_id   uuid REFERENCES sales_opportunities(id) ON DELETE CASCADE,
  account_id       uuid REFERENCES sales_accounts(id),
  note             text NOT NULL,
  created_by_email text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_notes_opp ON sales_activity_notes (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_sales_notes_rep ON sales_activity_notes (representante_id);

-- ── 9. Comentários internos do admin em propostas ───────────────────────────
CREATE TABLE IF NOT EXISTS sales_admin_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL REFERENCES sales_proposals(id) ON DELETE CASCADE,
  author_email text NOT NULL,
  comment      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_admin_comments_proposal ON sales_admin_comments (proposal_id);

-- ── Segurança: RLS on + sem policy + revoke = service_role-only ─────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sales_representatives','sales_accounts','sales_contacts','sales_opportunities',
    'sales_proposals','sales_commission_events','sales_materials',
    'sales_activity_notes','sales_admin_comments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ── Sequência do número de proposta (PROP-<ano>-<seq>) ──────────────────────
CREATE SEQUENCE IF NOT EXISTS sales_proposal_number_seq;

-- Função INVOKER simples (sem SECURITY DEFINER → fora do INV5); execução só
-- pelo service_role (server actions).
CREATE OR REPLACE FUNCTION sales_next_proposal_number() RETURNS text
LANGUAGE sql AS $$
  SELECT 'PROP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('sales_proposal_number_seq')::text, 4, '0');
$$;
REVOKE ALL ON FUNCTION sales_next_proposal_number() FROM anon, authenticated;
