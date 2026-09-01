/**
 * Formato de um ROSTER de demonstração: o elenco de um segmento.
 *
 * Um tenant demo é a soma de duas coisas: a IDENTIDADE (nome, marca, PPP,
 * valores — `DEMO_TENANT_PROFILES`) e o ROSTER (cargos, competências, personas).
 * A primeira já era parametrizada; a segunda estava presa no motor do reset,
 * e é ela que muda quando o segmento muda.
 */

/**
 * Cargo construído no CÓDIGO (não vem do fixture): competências, descritores,
 * Top 10 e cenários nascem daqui.
 *
 * `codPrefix` e `ehLideranca` são DADO, não regra. O motor os derivava do nome
 * ('Analista' → FIN, quem contém 'Coordenador'/'Gerente' é liderança), o que
 * funcionava por acidente num elenco só: num roster escolar, "Coordenação
 * Pedagógica" casaria a heurística por outro motivo, e "Professor(a)" não
 * casaria nenhuma.
 */
export type DemoRosterCargo = {
  nome: string;
  codPrefix: string;
  ehLideranca: boolean;
  area_depto: string;
  pilar: string;
  descricao: string;
  principais_entregas: string;
  stakeholders: string;
  decisoes_recorrentes: string;
  tensoes_comuns: string;
  contexto_cultural: string;
  competencias_foco: string[];
  /** [nome, descrição] por competência; os descritores N1-N4 saem do motor. */
  competencias: string[][];
};

/** Persona navegável: passa pela régua DISC, recebe artefatos e entra no ranking. */
export type DemoRosterPersona = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: string;
  area_depto: string;
  gestor_nome: string | null;
  gestor_email: string | null;
  gestor_whatsapp: string | null;
  perfil_dominante: string;
  d_natural: number;
  i_natural: number;
  s_natural: number;
  c_natural: number;
  scenario: string;
  /** Competências que a persona responde no assessment (vazio = só diagnóstico). */
  responder: string[];
  /**
   * Qual conjunto de respostas o seed usa. `forte` é para a persona que a demo
   * mostra no melhor caso (avaliação alta, jornada completa).
   */
  estiloResposta?: 'padrao' | 'forte';
};

/**
 * Quem administra o programa no tenant. Fica FORA das personas de propósito:
 * não percorre a jornada, não tem DISC e não entra no ranking — só consome o
 * panorama e os relatórios.
 */
export type DemoRosterAdministradora = {
  key: string;
  nome_completo: string;
  email: string;
  cargo: string;
  role: string;
  area_depto: string;
};

/** Um descritor da régua: o que a avaliação mede dentro de uma competência. */
export type DemoRosterDescritor = {
  suffix: string;
  nome_curto: string;
  descritor_completo: string;
  n1_gap: string;
  n2_desenvolvimento: string;
  n3_meta: string;
  n4_referencia: string;
  evidencias_esperadas: string;
  perguntas_alvo: string;
};

/** O que uma persona responde no assessment de uma competência. */
export type DemoRespostaSemeada = {
  r1: string;
  r2: string;
  r3: string;
  r4: string;
  representatividade: number;
};

/** Um papel da sala de apresentação, e a persona que o atende. */
export type DemoRosterSalaAcesso = {
  presentationRoleKey: string;
  visao: string;
  nome: string;
  email: string;
  role: string;
  nextPath: string;
};

export type DemoRoster = {
  key: string;
  /**
   * Cargo que vem do FIXTURE e tem o Top 5 fixado pelo roster. O fixture guarda
   * o Top 5 histórico da origem; para o cargo principal a ordem é decisão de
   * demonstração, não herança.
   *
   * `null` quando TODOS os cargos do roster nascem construídos — aí não há
   * cargo herdado para reordenar, e nada no fixture responde por este elenco.
   */
  cargoPrincipal: string | null;
  cargoPrincipalTop5: string[];
  cargoPrincipalFoco: string[];
  /** Cargos do fixture que o roster NÃO semeia (vêm construídos, ou saíram). */
  cargosExcluidosDoFixture: Set<string>;
  cargosConstruidos: DemoRosterCargo[];
  personas: DemoRosterPersona[];
  administradora: DemoRosterAdministradora;
  /** Quem abre cada visão da sala ao vivo (participante, liderança, programa). */
  salaApresentacao: DemoRosterSalaAcesso[];
  /**
   * O texto que as personas respondem. É ELENCO, não motor: o comercial fala em
   * CRM, cliente e margem, e uma diretora de escola dizendo "risco comercial"
   * entrega a demo errada — além de a IA4 avaliar esse jargão como se fosse a
   * resposta da pessoa.
   */
  respostas: {
    padrao: (competencia: string, persona: DemoRosterPersona) => DemoRespostaSemeada;
    forte?: (competencia: string, persona: DemoRosterPersona) => DemoRespostaSemeada;
  };
  /**
   * A RÉGUA por `${cargo}::${competência}`. Sem ela o motor cai num gerador
   * genérico ("Leitura do contexto", "Comunicação com stakeholders", com o mesmo
   * N1-N4 em toda competência) — que aparece na tela E é o que a IA3 e a IA4
   * leem: os primeiros cenários escolares saíram com mapa incoerente porque as
   * perguntas eram do segmento e a régua não.
   */
  descritores?: Record<string, DemoRosterDescritor[]>;
  /**
   * Modo do programa das personas (`colaboradores.programa_modo`). O default do
   * produto é o DUO de 14 semanas, que cobre MAIS DE UMA competência — e uma
   * trilha só nasce se todas elas tiverem conteúdo. Numa escola o formato é a
   * jornada de 7 semanas, com uma competência.
   */
  programaModo?: string;
  /**
   * Unidades da organização (as escolas de uma rede). Ausente num elenco de
   * empresa única, onde a área do colaborador já basta.
   */
  unidades?: Array<{ nome: string; segmentos: string; porte: string }>;
};
