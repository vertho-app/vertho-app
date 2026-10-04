import { describe, it, expect } from 'vitest';
import { calcularParticipacao, cargaHorariaDoCertificado, isTrilhaPiloto, PARTICIPACAO_MINIMA } from '@/lib/season-engine/participacao';
import { getProgramaConfigByModo } from '@/lib/season-engine/programa-config';

/**
 * Critério do Certificado de Conclusão: ≥75% das semanas DO PLANO com entrega
 * real (conteúdo→reflexao; aplicação/avaliação→feedback). Piloto nunca emite.
 */

const plano = (n: number) => Array.from({ length: n }, (_, i) => ({ semana: i + 1 }));
const conteudo = (semana: number, comReflexao = true) => ({
  semana, tipo: 'conteudo', reflexao: comReflexao ? { insight_principal: 'x' } : null, feedback: null,
});
const missao = (semana: number, comFeedback = true) => ({
  semana, tipo: 'aplicacao', reflexao: null, feedback: comFeedback ? { sintese_bloco: 'x' } : null,
});

describe('calcularParticipacao', () => {
  it('11 de 14 semanas (78,6%) → elegível', () => {
    const progressos = Array.from({ length: 11 }, (_, i) => conteudo(i + 1));
    const r = calcularParticipacao(plano(14), progressos);
    expect(r.semanasComEntrega).toBe(11);
    expect(r.totalSemanas).toBe(14);
    expect(r.elegivel).toBe(true);
  });

  it('10 de 14 semanas (71,4%) → NÃO elegível', () => {
    const progressos = Array.from({ length: 10 }, (_, i) => conteudo(i + 1));
    expect(calcularParticipacao(plano(14), progressos).elegivel).toBe(false);
  });

  it('exatamente 75% (9 de 12) → elegível (fronteira inclusiva)', () => {
    const progressos = Array.from({ length: 9 }, (_, i) => conteudo(i + 1));
    const r = calcularParticipacao(plano(12), progressos);
    expect(r.pct).toBe(PARTICIPACAO_MINIMA);
    expect(r.elegivel).toBe(true);
  });

  it('semana de conteúdo sem reflexão NÃO conta', () => {
    const progressos = [...Array.from({ length: 13 }, (_, i) => conteudo(i + 1)), conteudo(14, false)];
    expect(calcularParticipacao(plano(14), progressos).semanasComEntrega).toBe(13);
  });

  it('missão/avaliação conta pelo FEEDBACK; reflexao vazia não salva', () => {
    const progressos = [
      ...Array.from({ length: 10 }, (_, i) => conteudo(i + 1)),
      missao(11, true),
      { semana: 12, tipo: 'avaliacao', reflexao: {}, feedback: null },
    ];
    const r = calcularParticipacao(plano(14), progressos);
    expect(r.semanasComEntrega).toBe(11);
  });

  it('plano vazio → 0%, inelegível, sem divisão por zero', () => {
    const r = calcularParticipacao([], [conteudo(1)]);
    expect(r).toEqual({ semanasComEntrega: 0, totalSemanas: 0, pct: 0, elegivel: false });
  });

  it('progressos fora do plano (semana inexistente) são ignorados', () => {
    const progressos = [...Array.from({ length: 11 }, (_, i) => conteudo(i + 1)), conteudo(99)];
    const r = calcularParticipacao(plano(14), progressos);
    expect(r.semanasComEntrega).toBe(11);
  });

  it('entradas nulas/indefinidas não quebram', () => {
    expect(calcularParticipacao(null, null).elegivel).toBe(false);
    expect(calcularParticipacao(plano(14) as any, undefined).semanasComEntrega).toBe(0);
  });
});

/**
 * Onboarding de 12 semanas (04/10/2026): a semana 1 é o MAPEAMENTO, que a pessoa
 * fez antes de a trilha existir. A linha de progresso dela grava `mapeamento`
 * (desde a mig 275; antes, `avaliacao`, porque a CHECK da coluna não aceitava),
 * sem reflexão nem feedback; quem decide o tipo é o PLANO. Sem contá-la como
 * entregue, quem concluiu tudo leria "11 de 12".
 */
