import { describe, expect, it } from 'vitest';
import {
  computeContextualDisc,
  sanitizeContextualAnswer,
} from '@/lib/pulse/contextual-disc';
import {
  getPulseQuestions,
  PULSE_LEGACY_TEMPLATE_VERSION,
  PULSE_TEMPLATE_VERSION,
} from '@/lib/pulse/template';

describe('pulso com DISC contextual', () => {
  it('preserva o template legado e adiciona o bloco somente na versão atual', () => {
    const legacy = getPulseQuestions('T0', PULSE_LEGACY_TEMPLATE_VERSION);
    const current = getPulseQuestions('T0', PULSE_TEMPLATE_VERSION);

    expect(legacy).toHaveLength(13);
    expect(legacy.some(question => question.question_type.startsWith('disc_'))).toBe(false);
    expect(current).toHaveLength(27);
    expect(current.filter(question => question.question_type === 'disc_ranking')).toHaveLength(8);
    expect(current.filter(question => question.question_type === 'disc_pair')).toHaveLength(6);
    expect(current.at(-1)?.question_type).toBe('open_text');
  });

  it('rejeita rankings incompletos ou com opções duplicadas', () => {
    const ranking = getPulseQuestions('T0')
      .find(question => question.question_type === 'disc_ranking')!;

    expect(sanitizeContextualAnswer(ranking, {
      orderedOptionKeys: ['driver', 'driver', 'careful', 'constant'],
    })).toBeNull();
    expect(sanitizeContextualAnswer(ranking, {
      orderedOptionKeys: ['driver', 'captivating'],
    })).toBeNull();
  });

  it('calcula e normaliza o resultado contextual sem alterar o perfil principal', () => {
    const questions = getPulseQuestions('T0');
    const contextual = questions.filter(
      question => question.question_type === 'disc_ranking' || question.question_type === 'disc_pair',
    );
    const responses = Object.fromEntries(contextual.map(question => [
      question.id,
      {
        answer_json: question.question_type === 'disc_ranking'
          ? { orderedOptionKeys: question.disc_options!.map(option => option.key) }
          : { selectedOptionKey: question.disc_options![0].key },
      },
    ]));

    expect(computeContextualDisc(questions, responses)).toEqual({
      version: 'pulse-contextual-disc-v1',
      rawScores: { D: 44, I: 50, S: 29, C: 43 },
      scores: { D: 53, I: 60, S: 35, C: 52 },
      answeredQuestions: 14,
    });
  });

  it('não gera resultado parcial quando falta uma resposta contextual', () => {
    const questions = getPulseQuestions('T2');
    const first = questions.find(question => question.question_type === 'disc_ranking')!;
    const responses = {
      [first.id]: {
        answer_json: { orderedOptionKeys: first.disc_options!.map(option => option.key) },
      },
    };

    expect(computeContextualDisc(questions, responses)).toBeNull();
  });
});
