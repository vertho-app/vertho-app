import { describe, expect, it } from 'vitest';
import { selectImmediateQuestions } from '@/app/copiloto/local-bank';
import { buildFallbackLiveReading } from '@/lib/copiloto/live-support';
import type { LiveReading } from '@/lib/copiloto/types';

const emptyReading: LiveReading = {
  phase: 'analisar',
  covered: [],
  pending: [
    { key: 'situacao_atual', label: 'Como funciona hoje' },
    { key: 'dor_principal', label: 'O que mais incomoda' },
    { key: 'impacto', label: 'Quanto custa esse problema' },
  ],
  signal: 'neutro',
  objection: null,
  alert: null,
  focus: '',
  questions: [],
};

describe('apoio ao vivo resiliente', () => {
  it('mantém perguntas úteis mesmo sem plano ou resposta da IA', () => {
    const questions = selectImmediateQuestions(null, emptyReading, []);

    expect(questions).toHaveLength(3);
    expect(questions[0].text).toContain('funciona hoje');
  });

  it('usa primeiro o banco PACE preparado no fallback do servidor', () => {
    const reading = buildFallbackLiveReading({
      questions: [
        { phase: 'analisar', discovery: 'dor_principal', text: 'Qual é o principal gargalo hoje?', why: 'Aprofundar dor' },
        { phase: 'analisar', discovery: 'impacto', text: 'Que impacto isso provoca?', why: 'Dimensionar impacto' },
        { phase: 'engajar', discovery: 'prazo', text: 'Quando começamos?', why: 'Próximo passo' },
      ],
    }, 'analisar', []);

    expect(reading.questions.slice(0, 2).map((item) => item.text)).toEqual([
      'Qual é o principal gargalo hoje?',
      'Que impacto isso provoca?',
    ]);
    expect(reading.alert).toContain('banco PACE local');
  });

  it('não volta a sugerir uma descoberta já coberta', () => {
    const reading = buildFallbackLiveReading({
      questions: [
        { phase: 'analisar', discovery: 'dor_principal', text: 'Qual é a dor?', why: 'Dor' },
        { phase: 'analisar', discovery: 'criterio', text: 'Como vão escolher?', why: 'Critério' },
      ],
    }, 'analisar', ['dor_principal']);

    expect(reading.pending.map((item) => item.key)).not.toContain('dor_principal');
    expect(reading.questions[0].text).toBe('Como vão escolher?');
  });
});
