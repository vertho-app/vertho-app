// Validação de domínio do portal — usada no CLIENT (feedback imediato) e
// SEMPRE re-executada no SERVER (fonte de verdade).
import { CONTRACT_DURATIONS, CUSTOMER_TYPES, PIPELINE_STAGES, PRODUCT_PACKAGES } from './constants';

export type ValidationResult = { valid: boolean; errors: Record<string, string> };

const req = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : v != null);
const nonNegative = (v: unknown) => v == null || (typeof v === 'number' && isFinite(v) && v >= 0);

/** Registro formal de oportunidade — campos obrigatórios para VALIDAR (proteção). */
export function validateOpportunityInput(input: Record<string, any>): ValidationResult {
  const errors: Record<string, string> = {};
  if (!req(input.opportunity_name)) errors.opportunity_name = 'Nome da oportunidade é obrigatório';
  if (!req(input.account_id)) errors.account_id = 'Selecione a conta';
  if (!req(input.primary_contact_id)) errors.primary_contact_id = 'Selecione o contato principal';
  if (!req(input.origin)) errors.origin = 'Informe a origem';
  if (!req(input.product_interest)) errors.product_interest = 'Informe o produto de interesse';
  if (!req(input.identified_need)) errors.identified_need = 'Descreva a necessidade identificada';
  if (!req(input.stage)) errors.stage = 'Selecione o estágio';
  else if (!PIPELINE_STAGES.includes(input.stage)) errors.stage = 'Estágio inválido';
  if (input.estimated_value == null || Number(input.estimated_value) <= 0) errors.estimated_value = 'Informe o valor estimado (> 0)';
  if (!req(input.estimated_close_date)) errors.estimated_close_date = 'Informe a previsão de fechamento';
  if (!req(input.next_action)) errors.next_action = 'Defina a próxima ação comercial';
  if (!req(input.next_action_date)) errors.next_action_date = 'Informe a data da próxima ação';
  if (!req(input.interaction_evidence)) errors.interaction_evidence = 'Registre a evidência de interação';
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Rascunho de proposta: exige o mínimo pra existir; o resto valida na submissão. */
export function validateProposalDraft(input: Record<string, any>): ValidationResult {
  const errors: Record<string, string> = {};
  if (!req(input.opportunity_id)) errors.opportunity_id = 'Vincule a proposta a uma oportunidade';
  if (!nonNegative(numOrNull(input.monthly_value))) errors.monthly_value = 'Valor mensal não pode ser negativo';
  if (input.contract_duration_months != null && !CONTRACT_DURATIONS.includes(Number(input.contract_duration_months) as any)) {
    errors.contract_duration_months = 'Vigência deve ser 12, 24 ou 36 meses';
  }
  if (input.discount_requested != null && (Number(input.discount_requested) < 0 || Number(input.discount_requested) > 100)) {
    errors.discount_requested = 'Desconto deve estar entre 0 e 100%';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/** Submissão para aprovação Vertho — proposta completa. */
export function validateProposalForSubmission(input: Record<string, any>): ValidationResult {
  const base = validateProposalDraft(input);
  const errors = { ...base.errors };
  if (!req(input.customer_type)) errors.customer_type = 'Informe o tipo de cliente';
  else if (!CUSTOMER_TYPES.includes(input.customer_type)) errors.customer_type = 'Tipo de cliente inválido';
  if (input.number_of_users == null || Number(input.number_of_users) <= 0) errors.number_of_users = 'Informe o número de usuários (> 0)';
  if (!req(input.product_package)) errors.product_package = 'Selecione o pacote';
  else if (!PRODUCT_PACKAGES.includes(input.product_package)) errors.product_package = 'Pacote inválido';
  if (input.contract_duration_months == null) errors.contract_duration_months = 'Selecione a vigência';
  if (!req(input.payment_terms)) errors.payment_terms = 'Informe as condições de pagamento';
  if (!req(input.included_scope)) errors.included_scope = 'Descreva o escopo incluído';
  if (input.monthly_value == null || Number(input.monthly_value) <= 0) errors.monthly_value = 'Informe o valor mensal (> 0)';
  if (input.total_contract_value == null || Number(input.total_contract_value) <= 0) errors.total_contract_value = 'Valor total do contrato inválido';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
