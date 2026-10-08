/**
 * Decisão do dono (08/10/2026), vinda da revisão do material de onboarding dos RCs:
 *  - os pacotes se chamam "Jornada de Onboarding" e "Jornada Personalizada" (eram
 *    "Onboarding" e "Custom"), como em todo material da Vertho;
 *  - "Piloto" sai do dropdown. A chave gravada de cada pacote NÃO muda: o que o RC e o
 *    cliente leem é só o rótulo, e dado antigo com `piloto` segue renderizando.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalForm from '@/components/sales/proposal-form';
import OpportunityForm from '@/components/sales/opportunity-form';
import { PRODUCT_PACKAGES, PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { validateProposalForSubmission } from '@/lib/sales/validation';
import { simularMensalidade } from '@/lib/sales/pricing';

describe('pacotes oferecidos', () => {
  it('o dropdown oferece Onboarding, Mentor IA e Personalizada, sem Piloto', () => {
    expect([...PRODUCT_PACKAGES]).toEqual(['onboarding', 'mentor_ia', 'custom']);
  });

  it('rótulos novos, e o legado segue com rótulo para renderizar dado antigo', () => {
    expect(PRODUCT_PACKAGE_LABELS.onboarding).toBe('Jornada de Onboarding');
    expect(PRODUCT_PACKAGE_LABELS.custom).toBe('Jornada Personalizada');
    expect(PRODUCT_PACKAGE_LABELS.mentor_ia).toBe('Mentor IA');
    expect(PRODUCT_PACKAGE_LABELS.piloto).toBe('Piloto');
    expect(PRODUCT_PACKAGE_LABELS.completo).toBe('Completo');
    expect(PRODUCT_PACKAGE_LABELS.pulso).toBe('Pulso');
  });

  it('proposta antiga com pacote piloto continua válida na submissão', () => {
    const v = validateProposalForSubmission({ product_package: 'piloto' });
    expect(v.errors.product_package).toBeUndefined();
  });

  it('a chave custom segue sem valor sugerido (manual) e a onboarding calcula', () => {
    const base = { number_of_users: 60, number_of_roles_mapped: 2, contract_duration_months: 12 };
    expect(simularMensalidade({ ...base, product_package: 'custom' } as any)).toBeNull();
    expect(simularMensalidade({ ...base, product_package: 'onboarding' } as any)).not.toBeNull();
  });
});

describe('formulários do portal', () => {
  const proposta = (initial?: Record<string, any>) =>
    renderToStaticMarkup(createElement(ProposalForm, { onSubmit: () => {}, submitting: false, initial: initial as any }));

  it('a proposta oferece os dois nomes novos e não oferece Piloto', () => {
    const html = proposta();
    const trecho = html.slice(html.indexOf('>Pacote<'), html.indexOf('Escopo incluído'));
    expect(trecho).toContain('Jornada de Onboarding');
    expect(trecho).toContain('Jornada Personalizada');
    expect(trecho).toContain('Mentor IA');
    expect(trecho).not.toContain('Piloto');
    expect(trecho).not.toContain('>Custom<');
  });

  it('a dica do valor mensal fala em Jornada Personalizada, não em Custom', () => {
    const html = proposta();
    expect(html).toContain('na Jornada Personalizada o valor é manual');
    expect(html).not.toContain('Custom é manual');
  });

  it('proposta antiga com piloto mostra o pacote gravado, marcado como fora de oferta', () => {
    const html = proposta({ product_package: 'piloto' });
    expect(html).toContain('Piloto (fora de oferta)');
  });

  it('a oportunidade oferece os nomes novos, sem Piloto, e mostra o legado gravado', () => {
    const novo = renderToStaticMarkup(createElement(OpportunityForm as any, { onSubmit: () => {}, submitting: false }));
    const trecho = novo.slice(novo.indexOf('Produto de interesse'));
    expect(trecho.slice(0, 700)).toContain('Jornada de Onboarding');
    expect(trecho.slice(0, 700)).not.toContain('Piloto');
    const antigo = renderToStaticMarkup(
      createElement(OpportunityForm as any, { onSubmit: () => {}, submitting: false, initial: { product_interest: 'piloto' } }),
    );
    expect(antigo).toContain('Piloto (fora de oferta)');
  });
});
