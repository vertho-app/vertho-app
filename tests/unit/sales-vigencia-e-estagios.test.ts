/**
 * Decisão do dono (08/10/2026), vinda do material de onboarding dos RCs:
 *  - a vigência que o RC propõe é qualquer inteiro de 6 a 24 meses (era 12, 24 ou 36);
 *  - os estágios finais se chamam "Fechado" e "Perdido" (eram "Fechado ganho" e
 *    "Fechado perdido"). Só o RÓTULO mudou: a chave gravada segue `fechado_ganho`
 *    e `fechado_perdido`, que o banco, a comissão e os KPIs leem.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalForm from '@/components/sales/proposal-form';
import {
  CONTRACT_DURATIONS, CONTRACT_DURATION_MAX, CONTRACT_DURATION_MIN,
  PIPELINE_STAGES, STAGE_LABELS,
} from '@/lib/sales/constants';
import { validateProposalDraft, validateProposalForSubmission } from '@/lib/sales/validation';

describe('vigência de 6 a 24 meses', () => {
  it('a lista vai de 6 a 24, de 1 em 1', () => {
    expect(CONTRACT_DURATION_MIN).toBe(6);
    expect(CONTRACT_DURATION_MAX).toBe(24);
    expect(CONTRACT_DURATIONS).toHaveLength(19);
    expect(CONTRACT_DURATIONS[0]).toBe(6);
    expect(CONTRACT_DURATIONS[CONTRACT_DURATIONS.length - 1]).toBe(24);
  });

  it.each([6, 7, 11, 12, 13, 18, 23, 24])('aceita %i meses no rascunho', (m) => {
    const v = validateProposalDraft({ opportunity_id: 'ok', contract_duration_months: m });
    expect(v.errors.contract_duration_months).toBeUndefined();
  });

  it.each([5, 25, 36, 0, -12, 7.5])('recusa %s meses, com a faixa na mensagem', (m) => {
    const v = validateProposalDraft({ opportunity_id: 'ok', contract_duration_months: m });
    expect(v.valid).toBe(false);
    expect(v.errors.contract_duration_months).toBe('Vigência deve ser de 6 a 24 meses');
  });

  it('aceita o valor vindo como texto do formulário ("18")', () => {
    const v = validateProposalDraft({ opportunity_id: 'ok', contract_duration_months: '18' });
    expect(v.errors.contract_duration_months).toBeUndefined();
  });

  it('a submissão continua exigindo a vigência e recusa a de 36 de uma proposta antiga', () => {
    expect(validateProposalForSubmission({}).errors.contract_duration_months).toBe('Selecione a vigência');
    expect(
      validateProposalForSubmission({ contract_duration_months: 36 }).errors.contract_duration_months,
    ).toBe('Vigência deve ser de 6 a 24 meses');
  });

  it('o formulário oferece um seletor de 6 a 24 e não as pílulas de 12/24/36', () => {
    const html = renderToStaticMarkup(
      createElement(ProposalForm, { onSubmit: () => {}, submitting: false }),
    );
    const trecho = html.slice(html.indexOf('Vigência do contrato'), html.indexOf('Valor mensal (R$)'));
    expect(trecho).toContain('<option value="6">6 meses</option>');
    expect(trecho).toContain('<option value="24">24 meses</option>');
    expect(trecho).not.toContain('value="36"');
    expect(trecho).not.toContain('<button');
    expect(trecho).toContain('De 6 a 24 meses.');
  });

  it('proposta antiga com 36 meses aparece no seletor marcada como fora da faixa', () => {
    const html = renderToStaticMarkup(
      createElement(ProposalForm, {
        onSubmit: () => {}, submitting: false,
        initial: { contract_duration_months: 36 } as any,
      }),
    );
    expect(html).toContain('36 meses (fora da faixa)');
  });
});

describe('rótulos dos estágios finais', () => {
  it('"Fechado" e "Perdido", sem o "ganho" nem o "perdido" repetido', () => {
    expect(STAGE_LABELS.fechado_ganho).toBe('Fechado');
    expect(STAGE_LABELS.fechado_perdido).toBe('Perdido');
  });

  it('a chave gravada não mudou: só o rótulo', () => {
    expect(PIPELINE_STAGES).toContain('fechado_ganho');
    expect(PIPELINE_STAGES).toContain('fechado_perdido');
  });

  it('nenhum estágio tem rótulo repetido (o "Fechado" curto não colide com outro)', () => {
    const rotulos = PIPELINE_STAGES.map((s) => STAGE_LABELS[s]);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});
