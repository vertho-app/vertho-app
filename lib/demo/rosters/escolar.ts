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

import type { DemoRoster, DemoRosterDescritor } from '@/lib/demo/rosters/types';
// A régua real do segmento (6 descritores por competência, com N1-N4,
// evidências e perguntas-alvo), capturada por
// `scripts/_extrair-descritores-escolares.ts`.
import reguaEscolar from '@/lib/demo/escolas-descritores.json';

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

/**
 * A coordenação de cada unidade. É ela que acompanha os professores no dia a
 * dia, então é ela que responde como gestora deles — na escola quem faz o papel
 * de gestor do produto é o coordenador, não a direção.
 */
const COORDENACAO_VILA_NOVA = {
  nome: 'Renata Coelho',
  email: 'renata.demo@vertho.ai',
  whatsapp: null as string | null,
};

const COORDENACAO_PARQUE = {
  nome: 'Sérgio Bastos',
  email: 'sergio.demo@vertho.ai',
  whatsapp: null as string | null,
};

/**
 * Quem administra o programa na escola. Na rede escolar o papel de RH é da
 * DIREÇÃO (decisão do dono, 01/09): ela abre o panorama, os relatórios e o
 * acompanhamento da equipe, e não percorre jornada — exatamente como a persona
 * de RH do elenco comercial.
 *
 * ⚠️ Consequência que vale lembrar antes de mexer: o produto EXCLUI `role='rh'`
 * das métricas de participação. Pôr alguém aqui é tirá-lo do funil que ele
 * mesmo consulta, então quem precisa aparecer como participante não pode ser
 * a conta de administração.
 */
export const DIRECAO_PERSONA = {
  key: 'claudia',
  nome_completo: 'Cláudia Amorim',
  email: 'claudia.demo@vertho.ai',
  cargo: DIRECAO,
  role: 'rh',
  area_depto: 'Escola ACME Vila Nova',
} as const;

/** Top 5 do roster, por cargo. A 5ª de cada um é a que tem acervo. */
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

/**
 * Os cargos com MATRIZ, isto é, os que têm competências, cenários e gente
 * avaliada. A direção não está aqui: ela administra o programa (papel `rh`) e
 * não percorre a jornada, então uma matriz de direção ficaria sem nenhum
 * participante — e cargo vazio no ranking é ruído na tela, não capacidade.
 * A régua dela segue guardada em `escolas-descritores.json`, se um dia a
 * direção passar a participar.
 */
export const CARGOS_ESCOLARES = [
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
    // A JORNADA COMPLETA é do professor (decisão do dono, 01/09). É ele quem
    // faz avaliação e trilha; coordenação e direção existem para ver a equipe e
    // administrar o programa, não para percorrer o percurso.
    key: 'marina',
    nome_completo: 'Marina Rocha',
    email: 'marina.demo@vertho.ai',
    cargo: DOCENCIA,
    role: 'colaborador',
    area_depto: VILA_NOVA,
    gestor_nome: COORDENACAO_VILA_NOVA.nome,
    gestor_email: COORDENACAO_VILA_NOVA.email,
    gestor_whatsapp: COORDENACAO_VILA_NOVA.whatsapp,
    perfil_dominante: 'SI',
    d_natural: 22, i_natural: 64, s_natural: 70, c_natural: 44,
    scenario: 'completo',
    estiloResposta: 'forte' as const,
    responder: TOP5_DOCENCIA,
  },
  {
    key: 'paula',
    nome_completo: 'Paula Nakamura',
    email: 'paula.demo@vertho.ai',
    cargo: DOCENCIA,
    role: 'colaborador',
    area_depto: VILA_NOVA,
    gestor_nome: COORDENACAO_VILA_NOVA.nome,
    gestor_email: COORDENACAO_VILA_NOVA.email,
    gestor_whatsapp: COORDENACAO_VILA_NOVA.whatsapp,
    perfil_dominante: 'SC',
    d_natural: 28, i_natural: 48, s_natural: 66, c_natural: 58,
    scenario: 'parcial',
    responder: ['Didática e estratégias de ensino', 'Diversidade e Inclusão'],
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
    // Coordenação NÃO faz avaliação nem trilha: ela acompanha a equipe. Tem
    // DISC e entra no ranking de adequação (o fit lê as colunas
    // comportamentais, não os assessments), como a persona de gestão do elenco
    // comercial — cujo Top 5 também é vazio, e por decisão.
    key: 'renata',
    nome_completo: COORDENACAO_VILA_NOVA.nome,
    email: COORDENACAO_VILA_NOVA.email,
    cargo: COORDENACAO,
    role: 'gestor',
    area_depto: VILA_NOVA,
    gestor_nome: null as string | null,
    gestor_email: null as string | null,
    gestor_whatsapp: null as string | null,
    perfil_dominante: 'SC',
    d_natural: 24, i_natural: 44, s_natural: 66, c_natural: 66,
    scenario: 'gestor',
    responder: [] as string[],
  },
  {
    // O papel da RÉGUA ELIMINATÓRIA. Ele não percorre jornada; o que a demo
    // mostra nele é a ADEQUAÇÃO ao cargo: aderência alta e, ainda assim,
    // bloqueado por uma premissa. DISC calibrado com o motor como oráculo —
    // ver o comentário do bloco abaixo.
    key: 'sergio',
    nome_completo: COORDENACAO_PARQUE.nome,
    email: COORDENACAO_PARQUE.email,
    cargo: COORDENACAO,
    role: 'gestor',
    area_depto: PARQUE,
    gestor_nome: null as string | null,
    gestor_email: null as string | null,
    gestor_whatsapp: null as string | null,
    // `Medido:` fit 83,8 · "Não recomendado" por "Persistência insuficiente
    // para sustentar processos lentos de mudança de prática docente sob pressão
    // por resultado rápido". O primeiro palpite (D46 I76 S20 C58) dava 77,7 com
    // ZERO premissas reprovadas: o papel não existia de fato. A busca em grade
    // varreu os perfis que somam 200 e perguntou ao `calcularFitUnificado`;
    // este é o de maior aderência entre os que bloqueiam e preservam o IC.
    perfil_dominante: 'IC',
    d_natural: 24, i_natural: 74, s_natural: 30, c_natural: 72,
    scenario: 'gestor',
    responder: [] as string[],
  },
];

