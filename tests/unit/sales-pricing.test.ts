import { describe, expect, it } from 'vitest';
import { simularMensalidade } from '@/lib/sales/pricing';

describe('sugestão de preço da proposta', () => {
  it('usa a mesma régua do cenário-base do deal desk', () => {
    const mensal = simularMensalidade({
      product_package: 'mentor_ia',
      number_of_users: 100,
      number_of_roles_mapped: 3,
      contract_duration_months: 12,
    });

    expect(mensal).toBeCloseTo(125_500 / 12, 2);
  });

  it('o prazo só divide o projeto, sem alterar o valor total', () => {
    const base = {
      product_package: 'mentor_ia',
      number_of_users: 100,
      number_of_roles_mapped: 3,
    };
    const em12 = simularMensalidade({ ...base, contract_duration_months: 12 });
    const em24 = simularMensalidade({ ...base, contract_duration_months: 24 });

    // A parcela é arredondada em centavos; a diferença máxima acumulada é de
    // um centavo por parcela, não uma mudança de preço por vigência.
    expect(Math.abs((em12 || 0) * 12 - (em24 || 0) * 24)).toBeLessThanOrEqual(0.24);
  });

  it('mantém preço manual para pacote custom ou desconhecido', () => {
    expect(simularMensalidade({ product_package: 'custom' })).toBeNull();
    expect(simularMensalidade({ product_package: 'fora-da-tabela' })).toBeNull();
  });
});
