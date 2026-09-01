/**
 * Roster ESCOLAR: o elenco da Rede de Escolas ACME.
 *
 * A matriz de competências é a real do segmento (a mesma régua que a plataforma
 * usa em rede pública), com nome e descrição preservados — inventar competência
 * de escola produziria uma demo que não se parece com a entrega. As PESSOAS, as
 * unidades e o contexto são fictícios.
 *
 * 🔑 **O Top 5 de cada cargo põe a competência COM ACERVO dentro dos cinco.**
 * A trilha ancora na competência avaliada e o conteúdo resolve por
 * (competência × descritor); no acervo de origem, as competências com
 * micro-conteúdo estavam nas posições 6 e 7 do Top 10, fora do alcance da
 * curadoria. Herdar a ordem do ranking daria uma jornada sem conteúdo — foi
 * exatamente o que travou o piloto docente em Macaé.
 */

import type { DemoRoster } from '@/lib/demo/rosters/types';

const DIRECAO = 'Diretor(a) Escolar';
const COORDENACAO = 'Coordenador(a) Pedagógico(a)';
const DOCENCIA = 'Professor(a)';

/**
 * As unidades da rede. A demo comercial é uma empresa só; uma rede é o formato
 * do cliente escolar, e é o corte que a Mantenedora abre (comparar unidades).
 */
export const UNIDADES_ESCOLARES = [
  { nome: 'Escola ACME Vila Nova', segmentos: 'Educação Infantil ao Fundamental II', porte: 'A maior da rede' },
  { nome: 'Escola ACME Parque das Águas', segmentos: 'Fundamental II e Ensino Médio', porte: 'Unidade em crescimento' },
  { nome: 'Escola ACME Centro', segmentos: 'Educação Infantil e Fundamental I', porte: 'A mais antiga da rede' },
] as const;

const VILA_NOVA = UNIDADES_ESCOLARES[0].nome;
const PARQUE = UNIDADES_ESCOLARES[1].nome;

const DIRETORA = {
  nome: 'Cláudia Amorim',
  email: 'claudia.demo@vertho.ai',
  whatsapp: null as string | null,
};

const DIRETOR_PARQUE = {
  nome: 'Sérgio Bastos',
  email: 'sergio.demo@vertho.ai',
  whatsapp: null as string | null,
};

/**
 * Quem administra o programa na rede. No cliente escolar esse papel é da
 * MANTENEDORA, não de um RH: ela consome o panorama das unidades e os
 * relatórios, e não percorre jornada nenhuma.
 */
export const MANTENEDORA_PERSONA = {
  key: 'elisa',
  nome_completo: 'Elisa Tavares',
  email: 'elisa.demo@vertho.ai',
  cargo: 'Mantenedora',
  role: 'rh',
  area_depto: 'Mantenedora',
} as const;

/** Top 5 do roster, por cargo. A 5ª de cada um é a que tem acervo. */
const TOP5_DIRECAO = [
  'Liderança pedagógica',
  'Gestão democrática e cultura colaborativa',
  'Gestão de Desempenho e Avaliação',
  'Gestão da Comunidade Escolar',
  'Planejamento e Organização',
];

const TOP5_COORDENACAO = [
  'Gestão da Aprendizagem',
  'Desenvolvimento Docente',
  'Planejamento curricular e intencionalidade pedagógica',
  'Gestão de Desempenho e Avaliação',
  'Colaboração docente e cultura formativa',
];

const TOP5_DOCENCIA = [
  'Didática e estratégias de ensino',
  'Planejamento e intencionalidade pedagógica',
  'Diversidade e Inclusão',
  'Gestão da Aprendizagem',
  'Observação e Contexto',
];

