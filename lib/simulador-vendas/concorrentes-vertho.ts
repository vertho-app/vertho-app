/**
 * Repertório comercial da versão Vertho, preparado para integração ao treino.
 * Capacidades são declarações dos fornecedores nas fontes, não testes de produto.
 * Objeções e perguntas são exemplos autorais para personagens fictícios.
 * Este catálogo não altera a matriz, os prompts ou a nota PACE.
 */
export const CONCORRENTES_VERTHO_VERSION = 'vertho-concorrentes-2026-10-06';
export const CONCORRENTES_VERTHO_REVISADO_EM = '2026-10-06';

export const FRENTES_COMPETITIVAS = [
  'competencias',
  'aprendizagem',
  'mentoria',
  'simulacao',
] as const;
export type FrenteCompetitiva = (typeof FRENTES_COMPETITIVAS)[number];

export type FonteConcorrente = {
  id: string;
  titulo: string;
  url: string;
};
export type ConcorrenteVertho = {
  id: string;
  nome: string;
  prioridade: 'brasil' | 'especializado';
  frentes: readonly FrenteCompetitiva[];
  fontes: readonly FonteConcorrente[];
  fatos: readonly { descricao: string; fonteId: string }[];
  objecaoExemplo: string;
  perguntaDeDiagnostico: string;
};

