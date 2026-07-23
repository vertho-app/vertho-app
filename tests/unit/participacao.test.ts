import { describe, it, expect } from 'vitest';
import { calcularParticipacao, isTrilhaPiloto, PARTICIPACAO_MINIMA } from '@/lib/season-engine/participacao';

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