export const CARGOS_ESCOLARES = [
  {
    nome: DIRECAO,
    codPrefix: 'DIR',
    ehLideranca: true,
    area_depto: 'Direção',
    pilar: 'Gestão Escolar',
    descricao: 'Profissional responsável por conduzir o projeto pedagógico da unidade, liderar a equipe docente e administrativa, sustentar a relação com as famílias e garantir que as decisões do dia a dia sustentem a aprendizagem dos estudantes.',
    principais_entregas: 'Direção pedagógica clara e acompanhada; equipe orientada e com devolutivas; rotina e calendário sob controle; relação de confiança com famílias; indicadores lidos e transformados em plano de ação.',
    stakeholders: 'Equipe docente, coordenação pedagógica, famílias, estudantes, secretaria da escola, mantenedora e parceiros da comunidade.',
    decisoes_recorrentes: 'O que priorizar quando a urgência do dia atropela o plano; quando entrar numa sala e quando confiar na coordenação; como responder a uma família sem quebrar um combinado da equipe; que indicador cobrar primeiro.',
    tensoes_comuns: 'Demanda administrativa competindo com a pedagógica; conflito entre famílias e professores; equipe sobrecarregada; recursos limitados; pressão por resultado num prazo mais curto do que o da aprendizagem.',
    contexto_cultural: 'Rede privada de porte médio, com unidades de perfis diferentes, gestão próxima das famílias e expectativa de consistência pedagógica entre as escolas.',
    competencias_foco: ['Planejamento e Organização'],
    competencias: [
      ['Liderança pedagógica', 'Define direção pedagógica clara para a escola, acompanha a qualidade do ensino com base em evidências, oferece devolutivas à equipe docente e ajusta estratégias para garantir a aprendizagem dos estudantes.'],
      ['Gestão democrática e cultura colaborativa', 'Cria espaço real para participação nas decisões, compartilha informações com transparência, considera múltiplas perspectivas, constrói acordos e estimula corresponsabilidade.'],
      ['Gestão de Desempenho e Avaliação', 'Estabelece critérios e metas de desempenho, acompanha indicadores institucionais e pedagógicos, analisa resultados com a equipe e transforma evidências em decisões de melhoria contínua.'],
      ['Gestão da Comunidade Escolar', 'Promove participação das famílias, escuta com abertura, comunica-se com clareza, gere expectativas, responde demandas e articula com atores da comunidade e da rede institucional.'],
      ['Planejamento e Organização', 'Define metas e prioridades, organiza planos de ação, acompanha a execução, antecipa riscos e garante consistência entre planejamento, rotina e resultados da escola.'],
    ],
  },
  {
    nome: COORDENACAO,
    codPrefix: 'COO',
    ehLideranca: true,
    area_depto: 'Coordenação Pedagógica',
    pilar: 'Pedagógico',
    descricao: 'Profissional responsável por acompanhar a prática docente, sustentar a coerência do currículo, organizar a formação da equipe e transformar evidências de aprendizagem em ajustes concretos de ensino.',
    principais_entregas: 'Planejamento docente coerente com o currículo; formação situada e acompanhada na prática; devolutivas frequentes aos professores; leitura das evidências de aprendizagem; intervenções para as lacunas prioritárias.',
    stakeholders: 'Professores, direção escolar, estudantes, famílias, equipe de apoio e a coordenação das outras unidades da rede.',
    decisoes_recorrentes: 'Que prática observar primeiro; como dar uma devolutiva difícil sem romper a relação; o que entra na formação da semana; quando intervir numa turma e quando sustentar a autonomia do professor.',
    tensoes_comuns: 'Agenda tomada por urgências; resistência a mudança de prática; pouco tempo coletivo; pedido de resultado rápido em processo que é lento; equilíbrio entre cobrar e apoiar.',
    contexto_cultural: 'Escola que valoriza acompanhamento próximo e cultura formativa, com professores de trajetórias e tempos de casa bastante diferentes.',
    competencias_foco: ['Colaboração docente e cultura formativa'],
    competencias: [
      ['Gestão da Aprendizagem', 'Orienta o trabalho pedagógico da equipe com foco na aprendizagem dos estudantes, observando práticas, alinhando expectativas e ajustando estratégias com base em evidências.'],
      ['Desenvolvimento Docente', 'Identifica necessidades de desenvolvimento da equipe, planeja formações situadas, acompanha a aplicação na prática e sustenta mudanças ao longo do tempo.'],
      ['Planejamento curricular e intencionalidade pedagógica', 'Garante coerência entre currículo, objetivos de aprendizagem, planejamento docente e experiências propostas aos estudantes, assegurando progressão e intencionalidade pedagógica.'],
      ['Gestão de Desempenho e Avaliação', 'Monitora a aprendizagem e o desempenho pedagógico, identifica lacunas prioritárias, organiza intervenções, acompanha resultados e replaneja com base em evidências.'],
      ['Colaboração docente e cultura formativa', 'Promove trabalho colaborativo entre professores, fortalece a troca de práticas e sustenta uma cultura de aprendizagem profissional contínua e segura.'],
    ],
  },
  {
    nome: DOCENCIA,
    codPrefix: 'TCH',
    ehLideranca: false,
    area_depto: 'Docência',
    pilar: 'Pedagógico',
    descricao: 'Profissional responsável por planejar e conduzir o ensino, acompanhar a aprendizagem de cada estudante, adaptar a prática às necessidades da turma e sustentar uma relação pedagógica que sustente participação e progresso.',
    principais_entregas: 'Aulas planejadas com objetivo claro; evidências de aprendizagem coletadas e usadas; devolutivas aos estudantes; adaptação para quem precisa de outro caminho; registro do que funcionou e do que não funcionou.',
    stakeholders: 'Estudantes, famílias, coordenação pedagógica, colegas de área e direção da unidade.',
    decisoes_recorrentes: 'Retomar um conteúdo ou seguir o planejamento; como agir diante de um estudante que parou de acompanhar; que evidência coletar; quando pedir apoio da coordenação.',
    tensoes_comuns: 'Turma heterogênea com tempo fixo; cobrança por conteúdo dado versus conteúdo aprendido; demandas de famílias; acúmulo de registros; cansaço ao fim do ciclo.',
    contexto_cultural: 'Corpo docente com espaço de troca entre pares e acompanhamento próximo da coordenação, em unidades com perfis de comunidade diferentes.',
    competencias_foco: ['Didática e estratégias de ensino'],
    competencias: [
      ['Didática e estratégias de ensino', 'Ensina com clareza, media a aprendizagem com estratégias adequadas e promove engajamento, garantindo compreensão e progressão para diferentes perfis de estudantes.'],
      ['Planejamento e intencionalidade pedagógica', 'Planeja aulas e sequências com objetivos claros, alinhamento curricular e intencionalidade, ajustando o planejamento a partir das necessidades reais dos estudantes.'],
      ['Diversidade e Inclusão', 'Reconhece diferenças, remove barreiras à participação e adapta práticas para garantir acesso, pertencimento e aprendizagem de todos os estudantes.'],
      ['Gestão da Aprendizagem', 'Coleta evidências de aprendizagem, acompanha progressos, oferece devolutivas úteis e ajusta o ensino para promover avanços de todos os estudantes.'],
      ['Observação e Contexto', 'Observa estudantes, turma e contexto com atenção pedagógica, identifica sinais relevantes para a aprendizagem e usa essa leitura para ajustar intervenções, relações e expectativas.'],
    ],
  },
];

