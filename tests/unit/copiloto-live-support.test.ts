import { describe, expect, it } from 'vitest';
import { selectImmediateQuestions } from '@/app/copiloto/local-bank';
import { buildFallbackLiveReading } from '@/lib/copiloto/live-support';
import type { LiveReading } from '@/lib/copiloto/types';

const play = {
  kind: 'retorno' as const,
  audience: 'Maria, Head de T&D',
  goalThisHour: 'Sair com a demo marcada.',
  openers: [{ say: 'Quero retomar nosso combinado.', factIndex: null }],
  mustAsk: [
    { text: 'Como funciona hoje?', discovery: 'situacao_atual' as const, green: 'Processo claro', red: 'Sem processo', ifGreen: 'Avançar' },
    { text: 'Qual impacto ainda está aberto?', discovery: 'impacto' as const, green: 'Impacto concreto', red: 'Sem impacto', ifGreen: 'Dimensionar' },
    { text: 'Quem valida o próximo passo?', discovery: 'decisor' as const, green: 'Decisor nomeado', red: 'Decisão difusa', ifGreen: 'Convidar' },
  ],
  doNot: ['Não repetir o diagnóstico já feito.'],
  closeWith: 'Marcar a demo até sexta.',
  landmine: { objection: 'Sem prioridade.', ask: 'O que mudou desde a última conversa?' },
};

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

  it('prioriza as três must-ask do Play acima do banco PACE', () => {
    const reading = buildFallbackLiveReading({
      play,
      questions: [
        { phase: 'analisar', discovery: 'dor_principal', text: 'Pergunta do banco', why: 'Banco' },
      ],
    }, 'analisar', []);

    expect(reading.questions.map((item) => item.text)).toEqual(play.mustAsk.map((item) => item.text));
    expect(reading.questions[0].why).toContain('Play');
  });

  it('num retorno não repergunta uma must-ask cuja descoberta já está coberta', () => {
    const reading = buildFallbackLiveReading({
      play,
      questions: [{ phase: 'analisar', discovery: 'situacao_atual', text: 'Conte de novo como funciona hoje?', why: 'Banco coberto' }],
    }, 'analisar', ['situacao_atual']);

    expect(reading.questions.map((item) => item.text)).not.toContain('Como funciona hoje?');
    expect(reading.questions.map((item) => item.text)).not.toContain('Conte de novo como funciona hoje?');
    expect(reading.questions[0].text).toBe('Qual impacto ainda está aberto?');
  });

  it('preserva a cobertura histórica do retorno mesmo depois de fechar as must-ask', () => {
    const returnPlan = {
      play,
      gaps: ['impacto', 'decisor'],
      questions: [],
    } as unknown as NonNullable<Parameters<typeof selectImmediateQuestions>[0]>;
    const currentReading: LiveReading = {
      ...emptyReading,
      covered: ['impacto', 'decisor'],
    };

    expect(buildFallbackLiveReading(returnPlan, 'analisar', currentReading.covered).questions).toEqual([]);
    expect(selectImmediateQuestions(returnPlan, currentReading, [])).toEqual([]);
  });
});
