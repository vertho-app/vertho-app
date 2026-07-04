// Portal do Representante — tipos de domínio (espelham as tabelas sales_*).
import type { PipelineStage, ProposalStatus } from './constants';

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
  representante_id: string;
  opportunity_id: string | null;
  account_id: string | null;
  proposal_number: string;
  customer_type: string | null;
  number_of_users: number | null;
  number_of_roles_mapped: number | null;
  product_package: string | null;
  contract_duration_months: 12 | 24 | 36 | null;
  discount_requested: number | null;
  payment_terms: string | null;
  included_scope: string | null;
  commercial_notes: string | null;
  monthly_value: number | null;
  total_contract_value: number | null;
  estimated_acquisition_commission: number | null;
  estimated_recurring_commission: number | null;
  estimated_total_commission: number | null;
  margin_alert: boolean;
  status: ProposalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  account?: Pick<SalesAccount, 'id' | 'legal_name' | 'trade_name'> | null;
  opportunity?: Pick<SalesOpportunity, 'id' | 'opportunity_name' | 'stage'> | null;
};

export type SalesCommissionEvent = {
  id: string;
  representante_id: string;
  proposal_id: string | null;
  account_id: string | null;
  type: 'aquisicao' | 'recorrente' | 'renovacao' | 'expansao' | 'chargeback';
  status: 'potencial' | 'forecast' | 'accrued' | 'paid' | 'cancelled';
  base_value: number | null;
  percent: number | null;
  amount: number;
  reference_month: string | null;
  expected_payment_date: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesMaterial = {
  id: string;
  title: string;
  category: 'material' | 'playbook' | 'diagnostico' | 'objecoes' | 'politica' | 'case';
  segment: string | null;
  description: string | null;
  file_url: string | null;
  external_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SalesActivityNote = {
  id: string;
  representante_id: string;
  opportunity_id: string | null;
  account_id: string | null;
  note: string;
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
