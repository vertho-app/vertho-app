/**
 * Template do Pulso de Desenvolvimento.
 *
 * v1: 6 dimensões × 2 perguntas = 12 Likert + 1 aberta por momento (T0/T2).
 * v2: mantém o pulso v1 e acrescenta 8 rankings + 6 escolhas forçadas
 * para registrar o perfil comportamental no contexto de trabalho.
 * Hardcoded: enquanto não houver customização por empresa, vive em código.
 *
 * Convenção de IDs: `{T0|T2}_{D1..D6}_{Q1..Q2|QA}` (QA = aberta).
 * Exemplos: "T0_D1_Q1", "T2_D4_Q2", "T0_D6_QA".
 */

export type PulseMoment = 'T0' | 'T2';
export type QuestionType = 'likert_1_5' | 'open_text' | 'disc_ranking' | 'disc_pair';
export type DiscFactor = 'D' | 'I' | 'S' | 'C';

export interface DiscQuestionOption {
  key: string;
  factor: DiscFactor;
}

export type DimensionKey =
  | 'clareza'
  | 'condicoes'
  | 'lideranca'
  | 'seguranca_aprender'
  | 'aplicacao_pratica'
  | 'futuro_permanencia';

export type QuestionDimensionKey = DimensionKey | 'contexto_comportamental';

export interface PulseQuestion {
  id: string;
  pulse_moment: PulseMoment;
  dimension_key: QuestionDimensionKey;
  dimension_name: string;
  dimension_order: number;
  question_order: number;
  question_text: string;
  question_type: QuestionType;
  is_required: boolean;
  disc_options?: DiscQuestionOption[];
}

export const LIKERT_LABELS: Record<number, string> = {
  1: 'Discordo totalmente',
  2: 'Discordo parcialmente',
  3: 'Nem concordo, nem discordo',
  4: 'Concordo parcialmente',
  5: 'Concordo totalmente',
};

export const DIMENSIONS: { key: DimensionKey; name: string; order: number }[] = [
  { key: 'clareza',             name: 'Clareza',                order: 1 },
  { key: 'condicoes',           name: 'Condições',              order: 2 },
  { key: 'lideranca',           name: 'Liderança',              order: 3 },
  { key: 'seguranca_aprender',  name: 'Segurança para aprender', order: 4 },
  { key: 'aplicacao_pratica',   name: 'Aplicação prática',      order: 5 },
  { key: 'futuro_permanencia',  name: 'Futuro e permanência',   order: 6 },
];

const T0_TEXTS: Record<DimensionKey, [string, string]> = {
  clareza: [
    'Tenho clareza sobre o que se espera de mim no meu papel.',
    'Entendo quais competências e comportamentos são valorizados nesta organização.',
  ],
  condicoes: [
    'Tenho tempo e condições reais para aplicar novos aprendizados na minha rotina.',
    'Tenho acesso aos recursos, informações ou apoio necessários para fazer bem meu trabalho.',
  ],
  lideranca: [
    'Minha liderança direta acompanha meu desenvolvimento de forma consistente.',
    'Recebo feedbacks úteis para melhorar minha atuação.',
  ],
  seguranca_aprender: [
    'Sinto segurança para pedir ajuda quando tenho dificuldade.',
    'Posso testar, errar e ajustar minha prática sem medo de punição ou constrangimento.',
  ],
  aplicacao_pratica: [
    'As oportunidades de desenvolvimento que recebo estão conectadas aos desafios reais do meu trabalho.',
    'Consigo transformar aprendizados em ações práticas no dia a dia.',
  ],
  futuro_permanencia: [
    'Vejo oportunidades reais de evolução profissional nesta organização.',
    'Recomendaria esta organização como um bom lugar para aprender e se desenvolver.',
  ],
};

const T2_TEXTS: Record<DimensionKey, [string, string]> = {
  clareza: [
    'Hoje tenho mais clareza sobre o que se espera de mim no meu papel.',
    'Hoje entendo melhor quais competências e comportamentos preciso desenvolver.',
  ],
  condicoes: [
    'Tive tempo e condições reais para aplicar os aprendizados da jornada.',
    'Tive acesso aos recursos, informações ou apoio necessários para evoluir.',
  ],
  lideranca: [
    'Minha liderança direta apoiou meu desenvolvimento ao longo da jornada.',
    'Recebi feedbacks úteis para melhorar minha atuação durante este período.',
  ],
  seguranca_aprender: [
    'Senti segurança para pedir ajuda quando tive dificuldade.',
    'Consegui testar, errar e ajustar minha prática sem medo de punição ou constrangimento.',
  ],
  aplicacao_pratica: [
    'As atividades da jornada estiveram conectadas aos desafios reais do meu trabalho.',
    'Consegui transformar aprendizados da jornada em ações práticas no dia a dia.',
  ],
  futuro_permanencia: [
    'Depois da jornada, vejo mais oportunidades de evolução profissional nesta organização.',
    'Recomendaria esta organização como um bom lugar para aprender e se desenvolver.',
  ],
};

const OPEN_QUESTIONS: Record<PulseMoment, string> = {
  T0: 'O que mais ajuda ou dificulta seu desenvolvimento hoje?',
  T2: 'O que mais ajudou ou dificultou sua evolução ao longo da jornada?',
};

