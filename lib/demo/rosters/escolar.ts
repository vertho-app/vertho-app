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

/**
 * A coordenação da segunda unidade. É ela que acompanha os professores de lá no
 * dia a dia, então é ela que responde como gestora deles.
 */
const COORDENACAO_PARQUE = {
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
    // O papel da régua eliminatória: aderência alta e, ainda assim, bloqueado
    // por uma premissa do cargo. Fica na COORDENAÇÃO, e não na direção, porque
    // é lá que a demo tem duas pessoas no mesmo cargo para comparar — um
    // ranking de adequação com uma pessoa só não mostra o que ele faz.
    key: 'sergio',
    nome_completo: COORDENACAO_PARQUE.nome,
    email: COORDENACAO_PARQUE.email,
    cargo: COORDENACAO,
    role: 'gestor',
    area_depto: PARQUE,
    gestor_nome: null as string | null,
    gestor_email: null as string | null,
    gestor_whatsapp: null as string | null,
    perfil_dominante: 'IC',
    d_natural: 46, i_natural: 76, s_natural: 20, c_natural: 58,
    scenario: 'parcial',
    responder: ['Gestão da Aprendizagem', 'Desenvolvimento Docente'],
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
    gestor_nome: COORDENACAO_PARQUE.nome,
    gestor_email: COORDENACAO_PARQUE.email,
    gestor_whatsapp: COORDENACAO_PARQUE.whatsapp,
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

/**
 * O PPP da rede: o contexto institucional que os cenários e as avaliações leem.
 * É fictício de ponta a ponta — o que veio do mundo real foi a MATRIZ, não a
 * instituição. Vocabulário e tensões são os de uma rede privada de porte médio,
 * porque é isso que o cenário precisa refletir para soar verdadeiro na demo.
 */
export const PPP_REDE_ESCOLAS_ACME = {
  perfil_instituicao: {
    nome: 'Rede de Escolas ACME',
    tipo: 'Rede privada de educação básica',
    segmento: 'Educação Infantil, Fundamental e Ensino Médio',
    porte: 'Três unidades e cerca de 180 profissionais',
    localizacao: 'Rede regional, com unidades de perfis diferentes',
  },
  comunidade_contexto: 'A Rede de Escolas ACME reúne três unidades com histórias e comunidades distintas: uma escola grande e consolidada, uma unidade em crescimento que recebeu muitas famílias novas nos últimos anos e uma escola antiga, de bairro, com forte vínculo comunitário. A mantenedora busca consistência pedagógica entre elas sem apagar a identidade de cada uma.',
  identidade: {
    missao: 'Formar estudantes capazes de aprender com autonomia, conviver com respeito e agir com responsabilidade.',
    visao: 'Ser uma rede reconhecida pela consistência pedagógica entre as unidades e pelo cuidado com quem ensina.',
    principios: ['Aprendizagem no centro', 'Cuidado com quem ensina', 'Escuta das famílias', 'Decisão com evidência', 'Equidade', 'Trabalho colaborativo'],
    concepcao: 'A rede entende qualidade como a combinação entre aprendizagem dos estudantes, clareza do trabalho pedagógico e sustentabilidade da equipe. Valoriza professores que ajustam a prática com base em evidências e lideranças que sustentam acordos.',
  },
  praticas_descritas: [
    { nome: 'Reunião pedagógica semanal', descricao: 'Encontro da equipe para alinhar planejamento, discutir turmas e combinar intervenções.', frequencia: 'semanal' },
    { nome: 'Conselho de classe', descricao: 'Leitura coletiva do desempenho e do percurso de cada turma, com encaminhamentos registrados.', frequencia: 'bimestral' },
    { nome: 'Observação de aula com devolutiva', descricao: 'Coordenação observa a prática combinada previamente e devolve ao professor em até uma semana.', frequencia: 'mensal' },
    { nome: 'Encontro da rede', descricao: 'Direções e coordenações das três unidades alinham prioridades e comparam indicadores.', frequencia: 'bimestral' },
  ],
  gestao_participacao: 'As decisões pedagógicas são tomadas pela direção com a coordenação, com espaço real de participação dos professores nos ritos coletivos. A mantenedora acompanha indicadores das três unidades e cobra consistência, sem decidir a rotina de cada escola.',
  desafios_metas: {
    desafios: ['Defasagem de aprendizagem em algumas turmas', 'Sustentar a mesma qualidade nas três unidades', 'Tempo coletivo curto para formação', 'Relação com famílias em situações difíceis', 'Sobrecarga da equipe ao fim de cada ciclo'],
    metas: ['Reduzir a defasagem nas turmas prioritárias', 'Tornar a devolutiva ao professor uma prática regular', 'Fortalecer o planejamento com intencionalidade', 'Cuidar da sustentabilidade da equipe docente'],
  },
  vocabulario: [
    { termo: 'PPP', significado: 'Projeto Político-Pedagógico: o documento que declara a intenção educativa da escola.' },
    { termo: 'Conselho de classe', significado: 'Rito coletivo em que a equipe lê o percurso de cada turma e combina encaminhamentos.' },
    { termo: 'Devolutiva', significado: 'Retorno estruturado sobre uma prática observada, com combinados para o próximo ciclo.' },
    { termo: 'Recomposição', significado: 'Trabalho pedagógico para retomar aprendizagens não consolidadas.' },
    { termo: 'Unidade', significado: 'Cada escola da rede, com comunidade e equipe próprias.' },
  ],
  competencias_priorizadas: [
    { nome: 'Liderança pedagógica', justificativa: 'A consistência entre as unidades depende de direção pedagógica clara e acompanhada.', relevancia: 'alta' },
    { nome: 'Planejamento e Organização', justificativa: 'É o que impede a urgência do dia de consumir a prioridade pedagógica.', relevancia: 'alta' },
    { nome: 'Colaboração docente e cultura formativa', justificativa: 'A troca entre professores é o que sustenta mudança de prática ao longo do tempo.', relevancia: 'alta' },
    { nome: 'Didática e estratégias de ensino', justificativa: 'É onde a aprendizagem acontece ou deixa de acontecer.', relevancia: 'alta' },
    { nome: 'Diversidade e Inclusão', justificativa: 'As três unidades atendem comunidades com necessidades bastante diferentes.', relevancia: 'alta' },
  ],
  valores_institucionais: ['Aprendizagem no centro', 'Cuidado com quem ensina', 'Escuta das famílias', 'Decisão com evidência', 'Equidade', 'Trabalho colaborativo'],
  competencias: [
    { nome: 'Liderança pedagógica', justificativa: 'Sustenta direção clara e devolutiva à equipe docente.', relevancia: 'alta' },
    { nome: 'Colaboração docente e cultura formativa', justificativa: 'Transforma prática individual em aprendizagem coletiva.', relevancia: 'alta' },
    { nome: 'Didática e estratégias de ensino', justificativa: 'Conecta intenção pedagógica ao que o estudante de fato aprende.', relevancia: 'alta' },
  ],
};

export const VALORES_REDE_ESCOLAS_ACME = PPP_REDE_ESCOLAS_ACME.valores_institucionais;

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