/** Seleção por sobreposição com a oferta da Vertho; não é ranking de mercado. */
export const CONCORRENTES_VERTHO: readonly ConcorrenteVertho[] = [
  {
    id: 'qulture-rocks',
    nome: 'Qulture Rocks',
    prioridade: 'brasil',
    frentes: ['competencias', 'aprendizagem'],
    fontes: [
      {
        id: 'ecossistema',
        titulo: 'Diagnóstico, desenvolvimento e educação',
        url: 'https://www.qulture.rocks/growth/lp-unificada',
      },
      {
        id: 'pdi-ia',
        titulo: 'Geração de PDI com IA',
        url: 'https://help.qulture.rocks/gera%C3%A7%C3%A3o-de-pdi-com-ia',
      },
    ],
    fatos: [
      {
        descricao:
          'Divulga avaliação de desempenho, PDI, LMS/LXP e educação corporativa em uma jornada integrada.',
        fonteId: 'ecossistema',
      },
      {
        descricao:
          'Documenta geração de ações de PDI com IA a partir da avaliação, do cargo e dos tópicos avaliados.',
        fonteId: 'pdi-ia',
      },
    ],
    objecaoExemplo:
      'Já usamos avaliação, PDI com IA e conteúdos da Qulture Rocks. Que problema adicional a Vertho resolve?',
    perguntaDeDiagnostico:
      'Como vocês verificam se as ações do PDI mudaram o comportamento no trabalho?',
  },
  {
    id: 'gupy',
    nome: 'Gupy',
    prioridade: 'brasil',
    frentes: ['competencias', 'aprendizagem'],
    fontes: [
      {
        id: 'performance',
        titulo: 'Performance e Desenvolvimento',
        url: 'https://www.gupy.io/plataforma-de-performance-e-desenvolvimento',
      },
      {
        id: 'educacao',
        titulo: 'Educação Corporativa',
        url: 'https://www.gupy.io/plataforma-de-educacao-corporativa',
      },
    ],
    fatos: [
      {
        descricao:
          'Oferece avaliação de desempenho, feedback e PDI, com agentes de IA para apoiar a análise das avaliações.',
        fonteId: 'performance',
      },
      {
        descricao:
          'Divulga LMS/LXP, gamificação, microlearning e agentes de IA para criação de treinamentos.',
        fonteId: 'educacao',
      },
    ],
    objecaoExemplo:
      'A Gupy já atende nosso desenvolvimento e treinamento. Por que adicionar outra plataforma?',
    perguntaDeDiagnostico:
      'Quais necessidades de desenvolvimento continuam sem resposta no processo que vocês já usam?',
  },
  {
    id: 'feedz-totvs',
    nome: 'Feedz / TOTVS',
    prioridade: 'brasil',
    frentes: ['competencias'],
    fontes: [
      {
        id: 'desempenho',
        titulo: 'Relatório de avaliação de desempenho da Linha Feedz',
        url: 'https://centraldeatendimento.totvs.com/hc/pt-br/articles/43917664039703-Plataformas-RH-Linha-Feedz-Avalia%C3%A7%C3%A3o-de-Desempenho-Relat%C3%B3rio-de-An%C3%A1lise-Completa-por-Crit%C3%A9rios-na-Avalia%C3%A7%C3%A3o-de-Desempenho',
      },
      {
        id: 'desenvolvimento',
        titulo: 'Progresso do PDI, trilhas e onboarding na Feedz',
        url: 'https://centraldeatendimento.totvs.com/hc/pt-br/articles/41571573050903-Plataformas-RH-Feedz-Desenvolvimento-Como-Atualizar-o-Progresso-do-meu-PDI-Plano-de-Desenvolvimento-Individual',
      },
    ],
    fatos: [
      {
        descricao:
          'Oferece avaliação de desempenho como solução da Linha Feedz.',
        fonteId: 'desempenho',
      },
      {
        descricao:
          'Documenta acompanhamento de atividades de PDI, trilhas de desenvolvimento e onboarding na área Meu Desenvolvimento.',
        fonteId: 'desenvolvimento',
      },
    ],
    objecaoExemplo:
      'Já acompanhamos desempenho e PDI na Feedz. O que a Vertho acrescentaria ao nosso processo?',
    perguntaDeDiagnostico:
      'Como as ações registradas no PDI se transformam em prática e evidências de evolução?',
  },
  {
    id: 'twygo',
    nome: 'Twygo',
    prioridade: 'brasil',
    frentes: ['competencias', 'aprendizagem'],
    fontes: [
      {
        id: 'produtos',
        titulo: 'Soluções para treinar e desenvolver pessoas',
        url: 'https://twygo.com/produtos/',
      },
      {
        id: 'competencias',
        titulo: 'Avaliação de competências com a Twygo',
        url: 'https://twygo.com/blog/como-fazer-avaliacao-de-competencias-com-a-twygo/',
      },
    ],
    fatos: [
      {
        descricao:
          'Divulga LMS, criação de conteúdo com IA, gestão de competências, avaliação, PDI e sucessão.',
        fonteId: 'produtos',
      },
      {
        descricao:
          'Descreve conexão das lacunas de competências com trilhas de aprendizagem e planos de ação apoiados por IA.',
        fonteId: 'competencias',
      },
    ],
    objecaoExemplo:
      'A Twygo já conecta avaliação, PDI e trilhas. Quero entender a diferença na experiência de desenvolvimento.',
    perguntaDeDiagnostico:
      'O que acontece entre identificar uma lacuna, praticar o comportamento e reavaliá-lo?',
  },
  {
    id: 'solides',
    nome: 'Sólides',
    prioridade: 'brasil',
    frentes: ['competencias'],
    fontes: [
      {
        id: 'profiler',
        titulo: 'Profiler e mapeamento comportamental',
        url: 'https://solides.com.br/profiler-mapeamento-comportamental/',
      },
      {
        id: 'pdi',
        titulo: 'Como construir um PDI na Sólides',
        url: 'https://ajuda.solides.com.br/hc/pt-br/articles/4411730052749-Como-construir-um-PDI-pela-plataforma-da-S%C3%B3lides',
      },
    ],
    fatos: [
      {
        descricao:
          'Apresenta o Profiler como mapeamento comportamental baseado em DISC e outras metodologias, com relatórios de perfil e aderência ao cargo.',
        fonteId: 'profiler',
      },
      {
        descricao:
          'Documenta PDI que compara competências do colaborador com as esperadas para o cargo e acompanha metas e ações.',
        fonteId: 'pdi',
      },
    ],
    objecaoExemplo:
      'Já temos Profiler e PDI. Precisamos aplicar outro diagnóstico para começar com a Vertho?',
    perguntaDeDiagnostico:
      'Como vocês usam o perfil comportamental e quais evidências de competência observam no cotidiano?',
  },
  {
    id: 'mindsight',
    nome: 'Mindsight',
    prioridade: 'brasil',
    frentes: ['competencias'],
    fontes: [
      {
        id: 'plataforma',
        titulo: 'Sistema para gestão de talentos',
        url: 'https://conteudos.mindsight.com.br/cognitive-ad',
      },
      {
        id: 'ia',
        titulo: 'Inteligência artificial na gestão de pessoas',
        url: 'https://mindsight.com.br/inteligencia-artificial/',
      },
    ],
    fatos: [
      {
        descricao:
          'Divulga assessments, gestão de desempenho, PDI e People Analytics.',
        fonteId: 'plataforma',
      },
      {
        descricao:
          'Apresenta IA que considera o histórico das pessoas para sinalizar padrões e oportunidades de ação.',
        fonteId: 'ia',
      },
    ],
    objecaoExemplo:
      'A Mindsight já nos dá assessments e análises de pessoas. Qual decisão ou ação melhora com a Vertho?',
    perguntaDeDiagnostico:
      'Como os dados que o RH recebe chegam à prática de desenvolvimento de cada pessoa?',
  },
  {
    id: 'revvo',
    nome: 'Revvo',
    prioridade: 'brasil',
    frentes: ['aprendizagem'],
    fontes: [
      {
        id: 'learningflix',
        titulo: 'Soluções de aprendizagem Revvo',
        url: 'https://revvo.com.br/',
      },
      {
        id: 'ia',
        titulo: 'IAs da Revvo',
        url: 'https://conteudo.revvo.com.br/lp-ias-da-revvo',
      },
      {
        id: 'whatsapp',
        titulo: 'WhatsApp Learning',
        url: 'https://conteudo.revvo.com.br/lp-whatsapplearning-cbtd-2025',
      },
    ],
    fatos: [
      {
        descricao:
          'Divulga LearningFlix com LMS/LXP e IA, além de produção customizada e consultoria de aprendizagem.',
        fonteId: 'learningflix',
      },
      {
        descricao: 'Apresenta Judy como tutora de dúvidas treinada nos cursos.',
        fonteId: 'ia',
      },
      {
        descricao:
          'Oferece aprendizagem pelo WhatsApp com vídeos, áudios, textos e quizzes.',
        fonteId: 'whatsapp',
      },
    ],
    objecaoExemplo:
      'A Revvo já oferece IA e treinamento no WhatsApp. Que diferença eu conseguiria observar no dia a dia?',
    perguntaDeDiagnostico:
      'Vocês precisam distribuir conteúdo, apoiar dúvidas ou treinar e acompanhar a aplicação de comportamentos?',
  },
  {
    id: 'coachhub-aimy',
    nome: 'CoachHub / AIMY',
    prioridade: 'especializado',
    frentes: ['mentoria'],
    fontes: [
      {
        id: 'ia',
        titulo: 'Coaching com IA e AIMY',
        url: 'https://www.coachhub.com/ai-innovation',
      },
    ],
    fatos: [
      {
        descricao:
          'Apresenta AIMY como coaching personalizado com IA, orientado a objetivos e apoio contínuo ao desenvolvimento.',
        fonteId: 'ia',
      },
    ],
    objecaoExemplo:
      'Estamos avaliando coaching com IA da CoachHub. Como a Vertho acompanha competências específicas do nosso trabalho?',
    perguntaDeDiagnostico:
      'Que comportamentos o programa precisa desenvolver e como vocês pretendem acompanhar sua aplicação?',
  },
  {
    id: 'yoodli',
    nome: 'Yoodli',
    prioridade: 'especializado',
    frentes: ['simulacao'],
    fontes: [
      {
        id: 'vendas',
        titulo: 'Simulações de vendas com IA',
        url: 'https://yoodli.ai/solutions/sales-roleplay',
      },
    ],
    fatos: [
      {
        descricao:
          'Divulga simulações de conversas comerciais com clientes de IA, objeções, negociação, feedback e avaliação pela metodologia do cliente.',
        fonteId: 'vendas',
      },
    ],
    objecaoExemplo:
      'A Yoodli já permite simular clientes e usar nossa metodologia. Quero comparar o feedback e a evolução entre treinos.',
    perguntaDeDiagnostico:
      'Quais situações a equipe precisa praticar e que evidências tornariam o feedback útil para o próximo atendimento?',
  },
];

/**
 * Varia os fornecedores que o cliente pode conhecer ou usar em seu desenvolvimento.
 * As frentes do catálogo classificam capacidades, sem predeterminar a oferta Vertho.
 * Se todos já apareceram, reabre o conjunto completo.
 * O chamador registra o item e a versão no snapshot; não relê a base no meio da sessão.
 */
export function selecionarConcorrenteVertho(
  indice: number,
  anteriores: readonly string[] = [],
): ConcorrenteVertho {
  if (!Number.isSafeInteger(indice) || indice < 0)
    throw new Error('Índice de seleção inválido.');
  const novos = CONCORRENTES_VERTHO.filter((c) => !anteriores.includes(c.id));
  const candidatos = novos.length ? novos : CONCORRENTES_VERTHO;
  return candidatos[indice % candidatos.length];
}