/**
 * As personas navegáveis. O desenho dramático espelha o do roster comercial,
 * porque é ele que faz a demo contar uma história: alguém no fim da jornada,
 * alguém no meio com uma reprovação por régua eliminatória, e quem está
 * começando.
 *
 * ⚠️ O DISC segue a régua do produto (soma 200; `perfil_dominante` é o que
 * `deriveProfile` deriva; `comp_*`/`lid_*` são calculados pelo reset). Número
 * que a plataforma não produz não pode aparecer numa demo.
 */
export const PERSONAS_ESCOLARES = [
  {
    key: 'claudia',
    nome_completo: DIRETORA.nome,
    email: DIRETORA.email,
    cargo: DIRECAO,
    role: 'gestor',
    area_depto: VILA_NOVA,
    gestor_nome: null as string | null,
    gestor_email: null as string | null,
    gestor_whatsapp: null as string | null,
    perfil_dominante: 'DI',
    d_natural: 62, i_natural: 58, s_natural: 42, c_natural: 38,
    scenario: 'completo',
    responder: TOP5_DIRECAO,
  },
  {
    key: 'sergio',
    nome_completo: DIRETOR_PARQUE.nome,
    email: DIRETOR_PARQUE.email,
    cargo: DIRECAO,
    role: 'gestor',
    area_depto: PARQUE,
    gestor_nome: null as string | null,
    gestor_email: null as string | null,
    gestor_whatsapp: null as string | null,
    perfil_dominante: 'IC',
    d_natural: 46, i_natural: 76, s_natural: 20, c_natural: 58,
    scenario: 'parcial',
    responder: ['Planejamento e Organização', 'Gestão da Comunidade Escolar'],
  },
  {
    key: 'renata',
    nome_completo: 'Renata Coelho',
    email: 'renata.demo@vertho.ai',
    cargo: COORDENACAO,
    role: 'colaborador',
    area_depto: VILA_NOVA,
    gestor_nome: DIRETORA.nome,
    gestor_email: DIRETORA.email,
    gestor_whatsapp: DIRETORA.whatsapp,
    perfil_dominante: 'SC',
    d_natural: 24, i_natural: 44, s_natural: 66, c_natural: 66,
    scenario: 'completo',
    responder: TOP5_COORDENACAO,
  },
  {
    key: 'marina',
    nome_completo: 'Marina Rocha',
    email: 'marina.demo@vertho.ai',
    cargo: DOCENCIA,
    role: 'colaborador',
    area_depto: VILA_NOVA,
    gestor_nome: DIRETORA.nome,
    gestor_email: DIRETORA.email,
    gestor_whatsapp: DIRETORA.whatsapp,
    perfil_dominante: 'SI',
    d_natural: 22, i_natural: 64, s_natural: 70, c_natural: 44,
    scenario: 'novo',
    responder: [] as string[],
  },
  {
    key: 'tiago',
    nome_completo: 'Tiago Andrade',
    email: 'tiago.demo@vertho.ai',
    cargo: DOCENCIA,
    role: 'colaborador',
    area_depto: PARQUE,
    gestor_nome: DIRETOR_PARQUE.nome,
    gestor_email: DIRETOR_PARQUE.email,
    gestor_whatsapp: DIRETOR_PARQUE.whatsapp,
    perfil_dominante: 'D',
    d_natural: 66, i_natural: 44, s_natural: 46, c_natural: 44,
    scenario: 'novo',
    responder: [] as string[],
  },
  {
    key: 'paula',
    nome_completo: 'Paula Nakamura',
    email: 'paula.demo@vertho.ai',
    cargo: DOCENCIA,
    role: 'colaborador',
    area_depto: VILA_NOVA,
    gestor_nome: DIRETORA.nome,
    gestor_email: DIRETORA.email,
    gestor_whatsapp: DIRETORA.whatsapp,
    perfil_dominante: 'SC',
    d_natural: 28, i_natural: 48, s_natural: 66, c_natural: 58,
    scenario: 'parcial',
    responder: ['Didática e estratégias de ensino'],
  },
];

