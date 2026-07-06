// Simulador de preço da proposta.
//
// ⚠️ TABELA PLACEHOLDER — ajuste os números com os valores reais da Vertho.
// É só trocar as constantes deste arquivo; a mecânica não muda.
//
// Modelo: mensalidade sugerida = taxa de plataforma do pacote
//   + (preço por usuário × nº de usuários)
//   + (preço por cargo mapeado × nº de cargos).
// 'Custom' não tem fórmula (preço manual). O desconto solicitado é aplicado
// depois, no resumo financeiro, para chegar ao VALOR FINAL do contrato.

export const PRICING = {
  // R$ por usuário / mês, por pacote
  perUserMonth: { onboarding: 25, mentor_ia: 45, piloto: 35 } as Record<string, number>,
  // taxa de plataforma R$ / mês (piso), por pacote
  platformMonth: { onboarding: 400, mentor_ia: 600, piloto: 500 } as Record<string, number>,
  // R$ por cargo mapeado / mês
  perRoleMonth: 40,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PricingInput = {
  product_package?: string | null;
  number_of_users?: number | null;
  number_of_roles_mapped?: number | null;
};

/**
 * Mensalidade sugerida pela tabela de preço. `null` quando não há fórmula
 * (pacote 'custom' ou não informado) — o RC digita o valor manualmente.
 */
export function simularMensalidade(input: PricingInput): number | null {
  const pkg = input.product_package;
  if (!pkg || pkg === 'custom') return null;
  const platform = PRICING.platformMonth[pkg];
  const perUser = PRICING.perUserMonth[pkg];
  if (platform == null && perUser == null) return null; // pacote sem tabela
  const users = Math.max(0, Number(input.number_of_users) || 0);
  const roles = Math.max(0, Number(input.number_of_roles_mapped) || 0);
  const mensal = (platform || 0) + (perUser || 0) * users + PRICING.perRoleMonth * roles;
  return round2(mensal);
}