const CONTEXTUAL_RANKING_GROUPS: DiscQuestionOption[][] = [
  [{ key: 'driver', factor: 'D' }, { key: 'captivating', factor: 'I' }, { key: 'careful', factor: 'C' }, { key: 'constant', factor: 'S' }],
  [{ key: 'welcoming', factor: 'S' }, { key: 'articulate', factor: 'I' }, { key: 'incisive', factor: 'D' }, { key: 'meticulous', factor: 'C' }],
  [{ key: 'rational', factor: 'C' }, { key: 'animated', factor: 'I' }, { key: 'tolerant', factor: 'S' }, { key: 'firm', factor: 'D' }],
  [{ key: 'motivator', factor: 'I' }, { key: 'methodical', factor: 'C' }, { key: 'achiever', factor: 'D' }, { key: 'resilient', factor: 'S' }],
  [{ key: 'objective', factor: 'D' }, { key: 'adaptable', factor: 'I' }, { key: 'balanced', factor: 'S' }, { key: 'rigorous', factor: 'C' }],
  [{ key: 'structured', factor: 'C' }, { key: 'calm', factor: 'S' }, { key: 'proactive', factor: 'D' }, { key: 'vibrant', factor: 'I' }],
  [{ key: 'communicative', factor: 'I' }, { key: 'analytical', factor: 'C' }, { key: 'collaborative', factor: 'S' }, { key: 'decisive', factor: 'D' }],
  [{ key: 'fearless', factor: 'D' }, { key: 'cautious', factor: 'C' }, { key: 'engaging', factor: 'I' }, { key: 'persevering', factor: 'S' }],
];

const CONTEXTUAL_FORCED_PAIRS: DiscQuestionOption[][] = [
  [{ key: 'actFast', factor: 'D' }, { key: 'involvePeople', factor: 'I' }],
  [{ key: 'changeBroken', factor: 'D' }, { key: 'keepWorking', factor: 'S' }],
  [{ key: 'decideAvailable', factor: 'D' }, { key: 'analyzeAll', factor: 'C' }],
  [{ key: 'meetPeople', factor: 'I' }, { key: 'deepenRelations', factor: 'S' }],
  [{ key: 'improvise', factor: 'I' }, { key: 'routine', factor: 'C' }],
  [{ key: 'teamWellbeing', factor: 'S' }, { key: 'deliveryQuality', factor: 'C' }],
];

function buildBaseQuestions(moment: PulseMoment): PulseQuestion[] {
  const texts = moment === 'T0' ? T0_TEXTS : T2_TEXTS;
  const out: PulseQuestion[] = [];
  let order = 1;
  for (const dim of DIMENSIONS) {
    const [t1, t2] = texts[dim.key];
    out.push({
      id: `${moment}_D${dim.order}_Q1`,
      pulse_moment: moment, dimension_key: dim.key, dimension_name: dim.name,
      dimension_order: dim.order, question_order: order++,
      question_text: t1, question_type: 'likert_1_5', is_required: true,
    });
    out.push({
      id: `${moment}_D${dim.order}_Q2`,
      pulse_moment: moment, dimension_key: dim.key, dimension_name: dim.name,
      dimension_order: dim.order, question_order: order++,
      question_text: t2, question_type: 'likert_1_5', is_required: true,
    });
  }
  return out;
}

function buildOpenQuestion(moment: PulseMoment, order: number): PulseQuestion {
  return {
    id: `${moment}_OPEN`,
    pulse_moment: moment, dimension_key: 'futuro_permanencia', dimension_name: 'Aberta',
    dimension_order: 99, question_order: order,
    question_text: OPEN_QUESTIONS[moment], question_type: 'open_text', is_required: false,
  };
}

function buildLegacyQuestions(moment: PulseMoment): PulseQuestion[] {
  const out = buildBaseQuestions(moment);
  out.push(buildOpenQuestion(moment, out.length + 1));
  return out;
}

function buildCurrentQuestions(moment: PulseMoment): PulseQuestion[] {
  const out = buildBaseQuestions(moment);
  let order = out.length + 1;
  const rankingText = moment === 'T0'
    ? 'Ordene as palavras pensando em como você age no trabalho hoje.'
    : 'Ordene as palavras pensando em como você agiu no trabalho ao longo desta jornada.';
  const pairText = moment === 'T0'
    ? 'Escolha a alternativa que mais representa como você age no trabalho hoje.'
    : 'Escolha a alternativa que mais representa como você agiu no trabalho ao longo desta jornada.';

  CONTEXTUAL_RANKING_GROUPS.forEach((options, index) => {
    out.push({
      id: `${moment}_CTX_R${index + 1}`,
      pulse_moment: moment,
      dimension_key: 'contexto_comportamental',
      dimension_name: 'Contexto de trabalho',
      dimension_order: 7,
      question_order: order++,
      question_text: rankingText,
      question_type: 'disc_ranking',
      is_required: true,
      disc_options: options,
    });
  });

  CONTEXTUAL_FORCED_PAIRS.forEach((options, index) => {
    out.push({
      id: `${moment}_CTX_P${index + 1}`,
      pulse_moment: moment,
      dimension_key: 'contexto_comportamental',
      dimension_name: 'Contexto de trabalho',
      dimension_order: 7,
      question_order: order++,
      question_text: pairText,
      question_type: 'disc_pair',
      is_required: true,
      disc_options: options,
    });
  });

  out.push({
    ...buildOpenQuestion(moment, order),
  });
  return out;
}

export const PULSE_LEGACY_TEMPLATE_VERSION = '1.0.0';
export const PULSE_TEMPLATE_VERSION = '2.0.0';

export const PULSE_T0_QUESTIONS = buildCurrentQuestions('T0');
export const PULSE_T2_QUESTIONS = buildCurrentQuestions('T2');

export function getPulseQuestions(
  moment: PulseMoment,
  templateVersion = PULSE_TEMPLATE_VERSION,
): PulseQuestion[] {
  if (templateVersion === PULSE_LEGACY_TEMPLATE_VERSION) {
    return buildLegacyQuestions(moment);
  }
  return moment === 'T0' ? PULSE_T0_QUESTIONS : PULSE_T2_QUESTIONS;
}
