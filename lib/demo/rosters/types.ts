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
   * Pessoas que dão ESCALA ao panorama sem serem personas navegáveis: não têm
   * credencial, não entram na sala e não recebem artefato congelado. Existem
   * para o gestor ter equipe e o funil ter denominador.
   */
  diretorio?: Array<{
    key: string;
    nome_completo: string;
    email: string;
    cargo: string;
    role: string;
    area_depto: string;
    gestor_nome: string | null;
    gestor_email: string | null;
    d_natural: number;
    i_natural: number;
    s_natural: number;
    c_natural: number;
  }>;
  /**
   * O FUNIL que a visão de programa mostra. Sem isto, um ambiente novo abre com
   * todo mundo parado na primeira etapa — o que não é a foto de uma operação,
   * é a foto de um tenant recém-criado.
   *
   * As pessoas aqui são as de apoio: o estado delas é sintético (assessments e
   * trilhas sem IA), e serve para o denominador existir. As personas navegáveis
   * continuam com o estado REAL delas.
   */
  /**
   * Régua de EVOLUÇÃO do ambiente: o que a vitrine grava em
   * `trilhas.evolution_report` de quem aparece em `panorama.concluidos`.
   *
   * Sem ela, a jornada fecha e o painel de Evolução continua vazio — o veredito
   * só existe se o relatório existir. Fica no roster porque a fala é do
   * SEGMENTO: a mecânica é única (`lib/demo/evolucao-nucleo`), o vocabulário
   * não.
   */
  reguaEvolucao?: import('@/lib/demo/evolucao-nucleo').ReguaDeEvolucao;
  panorama?: {
    /** Quem ainda não concluiu o perfil comportamental. */
    semPerfil?: string[];
    /** Quem tem o Top 5 do cargo inteiro avaliado. */
    mapeados?: string[];
    /** Jornada em andamento. */
    emJornada?: string[];
    /** Jornada encerrada — é o que libera a tela de evolução. */
    concluidos?: string[];
  };
  /**
   * Cargos que existem para ADEQUAÇÃO, não para jornada: entram no ranking (o
   * fit lê as colunas comportamentais) e têm o Top 5 zerado, para a tela não
   * convidar ao mapeamento quem não participa dele. É o mesmo tratamento que o
   * cargo de gestão recebe no elenco comercial.
   */
  cargosSemAssessment?: string[];
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
  /**
   * O VÍDEO de uma semana da jornada.
   *
   * O vídeo não vem de `micro_conteudos` como texto, áudio e case: ele é
   * resolvido AO VIVO pela célula (`videos_gerados` por módulo × empresa ×
   * cargo × DISC), e `formatos_disponiveis` nunca o contém. Para o chip de
   * vídeo existir na demo é preciso, então, que o módulo-base e a célula
   * existam — e ambos são recriados a cada reset, ou o card some.
   *
   * Os UUIDs são FIXOS de propósito: o reset precisa reencontrar o MESMO módulo
   * e a MESMA célula, senão cada noite deixa uma órfã para trás.
   */
  /**
   * Onde a persona NAVEGÁVEL está na jornada dela.
   *
   * O plano dela é real (construído pelo motor, com conteúdo em toda semana), e
   * por isso ela fica de fora de `panorama` — mas sem PROGRESSO ela aparecia
   * parada na semana 1, e o card "Ação esta semana" do gestor mostrava uma
   * persona de apoio, cuja jornada é um esqueleto.
   *
   * `emAndamento` deve ser uma semana de CHECKPOINT do programa
   * (`semanasCheckpoint`): é o que faz a pessoa entrar naquele card. E a
   * `data_inicio` da trilha é recuada para o calendário cair nessa semana —
   * `primeiraSemanaAcessivel` parte do calendário e só DESCE, então sem o recuo
   * a tela abriria na semana 1 com três semanas concluídas atrás dela.
   */
  percursoDaPersona?: {
    /** `key` da persona em `personas`. */
    personaKey: string;
    /** Semanas 1..N marcadas como concluídas. */
    concluidas: number;
    /** Semana em curso (a de checkpoint). Sem ela, só as concluídas entram. */
    emAndamento?: number;
  };
  videoDaJornada?: {
    /** UUID fixo do módulo-base criado para a demo (nunca o de um cliente). */
    moduloId: string;
    /**
     * UUID fixo da competência-base (catálogo GLOBAL) que ancora o módulo.
     *
     * 🔴 O módulo NÃO pode apontar para `competencias` (a tabela por tenant):
     * ela é apagada a cada reset, o módulo fica com os dois vínculos nulos e
     * viola `chk_modulo_competencia`. O delete aborta DEPOIS de já ter limpado
     * colaboradores, trilhas e assessments — o tenant amanhece vazio. Foi o que
     * aconteceu em 02/09/2026. O vídeo do ACME usa `competencia_base_id` pela
     * mesma razão.
     */
    competenciaBaseId: string;
    /** A régua do descritor no catálogo (N1→N4), que também alimenta o roteiro. */
    regua: {
      n1_gap: string;
      n2_desenvolvimento: string;
      n3_meta: string;
      n4_referencia: string;
    };
    /** Identificação da competência-base no catálogo. */
    codComp: string;
    codDesc: string;
    segmento: 'educacao' | 'corporativo';
    pilar: string;
    descricaoCompetencia: string;
    descritorCompleto: string;
    /** UUID fixo da célula em `videos_gerados`. */
    celulaId: string;
    /** Asset já renderizado no Bunny. */
    bunnyVideoId: string;
    /**
     * A versão NOMINAL ("Olá, Fulana"), que a persona vê no lugar do genérico.
     *
     * Mora em `videos_personalizados`, que cascateia com `colaboradores` — e o
     * reset recria as pessoas com ids novos, então a linha some toda noite se
     * não for declarada aqui. O asset em si sobrevive no Bunny.
     */
    nominal?: {
      bunnyVideoId: string;
      /** `key` da persona no elenco (não o e-mail: o id muda a cada reset). */
      personaKey: string;
    };
    /** Competência e descritor da semana que recebe o vídeo. */
    competencia: string;
    descritor: string;
    cargo: string;
    /** 1ª letra do perfil da persona que assiste — a célula é por DISC. */
    disc: 'D' | 'I' | 'S' | 'C';
    titulo: string;
    finalidade: string;
    nivelEntrada: string;
    nivelDestino: string;
    conteudoCentral: Record<string, unknown>;
    conteudoAplicavel: Record<string, unknown>;
    guardaCorpos: Record<string, unknown>;
    adaptacaoPorFormato: Record<string, unknown>;
    tags: string[];
  };
};
