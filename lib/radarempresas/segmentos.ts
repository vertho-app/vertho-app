/**
 * Segmentos Vertho — camada proprietária de interpretação comercial.
 *
 * Fonte da verdade no app (tipos, labels, hipóteses de dor, ofertas).
 * Espelha radarempresas_segmentos (migration 099). Os 10 segmentos são
 * estáveis (definição de produto) — por isso vivem em código, como o
 * template do Pulso. O mapa CNAE→segmento, esse sim, é tabela curável.
 *
 * IMPORTANTE: tudo aqui é HIPÓTESE comercial, nunca afirmação sobre a
 * empresa. A UI e a IA devem usar linguagem de hipótese
 * ("sinais sugerem", "empresas desse perfil costumam", "vale validar").
 */

export type SegmentoKey =
  | 'educacao_privada'
  | 'saude_clinicas'
  | 'varejo_especializado'
  | 'servicos_b2b_pessoas'
  | 'logistica_transporte'
  | 'industria_operacao'
  | 'industria_comercial'
  | 'tecnologia_digital'
  | 'franquias_multiunidade'
  | 'expansao_regional';

export interface SegmentoVertho {
  key: SegmentoKey;
  nome: string;
  descricao: string;
  priorityLevel: 1 | 2 | 3 | 4 | 5; // 1 = maior prioridade comercial
  isFlagOnly: boolean;              // detectado por flag, não por CNAE
  painHypotheses: string[];
  recommendedOffers: string[];
}

export const SEGMENTOS: Record<SegmentoKey, SegmentoVertho> = {
  educacao_privada: {
    key: 'educacao_privada',
    nome: 'Educação privada',
    descricao: 'Escolas, cursos livres, idiomas, ensino técnico/superior privado',
    priorityLevel: 1,
    isFlagOnly: false,
    painHypotheses: [
      'retenção de professores', 'desenvolvimento docente', 'coordenação pedagógica',
      'onboarding de educadores', 'padronização pedagógica', 'liderança escolar',
    ],
    recommendedOffers: [
      'Diagnóstico de Competências + PDI', 'Jornada de Liderança',
      'Onboarding Inteligente', 'Pulso de Desenvolvimento',
    ],
  },
  saude_clinicas: {
    key: 'saude_clinicas',
    nome: 'Saúde e clínicas',
    descricao: 'Clínicas médicas, odontologia, estética, laboratórios, redes de atendimento',
    priorityLevel: 1,
    isFlagOnly: false,
    painHypotheses: [
      'atendimento', 'padronização', 'liderança intermediária',
      'treinamento rápido', 'experiência do paciente', 'rotatividade',
    ],
    recommendedOffers: [
      'Trilha de Atendimento', 'Jornada de Liderança',
      'Onboarding Inteligente', 'Matriz de Competências',
    ],
  },
  varejo_especializado: {
    key: 'varejo_especializado',
    nome: 'Varejo especializado',
    descricao: 'Lojas, farmácias, óticas, cosméticos, moda, franquias',
    priorityLevel: 2,
    isFlagOnly: false,
    painHypotheses: ['atendimento', 'vendas', 'turnover', 'onboarding', 'metas', 'liderança de loja'],
    recommendedOffers: ['Trilha de Atendimento', 'Onboarding Inteligente', 'Jornada de Liderança'],
  },
  servicos_b2b_pessoas: {
    key: 'servicos_b2b_pessoas',
    nome: 'Serviços B2B intensivos em pessoas',
    descricao: 'Facilities, limpeza, segurança, portaria, manutenção, terceirização',
    priorityLevel: 1,
    isFlagOnly: false,
    painHypotheses: [
      'supervisão', 'operação distribuída', 'absenteísmo',
      'qualidade', 'padronização', 'liderança operacional',
    ],
    recommendedOffers: ['Jornada de Liderança', 'Matriz de Competências', 'Pulso de Desenvolvimento'],
  },
  logistica_transporte: {
    key: 'logistica_transporte',
    nome: 'Logística e transporte',
    descricao: 'Transporte, armazenagem, distribuição, correio',
    priorityLevel: 2,
    isFlagOnly: false,
    painHypotheses: [
      'coordenação operacional', 'segurança comportamental', 'liderança',
      'comunicação', 'retenção', 'padronização',
    ],
    recommendedOffers: ['Jornada de Liderança', 'Trilha de Atendimento', 'Matriz de Competências'],
  },
  industria_operacao: {
    key: 'industria_operacao',
    nome: 'Indústria com operação distribuída',
    descricao: 'Indústria de transformação com chão de fábrica',
    priorityLevel: 3,
    isFlagOnly: false,
    painHypotheses: [
      'liderança de chão de fábrica', 'sucessão', 'segurança',
      'produtividade', 'treinamento técnico-comportamental', 'cultura',
    ],
    recommendedOffers: ['Jornada de Liderança', 'Matriz de Competências', 'Diagnóstico de Competências + PDI'],
  },
  industria_comercial: {
    key: 'industria_comercial',
    nome: 'Indústria com força comercial',
    descricao: 'Indústria/atacado com equipe de vendas técnicas',
    priorityLevel: 2,
    isFlagOnly: false,
    painHypotheses: [
      'vendas técnicas', 'KAM', 'negociação',
      'onboarding comercial', 'liderança comercial', 'efetividade comercial',
    ],
    recommendedOffers: ['Diagnóstico de Competências + PDI', 'Jornada de Liderança', 'Onboarding Inteligente'],
  },
  tecnologia_digital: {
    key: 'tecnologia_digital',
    nome: 'Tecnologia e serviços digitais',
    descricao: 'TI, software, serviços de informação',
    priorityLevel: 2,
    isFlagOnly: false,
    painHypotheses: ['liderança jovem', 'cultura', 'crescimento rápido', 'feedback', 'onboarding', 'carreira'],
    recommendedOffers: ['MentorIA para líderes', 'Pulso de Desenvolvimento', 'Jornada de Liderança'],
  },
  franquias_multiunidade: {
    key: 'franquias_multiunidade',
    nome: 'Franquias e redes multiunidade',
    descricao: 'Redes com múltiplas unidades operacionais',
    priorityLevel: 1,
    isFlagOnly: false,
    painHypotheses: ['padronização', 'cultura', 'treinamento', 'liderança local', 'expansão', 'atendimento'],
    recommendedOffers: [
      'Onboarding Inteligente', 'Trilha de Atendimento',
      'Jornada de Liderança', 'Matriz de Competências',
    ],
  },
  expansao_regional: {
    key: 'expansao_regional',
    nome: 'Empresas em expansão regional',
    descricao: 'Detectado por flag (multiunidade / crescimento), não por CNAE',
    priorityLevel: 2,
    isFlagOnly: true,
    painHypotheses: ['perda de padrão', 'liderança improvisada', 'onboarding', 'cultura', 'retenção'],
    recommendedOffers: ['Onboarding Inteligente', 'Jornada de Liderança', 'Matriz de Competências'],
  },
};

export const SEGMENTOS_LIST: SegmentoVertho[] = Object.values(SEGMENTOS);

export function getSegmento(key: string): SegmentoVertho | null {
  return (SEGMENTOS as Record<string, SegmentoVertho>)[key] || null;
}

/** Disclaimer obrigatório — exibir na UI e anexar a exports/insights. */
export const RADAR_DISCLAIMER =
  'Os insights do Radar são hipóteses comerciais geradas a partir de dados ' +
  'públicos, contexto setorial e regras Vertho. Não representam diagnóstico ' +
  'da empresa e devem ser validados em conversa consultiva.';

export const SEGMENTOS_VERSION = '1.0.0';
