import { describe, expect, it } from 'vitest';
import {
  agregarRepresentatividade, emAlertaDeRepresentatividade, notaDaLinha,
  LIMIAR_REPRESENTATIVIDADE, MIN_PESSOAS_REPRESENTATIVIDADE,
} from '@/lib/assessment/representatividade';
import { checarRepresentatividade } from '@/lib/pipeline-health/regras';

/**
 * Plano de cenários de 11/10/2026, Fase 1: a nota de representatividade (1 a 10) que a
 * pessoa dá a cada cenário era gravada e nada a lia. Medido em 09/10: Amazon 4,7 de média,
 * com a queixa ("situações fictícias") chegando três dias depois numa reunião.
 */

const linha = (cenario: string, pessoa: string, cargo: string, nota: any, email = `${pessoa}@cliente.com`) =>
  ({ cenario_id: cenario, colaborador_id: pessoa, cargo, representatividade: nota, email_colaborador: email });

describe('agregarRepresentatividade', () => {
  it('conta PESSOAS distintas, não respostas: uma pessoa com 6 cenários é uma opinião', () => {
    const linhas = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((c) => linha(c, 'edinaldo', 'Infra', 5));
    const r = agregarRepresentatividade(linhas);
    expect(r.empresa).toMatchObject({ respostas: 6, pessoas: 1, media: 5, ate5: 6 });
    expect(r.porCargo.Infra).toMatchObject({ respostas: 6, pessoas: 1 });
    expect(r.porCenario.c1).toMatchObject({ respostas: 1, pessoas: 1, media: 5 });
  });

  it('média com 1 casa decimal, por cenário, por cargo e da empresa', () => {
    const r = agregarRepresentatividade([
      linha('c1', 'a', 'Eletrônica', 9), linha('c2', 'a', 'Eletrônica', 3), linha('c3', 'a', 'Eletrônica', 2),
      linha('c1', 'b', 'Caixa', 8),
    ]);
    expect(r.porCargo['Eletrônica'].media).toBe(4.7);
    expect(r.porCenario.c1).toMatchObject({ media: 8.5, respostas: 2, pessoas: 2 });
    expect(r.empresa).toMatchObject({ media: 5.5, pessoas: 2, ate5: 2 });
  });

  it('contas da vertho.ai ficam de fora (são a equipe testando)', () => {
    const r = agregarRepresentatividade([linha('c1', 'cli', 'X', 4), linha('c1', 'eq', 'X', 10, 'rodrigo@vertho.ai')]);
    expect(r.empresa).toMatchObject({ media: 4, respostas: 1, pessoas: 1 });
  });

  it('nota fora de 1 a 10, vazia ou texto inválido é ignorada; texto numérico vale (a coluna chega como texto)', () => {
    expect(notaDaLinha({ representatividade: '7' })).toBe(7);
    expect(notaDaLinha({ representatividade: 0 })).toBeNull();
    expect(notaDaLinha({ representatividade: 11 })).toBeNull();
    expect(notaDaLinha({ representatividade: null })).toBeNull();
    expect(notaDaLinha({ representatividade: 'x' })).toBeNull();
    const r = agregarRepresentatividade([linha('c1', 'a', 'X', '6'), linha('c2', 'b', 'X', null), linha('c3', 'c', 'X', 99)]);
    expect(r.empresa).toMatchObject({ media: 6, respostas: 1, pessoas: 1 });
  });

  it('sem nota válida: média null (não zero)', () => {
    expect(agregarRepresentatividade([]).empresa).toEqual({ media: null, respostas: 0, pessoas: 0, ate5: 0 });
  });
});

describe('emAlertaDeRepresentatividade', () => {
  const r = (media: number | null, pessoas: number) => ({ media, pessoas, respostas: pessoas * 6, ate5: 0 });

  it(`alerta com ${MIN_PESSOAS_REPRESENTATIVIDADE}+ pessoas e média abaixo de ${LIMIAR_REPRESENTATIVIDADE}`, () => {
    expect(emAlertaDeRepresentatividade(r(4.7, 8))).toBe(true);
    expect(emAlertaDeRepresentatividade(r(5.9, MIN_PESSOAS_REPRESENTATIVIDADE))).toBe(true);
  });

  it('a fronteira é estrita: média igual à linha NÃO alerta', () => {
    expect(emAlertaDeRepresentatividade(r(LIMIAR_REPRESENTATIVIDADE, 8))).toBe(false);
  });

  it('poucas pessoas não alertam (uma opinião não é sinal), nem média ausente', () => {
    expect(emAlertaDeRepresentatividade(r(2, MIN_PESSOAS_REPRESENTATIVIDADE - 1))).toBe(false);
    expect(emAlertaDeRepresentatividade(r(null, 8))).toBe(false);
    expect(emAlertaDeRepresentatividade(null)).toBe(false);
  });
});

describe('R22 · checarRepresentatividade', () => {
  const sinal = (empresa: any, porCargo: any = {}) => ({ empresa, porCargo, dias: 30 });

  it('Amazon de 09/10 (4,7 em 39 respostas de 8 pessoas): achado, com os cargos abaixo da linha do pior para o melhor', () => {
    const a = checarRepresentatividade(sinal(
      { media: 4.7, respostas: 39, pessoas: 8, ate5: 29 },
      {
        'Supervisão de Loja': { media: 4.5, respostas: 14, pessoas: 4, ate5: 10 },
        'Eletrônica': { media: 3.3, respostas: 6, pessoas: 1, ate5: 5 },
        'Coordenador de Eventos': { media: 8, respostas: 1, pessoas: 1, ate5: 0 },
      },
    ));
    expect(a).not.toBeNull();
    expect(a!.id).toBe('cenarios-baixa-representatividade');
    expect(a!.contagem).toBe(8);
    expect(a!.detalhe).toContain('4,7');
    expect(a!.amostra).toEqual(['Eletrônica · média 3,3 · 6 resp. · 1p', 'Supervisão de Loja · média 4,5 · 14 resp. · 4p']);
  });

  it('Ibipeba de 09/10 (6,9): nenhum achado', () => {
    expect(checarRepresentatividade(sinal({ media: 6.9, respostas: 90, pessoas: 30, ate5: 26 }))).toBeNull();
  });

  it('média baixa com menos pessoas que o mínimo: nenhum achado', () => {
    expect(checarRepresentatividade(sinal({ media: 2, respostas: 12, pessoas: 2, ate5: 12 }))).toBeNull();
  });
});