describe('calcularParticipacao: a semana de mapeamento do Onboarding', () => {
  const planoOnboarding = Array.from({ length: 12 }, (_, i) => ({
    semana: i + 1,
    tipo: i === 0 ? 'mapeamento' : i === 11 ? 'avaliacao' : 'conteudo',
  }));
  const linhaDoMapeamento = { semana: 1, tipo: 'mapeamento', reflexao: null, feedback: null };
  // A que nasceu antes da mig 275 (04/10/2026): mesmo plano, a linha dizia `avaliacao`.
  const linhaLegadaDoMapeamento = { ...linhaDoMapeamento, tipo: 'avaliacao' };
  const fechamento = { semana: 12, tipo: 'avaliacao', reflexao: null, feedback: { nota: 'x' } };

  it('quem concluiu o programa inteiro tem 12 de 12 (o mapeamento conta como entregue)', () => {
    const progressos = [
      linhaDoMapeamento,
      ...Array.from({ length: 10 }, (_, i) => conteudo(i + 2)),
      fechamento,
    ];
    const r = calcularParticipacao(planoOnboarding, progressos);
    expect(r.semanasComEntrega).toBe(12);
    expect(r.totalSemanas).toBe(12);
    expect(r.pct).toBe(1);
  });

  it('a linha gravada antes da mig 275 (`avaliacao`) conta do mesmo jeito: quem decide é o plano', () => {
    const progressos = [
      linhaLegadaDoMapeamento,
      ...Array.from({ length: 10 }, (_, i) => conteudo(i + 2)),
      fechamento,
    ];
    expect(calcularParticipacao(planoOnboarding, progressos)).toMatchObject({ semanasComEntrega: 12, totalSemanas: 12, pct: 1 });
  });

  it('conta mesmo sem a linha de progresso dela: o mapeamento é do plano', () => {
    const r = calcularParticipacao(planoOnboarding, [conteudo(2)]);
    expect(r.semanasComEntrega).toBe(2);
  });

  it('o mapeamento ajuda, mas não emite sozinho: 8 de 12 (66,7%) continua inelegível', () => {
    const progressos = [...Array.from({ length: 7 }, (_, i) => conteudo(i + 2))];
    const r = calcularParticipacao(planoOnboarding, progressos);
    expect(r.semanasComEntrega).toBe(8);
    expect(r.elegivel).toBe(false);
  });

  it('com 8 semanas de conteúdo feitas, 9 de 12 (75%) fecha a fronteira', () => {
    const progressos = [...Array.from({ length: 8 }, (_, i) => conteudo(i + 2))];
    const r = calcularParticipacao(planoOnboarding, progressos);
    expect(r.semanasComEntrega).toBe(9);
    expect(r.elegivel).toBe(true);
  });

  it('só o tipo do PLANO vale: a mesma linha, `mapeamento` ou `avaliacao`, numa semana de conteúdo não conta', () => {
    const planoSemMapeamento = planoOnboarding.map((s) => ({ ...s, tipo: s.semana === 12 ? 'avaliacao' : 'conteudo' }));
    expect(calcularParticipacao(planoSemMapeamento, [linhaDoMapeamento]).semanasComEntrega).toBe(0);
    expect(calcularParticipacao(planoSemMapeamento, [linhaLegadaDoMapeamento]).semanasComEntrega).toBe(0);
  });
});

describe('isTrilhaPiloto', () => {
  it('piloto pelo carimbo programa_modo', () => {
    expect(isTrilhaPiloto({ programa_modo: 'piloto' })).toBe(true);
  });

  it('piloto pelo evolution_report.modo', () => {
    expect(isTrilhaPiloto({ programa_modo: 'regular_duo', evolution_report: { modo: 'piloto' } })).toBe(true);
  });

  it('regular/onboarding/custom emitem certificado', () => {
    expect(isTrilhaPiloto({ programa_modo: 'regular_duo', evolution_report: {} })).toBe(false);
    expect(isTrilhaPiloto({ programa_modo: 'onboarding' })).toBe(false);
    expect(isTrilhaPiloto({ programa_modo: 'custom' })).toBe(false);
    expect(isTrilhaPiloto({})).toBe(false);
  });
});

/**
 * Carga horária do certificado (decisão do dono, 23/09/2026): 48h a cada 14
 * semanas DO PROGRAMA. A duração vem da config (carimbo), não do plano: o plano
 * do regular_duo tem 9 entradas para 14 semanas, e contá-lo daria 31h.
 */
describe('cargaHorariaDoCertificado', () => {
  it('é proporcional à duração do programa pela config de cada modo', () => {
    expect(cargaHorariaDoCertificado(getProgramaConfigByModo('jornada').semanas)).toBe(24);
    expect(cargaHorariaDoCertificado(getProgramaConfigByModo('regular_duo').semanas)).toBe(48);
    expect(cargaHorariaDoCertificado(getProgramaConfigByModo('regular_single').semanas)).toBe(48);
    // 12 semanas desde 04/10/2026 (10 de conteúdo, o Mapeamento e o Encerramento):
    // 48 x 12 / 14 = 41,14, arredondado para 41 (eram 31 com 9 semanas).
    expect(cargaHorariaDoCertificado(getProgramaConfigByModo('onboarding').semanas)).toBe(41);
  });

  it('Personalizado de 1 a 4 semanas arredonda 48N/14', () => {
    expect([1, 2, 3, 4].map(cargaHorariaDoCertificado)).toEqual([3, 7, 10, 14]);
  });

  it('sem duração válida recusa em vez de imprimir um número inventado', () => {
    for (const s of [0, -7, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => cargaHorariaDoCertificado(s)).toThrow(/duração do programa inválida/);
    }
  });
});
