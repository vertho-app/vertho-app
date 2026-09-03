/**
 * Roster COMERCIAL: o elenco que o ACME Demo e o Grupo Sinal semeiam.
 *
 * `DEMO_TENANT_PROFILES` (em `reset-acme-demo.ts`) já parametrizava a
 * IDENTIDADE do ambiente (nome, marca, PPP, valores, logo). O que estava preso
 * no motor era o CONTEÚDO: cargos, competências, personas e o Top 5. Um segundo
 * segmento (rede de escolas) não muda a identidade, muda o elenco — por isso o
 * roster é a segunda dimensão do perfil, e vive aqui como DADO.
 *
 * O que este arquivo NÃO contém: régua de DISC, derivação de `comp_*`/`lid_*`,
 * merge de artefatos, ordem de seed. Isso é motor, e segue no reset.
 */

import type { DemoRoster } from '@/lib/demo/rosters/types';
// O funil do ACME é DERIVADO (mapeados -> fatia em jornada -> concluídos por
// exclusão), com asserções de coerência no próprio arquivo. O roster referencia
// essas constantes em vez de copiar as listas: uma cópia divergiria em silêncio
// na primeira vez que alguém mexesse em um dos dois lados.
import {
  ACME_DEMO_BEHIND_KEYS,
  ACME_DEMO_REPORT_DIRECTORY,
  ACME_DEMO_CONCLUDED_KEYS,
  ACME_DEMO_JOURNEY_KEYS,
  ACME_DEMO_SYNTHETIC_MAPPED_KEYS,
  ACME_DEMO_WITHOUT_PROFILE_KEYS,
} from '@/lib/demo/acme-rh-report-fixture';
import { REGUA_ACME } from '@/lib/demo/acme-evolucao-fixture';

// Gerente Comercial sai do FIXTURE (o acme não tinha competências/cenários do
// cargo — só o cargo+Top5) e é construído fresco em DEMO_EXTRA_ROLES (pacote
// completo). Diretor Geral segue removido da demo.
export const DEMO_EXCLUDED_ROLES = new Set(['Diretor Geral', 'Gerente Comercial']);

export const REPRESENTANTE_TOP5 = [
  'Comunicação e Apresentação de Valor',
  'Negociação e Fechamento',
  'Relacionamento e Pós-venda',
  'Resiliência e Constância',
  'Orientação a Metas e Resultados',
];

export const REPRESENTANTE_FOCO = ['Negociação e Fechamento'];

export const COMERCIAL_AREA = 'Comercial';
export const DEMO_MANAGER = {
  nome: 'Carla Menezes',
  email: 'carla.demo@vertho.ai',
  whatsapp: null as string | null,
};

/**
 * A administradora da empresa vive no mesmo tenant, mas NÃO é uma participante
 * da jornada. Mantê-la fora de `PERSONAS` é deliberado: aquela lista passa pela
 * régua DISC, recebe artefatos e entra no ranking; o papel `rh` só consome o
 * panorama e os relatórios da organização.
 */
export const DEMO_RH_PERSONA = {
  key: 'helena',
  nome_completo: 'Helena Duarte',
  email: 'helena.demo@vertho.ai',
  cargo: 'Gerente de Recursos Humanos',
  role: 'rh',
  area_depto: 'Recursos Humanos',
} as const;

