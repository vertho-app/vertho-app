import { describe, it, expect } from 'vitest';
import { classificarLeadConarh, type EntradaClassificacao } from '@/lib/conarh/classificacao';

/**
 * CONARH 52 — régua A/B/C (F4). A classe decide quem acorda o fechador em < 30 s
 * e quem entra na cadência ativa, então cada predicado da definição da Proposta
 * Resumida tem um caso aqui — inclusive os dois que a primeira implementação
 * deixou de fora (ICP e dor clara).
 */

const base: EntradaClassificacao = {
  decide_ou_recomenda: true,
  aceitou_proximo_passo: true,
  fora_do_perfil: false,
  competencia: 'dar feedback sem virar bronca',
  horizonte: 'rodando',
};

describe('classificarLeadConarh', () => {
  it('A exige os predicados juntos', () => {
    expect(classificarLeadConarh(base)).toBe('A');
    expect(classificarLeadConarh({ ...base, horizonte: 'ate_3m' })).toBe('A');
  });

  it('A continua alcançável sem `decide_ou_recomenda`', () => {
    // O formulário da feira foi enxugado para um único toggle de qualificação
    // (04/08/2026). Se `decide` seguisse no predicado, nenhum lead conduzido
    // seria A — o alerta de < 30 s morreria em silêncio.
    expect(classificarLeadConarh({ ...base, decide_ou_recomenda: false })).toBe('A');
    expect(classificarLeadConarh({ ...base, decide_ou_recomenda: undefined })).toBe('A');
  });

  it('cai para B quando falta um predicado de A', () => {
    // horizonte frio
    expect(classificarLeadConarh({ ...base, horizonte: '3_a_6m' })).toBe('B');
    expect(classificarLeadConarh({ ...base, horizonte: 'sem_data' })).toBe('B');
    expect(classificarLeadConarh({ ...base, horizonte: null })).toBe('B');
    // não aceitou próximo passo
    expect(classificarLeadConarh({ ...base, aceitou_proximo_passo: false })).toBe('B');
  });

  it('sem dor clara não é A, mesmo com horizonte quente', () => {
    // Regressão: a versão anterior não olhava a competência e disparava o
    // alerta de lead A para quem não tinha citado dor nenhuma.
    expect(classificarLeadConarh({ ...base, competencia: null })).toBe('B');
    expect(classificarLeadConarh({ ...base, competencia: '   ' })).toBe('B');
  });

  it('fora do perfil é C e vence todos os outros predicados', () => {
    // Regressão: sem esta marcação a classe C era inalcançável pelo tablet
    // (a competência é campo obrigatório no formulário conduzido), e todo
    // fornecedor entrava como B na cadência ativa.
    expect(classificarLeadConarh({ ...base, fora_do_perfil: true })).toBe('C');
    expect(
      classificarLeadConarh({ ...base, fora_do_perfil: true, decide_ou_recomenda: false, competencia: null }),
    ).toBe('C');
  });

  it('auto-captura sem qualificação nenhuma é C', () => {
    // Modo opt-in no celular do visitante: não passa pelos toggles do expositor.
    expect(
      classificarLeadConarh({ competencia: null, horizonte: null }),
    ).toBe('C');
  });

  it('dor clara sem poder de decisão é B, não C', () => {
    expect(classificarLeadConarh({ ...base, decide_ou_recomenda: false, aceitou_proximo_passo: false })).toBe('B');
  });

  it('dor clara com horizonte frio é B, não C', () => {
    expect(
      classificarLeadConarh({ ...base, decide_ou_recomenda: undefined, horizonte: 'sem_data' }),
    ).toBe('B');
  });
});