/**
 * A sala ao vivo da rede. As três visões continuam sendo participante,
 * liderança e quem administra o programa — o que muda é quem as atende e como
 * elas se chamam para este público.
 */
export const SALA_ESCOLAR = [
  { presentationRoleKey: 'usuario', visao: 'Professor(a)', nome: 'Marina Rocha', email: 'marina.demo@vertho.ai', role: 'colaborador', nextPath: '/dashboard' },
  { presentationRoleKey: 'gestor', visao: 'Direção', nome: DIRETORA.nome, email: DIRETORA.email, role: 'gestor', nextPath: '/dashboard/gestor' },
  { presentationRoleKey: 'rh', visao: 'Mantenedora', nome: MANTENEDORA_PERSONA.nome_completo, email: MANTENEDORA_PERSONA.email, role: MANTENEDORA_PERSONA.role, nextPath: '/dashboard' },
] as const;

export const ROSTER_ESCOLAR: DemoRoster = {
  key: 'escolar',
  // Todos os cargos nascem construídos (o acervo de origem tem cenários fracos
  // e presos ao PPP de escolas reais), então não há cargo herdado de fixture.
  cargoPrincipal: null,
  cargoPrincipalTop5: [],
  cargoPrincipalFoco: [],
  cargosExcluidosDoFixture: new Set<string>(),
  cargosConstruidos: CARGOS_ESCOLARES,
  personas: PERSONAS_ESCOLARES,
  administradora: MANTENEDORA_PERSONA,
  salaApresentacao: SALA_ESCOLAR.map((acesso) => ({ ...acesso })),
  unidades: UNIDADES_ESCOLARES.map((unidade) => ({ ...unidade })),
};