export const DEMO_EXTRA_ROLES = [
  {
    nome: 'Analista Financeiro',
    codPrefix: 'FIN',
    ehLideranca: false,
    area_depto: 'Financeiro',
    pilar: 'Finanças',
    descricao: 'Profissional responsável por organizar informações financeiras, apoiar o fechamento mensal, acompanhar orçamento, analisar variações e produzir insumos confiáveis para decisões de gestão.',
    principais_entregas: 'Relatórios financeiros confiáveis; conciliações e fechamentos no prazo; análise de desvios orçamentários; apoio a decisões de custo, margem e caixa; comunicação clara de riscos e oportunidades.',
    stakeholders: 'Controladoria, contabilidade, gestores de área, diretoria, compras, comercial e auditoria.',
    decisoes_recorrentes: 'Quais variações investigar primeiro; quando escalar inconsistências; como priorizar demandas de fechamento versus análises gerenciais; que premissas usar em projeções.',
    tensoes_comuns: 'Prazos curtos de fechamento; dados incompletos; pressão por respostas rápidas; divergências entre áreas; necessidade de precisão sem travar a operação.',
    contexto_cultural: 'Ambiente orientado a dados, prazos e confiabilidade, com forte necessidade de organização, critério técnico e comunicação objetiva.',
    competencias_foco: [
      'Controle, Precisão e Confiabilidade dos Dados',
      'Análise de Indicadores Financeiros',
    ],
    competencias: [
      ['Controle, Precisão e Confiabilidade dos Dados', 'Capacidade de revisar informações financeiras, identificar inconsistências e garantir bases confiáveis antes de reportar números.'],
      ['Análise de Indicadores Financeiros', 'Capacidade de interpretar variações, margens, custos e tendências para apoiar decisões de gestão.'],
      ['Organização de Rotinas e Prazos', 'Capacidade de cumprir ciclos de fechamento, conciliação e reporte sem perder qualidade.'],
      ['Comunicação Financeira para Não Especialistas', 'Capacidade de explicar números, riscos e premissas de forma clara para gestores de outras áreas.'],
      ['Critério e Ética no Tratamento de Informações', 'Capacidade de lidar com dados sensíveis com confidencialidade, responsabilidade e independência técnica.'],
    ],
  },
  {
    nome: 'Coordenador de Operações',
    codPrefix: 'OPS',
    ehLideranca: true,
    area_depto: 'Operações',
    pilar: 'Operações',
    descricao: 'Profissional responsável por coordenar rotinas operacionais, organizar prioridades do time, resolver gargalos do dia a dia e garantir que processos, prazos e padrões de qualidade sejam cumpridos.',
    principais_entregas: 'Execução operacional dentro do prazo; redução de gargalos; priorização clara do time; melhoria contínua dos processos; comunicação fluida entre áreas.',
    stakeholders: 'Equipe operacional, gerência, comercial, atendimento, fornecedores, logística, financeiro e clientes internos.',
    decisoes_recorrentes: 'Como redistribuir demandas; que urgência atender primeiro; quando escalar desvios; como equilibrar qualidade, prazo e capacidade do time.',
    tensoes_comuns: 'Mudanças de prioridade; sobrecarga do time; falhas de comunicação entre áreas; urgências simultâneas; pressão por produtividade sem perda de qualidade.',
    contexto_cultural: 'Ambiente prático, dinâmico e orientado à execução, no qual liderança próxima, previsibilidade e solução rápida de problemas fazem diferença.',
    competencias_foco: ['Priorização e Gestão da Rotina Operacional'],
    competencias: [
      ['Priorização e Gestão da Rotina Operacional', 'Capacidade de organizar demandas, sequenciar atividades e manter o time focado no que gera mais impacto.'],
      ['Resolução de Problemas e Gargalos', 'Capacidade de diagnosticar causas, agir rapidamente e prevenir recorrência de problemas operacionais.'],
      ['Liderança de Equipe e Alinhamento Diário', 'Capacidade de orientar pessoas, distribuir responsabilidades e manter cadência de execução.'],
      ['Melhoria Contínua de Processos', 'Capacidade de revisar fluxos, eliminar desperdícios e padronizar boas práticas.'],
      ['Comunicação entre Áreas', 'Capacidade de alinhar expectativas, negociar prioridades e evitar ruídos entre operação, comercial e atendimento.'],
    ],
  },
  {
    nome: 'Gerente Comercial',
    codPrefix: 'GER',
    ehLideranca: true,
    area_depto: 'Comercial',
    pilar: 'Comercial',
    descricao: 'Profissional responsável por liderar a equipe de vendas, traduzir metas em estratégia executável, desenvolver vendedores, acompanhar indicadores e destravar negociações críticas para garantir previsibilidade e crescimento da receita.',
    principais_entregas: 'Atingimento consistente da meta do time; pipeline previsível e saudável; vendedores em evolução; forecast confiável; suporte a deals estratégicos; leitura de mercado traduzida em prioridades.',
    stakeholders: 'Equipe de vendas, diretoria comercial, marketing, produto, financeiro, clientes estratégicos e RH.',
    decisoes_recorrentes: 'Onde concentrar esforço (contas/territórios); em quem investir desenvolvimento; quando entrar pessoalmente num deal; como redistribuir metas; que indicadores cobrar primeiro.',
    tensoes_comuns: 'Pressão por meta versus desenvolvimento do time; deals travados; forecast otimista versus realidade; sobrecarga entre gerir e executar; conflito entre volume e qualidade de pipeline.',
    contexto_cultural: 'Ambiente de alta cobrança por resultado, ritmo acelerado e remuneração variável, no qual liderança próxima, previsibilidade e desenvolvimento de pessoas fazem a diferença.',
    competencias_foco: ['Coaching e Desenvolvimento de Vendedores'],
    competencias: [
      ['Coaching e Desenvolvimento de Vendedores', 'Capacidade de desenvolver a equipe por meio de feedback, acompanhamento individual e planos de evolução que elevam a performance de cada vendedor.'],
      ['Inteligência de Mercado e Visão Competitiva', 'Capacidade de ler o mercado, monitorar concorrência e traduzir tendências em posicionamento e prioridades comerciais.'],
      ['Negociação Estratégica e Suporte a Deals', 'Capacidade de entrar em negociações complexas, destravar deals críticos e orientar o time em condições, concessões e fechamento.'],
      ['Planejamento Comercial, Priorização e Execução de Estratégia', 'Capacidade de traduzir metas em plano de ação, priorizar territórios e contas e garantir execução consistente da estratégia comercial.'],
      ['Gestão de Performance, Indicadores e Accountability', 'Capacidade de acompanhar indicadores, cobrar resultados com clareza e sustentar uma cultura de responsabilidade e previsibilidade no funil.'],
    ],
  },
];