/**
 * A sala ao vivo da rede. As três visões continuam sendo participante,
 * liderança e quem administra o programa — o que muda é quem as atende e como
 * elas se chamam para este público.
 */
export const SALA_ESCOLAR = [
  { presentationRoleKey: 'usuario', visao: 'Professor(a)', nome: 'Marina Rocha', email: 'marina.demo@vertho.ai', role: 'colaborador', nextPath: '/dashboard' },
  { presentationRoleKey: 'gestor', visao: 'Coordenação', nome: 'Renata Coelho', email: 'renata.demo@vertho.ai', role: 'gestor', nextPath: '/dashboard/gestor' },
  { presentationRoleKey: 'rh', visao: 'Direção', nome: DIRECAO_PERSONA.nome_completo, email: DIRECAO_PERSONA.email, role: DIRECAO_PERSONA.role, nextPath: '/dashboard' },
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

/**
 * As respostas do assessment, no vocabulário de quem trabalha em escola.
 *
 * 🔴 Não é preciosismo: o seed usava o texto COMERCIAL para qualquer ambiente, e
 * a diretora da rede aparecia dizendo "separaria fatos, interesses do cliente e
 * riscos comerciais". Além de entregar a demo errada, a IA4 avaliaria esse
 * jargão como se fosse a resposta da pessoa — a nota sairia de um texto que o
 * segmento não fala.
 */
export function respostaEscolarPadrao(competencia: string) {
  return {
    r1: `Eu começaria separando o que é evidência do que é impressão. Em ${competencia}, olho o que os dados da turma mostram, escuto quem está envolvido e delimito o problema antes de propor qualquer mudança de prática.`,
    r2: 'Minha ação seria combinar uma conversa direta com um plano curto e verificável: o que muda na próxima semana, quem acompanha e como saberemos que funcionou. Registro os combinados para não depender de memória.',
    r3: 'O critério é o efeito na aprendizagem, não a rapidez da solução. Prefiro um passo menor que a equipe sustenta a um plano grande que morre no primeiro imprevisto do calendário.',
    r4: 'Depois eu comparo o combinado com o que aconteceu de fato, ouço a percepção de quem executou e ajusto. Também reviso se minha leitura inicial do problema estava certa, porque às vezes o sintoma não era a causa.',
    representatividade: 8,
  };
}

/** A persona que a demo mostra no melhor caso: evidência, método e follow-up. */
export function respostaEscolarForte(competencia: string) {
  const c = competencia.toLowerCase();
  return {
    r1: `Antes de agir eu monto o quadro com evidência. Em ${c}, cruzo os resultados da avaliação diagnóstica com o que vejo em sala e com o que os professores relatam, e separo o que é lacuna de aprendizagem do que é problema de rotina ou de vínculo — porque a intervenção é diferente em cada caso.`,
    r2: 'Transformo isso num plano com dono e prazo: prioridade da quinzena, quem acompanha cada turma, que evidência vamos olhar e em que reunião revisamos. Deixo registrado no plano de ação e devolvo para a equipe no encontro seguinte, com o combinado escrito.',
    r3: 'Meu critério é sustentabilidade: escolho o menor conjunto de mudanças que a equipe consegue manter durante o bimestre inteiro. Uma prática que a pessoa sustenta por oito semanas muda a aprendizagem; três práticas abandonadas na segunda semana não mudam nada.',
    r4: 'No fechamento comparo o previsto com o realizado por turma, devolvo o resultado para quem executou e registro o que funcionou e o que não. Quando o resultado não vem, reviso primeiro a minha hipótese antes de cobrar a execução — e ajusto o acompanhamento para o ciclo seguinte.',
    representatividade: 9,
  };
}

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
  administradora: DIRECAO_PERSONA,
  salaApresentacao: SALA_ESCOLAR.map((acesso) => ({ ...acesso })),
  respostas: {
    padrao: (competencia) => respostaEscolarPadrao(competencia),
    forte: (competencia) => respostaEscolarForte(competencia),
  },
  descritores: (reguaEscolar as any).descritores as Record<string, DemoRosterDescritor[]>,
  unidades: UNIDADES_ESCOLARES.map((unidade) => ({ ...unidade })),
};
