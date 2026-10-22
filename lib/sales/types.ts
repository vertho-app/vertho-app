// Portal do Representante — tipos de domínio (espelham as tabelas sales_*).
import type { AttributionStatus, CompensationModel, PipelineStage, ProposalStatus } from './constants';

export type SalesRepresentative = {
  id: string;
  user_id: string | null;
  email: string;
  name: string;
  company_name: string | null;
  cnpj: string | null;
  core_registration: string | null;
  phone: string | null;
  region: string | null;
  status: 'active' | 'inactive' | 'suspended';
  /** Modelo de remuneração (mig 295). Decide as taxas de comissão: `commissionRatesFor`. */
  compensation_model: CompensationModel;
  /** Término do contrato de representação, gravado ao desativar o RC (mig 296, cláusula 18.7). */
  contract_ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesAccount = {
  id: string;
  representante_id: string;
  legal_name: string;
  trade_name: string | null;
  cnpj: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  number_of_employees: number | null;
  number_of_units: number | null;
  notes: string | null;
  status: 'prospect' | 'active_client' | 'inactive' | 'lost';
  contract_start_date: string | null;
  renewal_date: string | null;
  churn_risk: 'baixo' | 'medio' | 'alto' | null;
  expansion_potential: boolean;
  next_followup_date: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesContact = {
  id: string;
  account_id: string;
  representante_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type ProtectionStatus = 'active' | 'expiring' | 'expired' | 'extended';
export type OpportunityStatus = 'open' | 'won' | 'lost' | 'expired';

export type SalesOpportunity = {
  id: string;
  representante_id: string;
  account_id: string;
  primary_contact_id: string | null;
  opportunity_name: string;
  origin: string | null;
  product_interest: string | null;
  identified_need: string | null;
  stage: PipelineStage;
  estimated_value: number | null;
  estimated_close_date: string | null;
  next_action: string | null;
  next_action_date: string | null;
  interaction_evidence: string | null;
  protection_start_date: string | null;
  protection_end_date: string | null;
  protection_status: ProtectionStatus;
  /**
   * Validação do registro pela vertho.ai (mig 296; contrato, 7.1 e 7.5). Enquanto
   * 'aguardando' não há proteção (as datas ficam nulas) e a proposta não é submetida.
   */
  attribution_status: AttributionStatus;
  attribution_decided_at: string | null;
  attribution_decided_by: string | null;
  attribution_note: string | null;
  quality_score: number;
  probability: number | null;
  status: OpportunityStatus;
  loss_reason: string | null;
  competitors: string | null;
  objections: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais
  account?: Pick<SalesAccount, 'id' | 'legal_name' | 'trade_name' | 'segment' | 'city' | 'state'> | null;
  primary_contact?: Pick<SalesContact, 'id' | 'name' | 'role' | 'email' | 'phone'> | null;
};

export type SalesProposal = {
  id: string;
  /** NULL = proposta criada pela Vertho no deal desk, sem RC (mig 254). */
  representante_id: string | null;
  opportunity_id: string | null;
  account_id: string | null;
  proposal_number: string;
  /** Texto livre usado pelo documento quando não há conta no CRM (mig 254). */
  cliente_nome: string | null;
  customer_type: string | null;
  number_of_users: number | null;
  number_of_roles_mapped: number | null;
  product_package: string | null;
  /**
   * 6 a 24 meses no formulário do RC (`CONTRACT_DURATIONS`); qualquer valor 1..360
   * quando vem do deal desk, onde a vigência É o número de parcelas do projeto
   * (ciclos × 2 + 1). CHECK afrouxado na mig 254 — não restrinja de volta sem antes
   * olhar `actions/sales/proposals-admin.ts`.
   */
  contract_duration_months: number | null;
  discount_requested: number | null;
  payment_terms: string | null;
  included_scope: string | null;
  /**
   * Exemplo de cenário DESTA proposta (mig 277, jsonb). Texto que o cliente lê: nunca
   * use cru, sempre por `normalizarExemploGravado` / `cenarioDoExemplo`
   * (`lib/sales/cenario-exemplo.ts`). null = o documento usa o exemplo padrão do segmento.
   */
  cenario_exemplo?: unknown | null;
  commercial_notes: string | null;
  monthly_value: number | null;
  contract_value_gross: number | null;
  discount_amount: number | null;
  total_contract_value: number | null;
  estimated_acquisition_commission: number | null;
  estimated_recurring_commission: number | null;
  estimated_total_commission: number | null;
  margin_alert: boolean;
  /**
   * Regras de comissão gravadas na proposta (mig 296): o modelo do RC na
   * aprovação (10.5; antes dela, a estimativa com o modelo atual) e a
   * classificação de cliente da carteira (10.6, 50% dos percentuais). NULL no
   * deal desk, que não tem RC.
   */
  compensation_model: CompensationModel | null;
  carteira: boolean;
  carteira_motivo: string | null;
  /** Quando o RC marcou como enviada ao cliente (marco da cláusula 18.7). */
  sent_to_client_at: string | null;
  status: ProposalStatus;
  /**
   * Admin que criou (mig 254, só no caminho do deal desk). Preenchido junto com
   * `approved_by`, torna visível na linha que nesse caminho quem cria é quem
   * aprova — o controle de quatro olhos do fluxo do RC não se aplica.
   */
  created_by_email: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  version: number;
  supersedes_id: string | null;
  public_token: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
  account?: Pick<SalesAccount, 'id' | 'legal_name' | 'trade_name'> | null;
  opportunity?: (Pick<SalesOpportunity, 'id' | 'opportunity_name' | 'stage'> & Partial<Pick<SalesOpportunity, 'attribution_status'>>) | null;
  representante?: Pick<SalesRepresentative, 'id' | 'name' | 'status' | 'compensation_model' | 'contract_ended_at'> | null;
};

export type CommissionType = 'aquisicao' | 'recorrente' | 'renovacao' | 'expansao' | 'chargeback';
export type CommissionStatus = 'potencial' | 'forecast' | 'accrued' | 'paid' | 'cancelled';

export type SalesCommissionEvent = {
  id: string;
  representante_id: string;
  proposal_id: string | null;
  account_id: string | null;
  type: CommissionType;
  status: CommissionStatus;
  base_value: number | null;
  percent: number | null;
  amount: number;
  reference_month: string | null;
  expected_payment_date: string | null;
  paid_at: string | null;
  invoice_number: string | null;
  invoice_issued_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joins opcionais
  account?: Pick<SalesAccount, 'id' | 'legal_name' | 'trade_name'> | null;
  proposal?: Pick<SalesProposal, 'id' | 'proposal_number'> | null;
  representante?: Pick<SalesRepresentative, 'id' | 'name'> | null;
};

export type SalesMaterial = {
  id: string;
  title: string;
  category: 'material' | 'playbook' | 'diagnostico' | 'objecoes' | 'politica' | 'case';
  segment: string | null;
  description: string | null;
  content: string | null;
  file_url: string | null;
  storage_path: string | null;
  external_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ActivityNoteKind = 'nota' | 'followup' | 'renovacao' | 'risco' | 'expansao';

export type SalesActivityNote = {
  id: string;
  representante_id: string;
  opportunity_id: string | null;
  account_id: string | null;
  note: string;
  kind: ActivityNoteKind;
  created_by_email: string;
  created_at: string;
};

export type SalesAdminComment = {
  id: string;
  proposal_id: string;
  author_email: string;
  comment: string;
  created_at: string;
};