export const PERSONAS = [
  { key: 'ana', nome_completo: 'Ana Martins', email: 'ana.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'IS', d_natural: 31, i_natural: 80, s_natural: 51, c_natural: 38, scenario: 'novo', responder: [] as string[] },
  { key: 'paulo', nome_completo: 'Paulo Demo', email: 'paulo.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'IC', d_natural: 36, i_natural: 84, s_natural: 18, c_natural: 62, scenario: 'parcial', responder: ['Negociação e Fechamento', 'Orientação a Metas e Resultados'] },
  { key: 'bruna', nome_completo: 'Bruna Costa', email: 'bruna.demo@vertho.ai', cargo: 'Representante Comercial', role: 'colaborador', area_depto: COMERCIAL_AREA, gestor_nome: DEMO_MANAGER.nome, gestor_email: DEMO_MANAGER.email, gestor_whatsapp: DEMO_MANAGER.whatsapp, perfil_dominante: 'CS', d_natural: 24, i_natural: 27, s_natural: 69, c_natural: 80, scenario: 'completo', responder: REPRESENTANTE_TOP5 },
  { key: 'carla', nome_completo: 'Carla Menezes', email: 'carla.demo@vertho.ai', cargo: 'Gerente Comercial', role: 'gestor', area_depto: COMERCIAL_AREA, gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'D', d_natural: 79, i_natural: 49, s_natural: 29, c_natural: 43, scenario: 'gestor-parcial', responder: [] as string[] },
  { key: 'mariana', nome_completo: 'Mariana Lopes', email: 'mariana.demo@vertho.ai', cargo: 'Analista Financeiro', role: 'colaborador', area_depto: 'Financeiro', gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'CS', d_natural: 22, i_natural: 34, s_natural: 65, c_natural: 79, scenario: 'completo', estiloResposta: 'forte' as const, responder: [
    'Controle, Precisão e Confiabilidade dos Dados',
    'Análise de Indicadores Financeiros',
    'Organização de Rotinas e Prazos',
    'Comunicação Financeira para Não Especialistas',
    'Critério e Ética no Tratamento de Informações',
  ] },
  { key: 'renato', nome_completo: 'Renato Alves', email: 'renato.demo@vertho.ai', cargo: 'Coordenador de Operações', role: 'colaborador', area_depto: 'Operações', gestor_nome: null as string | null, gestor_email: null as string | null, gestor_whatsapp: null as string | null, perfil_dominante: 'DS', d_natural: 61, i_natural: 37, s_natural: 57, c_natural: 45, scenario: 'novo', responder: [] as string[] },
];

/**
 * Quem atende cada papel da sala de apresentação. É elenco, não motor: numa
 * rede de escolas as três visões continuam existindo (participante, liderança e
 * quem administra o programa), mas com outras pessoas e outro vocabulário.
 */
export const SALA_COMERCIAL = [
  { presentationRoleKey: 'usuario', visao: 'Participante', nome: 'Bruna Costa', email: 'bruna.demo@vertho.ai', role: 'colaborador', nextPath: '/dashboard' },
  { presentationRoleKey: 'gestor', visao: 'Liderança', nome: 'Carla Menezes', email: 'carla.demo@vertho.ai', role: 'gestor', nextPath: '/dashboard/gestor' },
  { presentationRoleKey: 'rh', visao: 'RH', nome: DEMO_RH_PERSONA.nome_completo, email: DEMO_RH_PERSONA.email, role: DEMO_RH_PERSONA.role, nextPath: '/dashboard' },
] as const;

/**
 * As respostas que as personas dão no assessment. Vieram VERBATIM do motor do
 * reset (`respostasPara` / `respostasFortesFinanceiro`): o vocabulário é o do
 * segmento, e é justamente por isso que ele não pode morar no motor.
 */
export function respostaComercialPadrao(competencia: string, persona: { nome_completo: string }) {
  return {
    r1: `Eu começaria delimitando o problema principal antes de agir. No caso de ${competencia}, eu separaria fatos, interesses do cliente e riscos comerciais para evitar uma resposta automática.`,
    r2: 'Minha ação seria combinar uma conversa objetiva com registro no CRM e um próximo passo claro. Eu priorizaria o que preserva valor para o cliente sem comprometer margem ou previsibilidade.',
    r3: 'O critério seria equilibrar relação, resultado e sustentabilidade. Uma decisão boa precisa resolver o curto prazo sem criar dependência ou promessa difícil de cumprir depois.',
    r4: 'Eu acompanharia indicadores e pediria feedback. Também observaria onde minha reação inicial poderia ter sido impulsiva ou defensiva, para ajustar a próxima abordagem.',
    representatividade: persona.nome_completo === 'Bruna Costa' ? 9 : 8,
  };
}

export function respostaComercialForte(competencia: string) {
  const c = competencia.toLowerCase();
  return {
    r1: `Antes de agir eu isolo o problema central e valido a base. Em ${c}, cruzo as fontes, encontro a inconsistência na origem e separo erro de lançamento de efeito real de negócio — para não reportar um número que induza a diretoria a uma decisão errada.`,
    r2: 'Corrijo na origem e deixo rastro auditável: reconcilio contra o razão, ajusto o lançamento, registro a premissa e comunico o impacto na margem antes do fechamento. Priorizo o que trava a decisão da gestão, sem estourar o prazo do ciclo.',
    r3: 'Meu critério é confiabilidade acima de velocidade: prefiro entregar um número auditável com uma ressalva explícita a um número redondo sem lastro. Sinalizo cedo o que ainda está em verificação e negocio prazo quando a precisão exige.',
    r4: 'Depois comparo previsto versus realizado, meço quantas correções vieram da minha revisão e atualizo o checklist de fechamento na causa-raiz. Se algo passou, ajusto o controle para não repetir e explico o aprendizado para a área.',
    representatividade: 9,
  };
}

/**
 * O elenco comercial, montado. `acme-demo` e `gruposinal` usam este mesmo
 * roster: o que os distingue é a identidade da empresa, não o conteúdo.
 */
export const ROSTER_COMERCIAL: DemoRoster = {
  key: 'comercial',
  cargoPrincipal: 'Representante Comercial',
  cargoPrincipalTop5: REPRESENTANTE_TOP5,
  cargoPrincipalFoco: REPRESENTANTE_FOCO,
  cargosExcluidosDoFixture: DEMO_EXCLUDED_ROLES,
  cargosConstruidos: DEMO_EXTRA_ROLES,
  personas: PERSONAS,
  administradora: DEMO_RH_PERSONA,
  salaApresentacao: SALA_COMERCIAL.map((acesso) => ({ ...acesso })),
  respostas: {
    padrao: (competencia, persona) => respostaComercialPadrao(competencia, persona),
    forte: (competencia) => respostaComercialForte(competencia),
  },

  // ── O que era código específico do ACME dentro do reset ──────────────────
  //
  // Estes quatro campos não mudam nada do que o tenant mostra hoje: eles
  // apenas movem a MESMA informação do `if (slug === DEMO_SLUG)` para a
  // declaração do roster. O ganho é que o motor genérico passa a enxergá-la —
  // e toda capacidade que nasce no caminho do roster (percurso da persona,
  // cadência, sinais de engajamento) vale para o ACME sem uma linha a mais.
  // As pessoas de APOIO do ambiente: dão escala ao panorama e equipe ao gestor,
  // sem serem navegáveis. O `gruposinal` usa este mesmo roster e passa a ter o
  // mesmo elenco do ACME — decisão do dono (03/09/2026): o que distingue os dois
  // ambientes é a identidade da empresa, não o conteúdo. Foi o que permitiu
  // apagar a ÚLTIMA ramificação por slug do motor de seed.
  diretorio: ACME_DEMO_REPORT_DIRECTORY.map((pessoa) => ({ ...pessoa })),
  reguaEvolucao: REGUA_ACME,
  panorama: {
    semPerfil: [...ACME_DEMO_WITHOUT_PROFILE_KEYS],
    mapeados: [...ACME_DEMO_SYNTHETIC_MAPPED_KEYS],
    // Em jornada = quem não concluiu, MENOS as personas navegáveis.
    //
    // O panorama descreve as pessoas de APOIO; quem a demo abre na tela tem
    // estado real, construído pelo motor, e o seed sintético por cima disso
    // colide no progresso que já existe (`bruna` é a persona de vitrine do
    // ACME e entra em `ACME_DEMO_JOURNEY_KEYS` justamente por estar em jornada).
    // Concluídos e em jornada seguem disjuntos: alguém nas duas listas é a
    // contradição que mais estraga a apresentação.
    emJornada: ACME_DEMO_JOURNEY_KEYS.filter((key) => (
      !ACME_DEMO_CONCLUDED_KEYS.includes(key)
      && !PERSONAS.some((persona) => persona.key === key)
    )),
    concluidos: [...ACME_DEMO_CONCLUDED_KEYS],
    /**
     * Quem perdeu a cadência: os dois gestores e uma pessoa de operações. A
     * escolha não é decorativa — são os únicos do cargo deles entre quem entrou
     * em jornada, e deixá-los concluir produziria competências medidas com UMA
     * pessoa no painel de evolução, ao lado de médias de nove.
     */
    atrasados: [...ACME_DEMO_BEHIND_KEYS],
  },
};
