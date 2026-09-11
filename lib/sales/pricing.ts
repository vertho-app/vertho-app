// Simulador de preço da proposta. A régua é a mesma do deal desk: projeto
// fechado por escopo; a vigência apenas divide o valor em parcelas.
import { ORCAMENTO_DEFAULTS, calcularProjeto } from '@/lib/orcamento/precificacao';

const round2 = (n: number) => Math.round(n * 100) / 100;

export type PricingInput = {
  product_package?: string | null;
  number_of_users?: number | null;
  number_of_roles_mapped?: number | null;
  contract_duration_months?: number | null;
};

/**
 * Mensalidade sugerida pela tabela de preço. `null` quando não há fórmula
 * (pacote 'custom' ou não informado) — o RC digita o valor manualmente.
 */
export function simularMensalidade(input: PricingInput): number | null {
  const pkg = input.product_package;
  if (!pkg || pkg === 'custom' || !['onboarding', 'mentor_ia', 'piloto'].includes(pkg)) return null;
  const users = Math.max(0, Number(input.number_of_users) || 0);
  const roles = Math.max(0, Number(input.number_of_roles_mapped) || 0);
  const parcelas = Math.max(1, Number(input.contract_duration_months) || 12);
  const d = ORCAMENTO_DEFAULTS;
  const projeto = calcularProjeto(
    {
      pessoas: users,
      ciclos: 1,
      unidades: 1,
      matrizesNovas: roles,
      matrizesAdaptadas: 0,
      workshop: false,
      parcelas,
    },
    {
      setupGeral: d.precoSetupGeral,
      pessoaCiclo: d.precoPessoaCiclo,
      unidade: d.precoCluster,
      matrizNova: d.precoMatrizNova,
      matrizAdaptada: d.precoMatrizAdaptada,
      workshop: d.adicionalWorkshop,
      descontoPct: 0,
      margemAlvoPct: d.margemAlvoPct,
    },
    { totalBrl: 0, oneTimeBrl: 0, mesesPrograma: 1 },
  );
  return round2(projeto.parcela);
}
