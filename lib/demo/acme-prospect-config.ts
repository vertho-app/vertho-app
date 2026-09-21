export const ACME_PROSPECT_ROLES = [
  {
    key: 'representante-comercial',
    label: 'Representante Comercial',
    cargo: 'Representante Comercial',
    area: 'Comercial',
  },
  // ⚠️ Gerente Comercial SAIU em 16/09/2026: a gestão comercial passou a só
  // liderar (`cargosSemAssessment` do roster comercial), como a coordenação das
  // escolas. Passaporte antigo com esse cargo continua abrindo; a página de
  // boas-vindas oferece só o perfil comportamental a ele.
  {
    key: 'analista-financeiro',
    label: 'Analista Financeiro',
    cargo: 'Analista Financeiro',
    area: 'Financeiro',
  },
  {
    key: 'coordenador-operacoes',
    label: 'Coordenador de Operações',
    cargo: 'Coordenador de Operações',
    area: 'Operações',
  },
] as const;

export type AcmeProspectRoleKey = typeof ACME_PROSPECT_ROLES[number]['key'];

/**
 * Papéis oferecidos na degustação, POR AMBIENTE.
 *
 * O cargo escolhido aqui vira o `cargo` do colaborador convidado, e é por ele
 * que a etapa 01 acha o Top 5 e o cenário. Logo, só entra cargo que tem MATRIZ
 * no tenant — `Medido 01/09/2026:` no `escolas-acme`, Professor(a) e
 * Coordenador(a) Pedagógico(a) têm competências e cenário A gerado; Diretor(a)
 * Escolar não tem, e é de propósito (a direção administra o programa e fica
 * fora da jornada). Oferecer um cargo sem matriz produziria uma degustação que
 * morre em "Cenário para X ainda não foi gerado" na frente do prospect.
 */
export const DEMO_PROSPECT_ROLES_POR_AMBIENTE = {
  'acme-demo': ACME_PROSPECT_ROLES,
  // O Grupo Sinal aponta para a MESMA lista do ACME, e não para uma cópia: ele
  // usa o roster comercial (decisão do dono em 03/09/2026 — o que distingue os
  // dois ambientes é a identidade da empresa, não o conteúdo), então os cargos
  // que percorrem a jornada lá são exatamente estes. Uma cópia envelheceria
  // sozinha no dia em que o roster comercial ganhasse ou perdesse um cargo, e a
  // divergência só apareceria na frente do prospect.
  gruposinal: ACME_PROSPECT_ROLES,
  'escolas-acme': [
    {
      key: 'professor',
      label: 'Professor(a)',
      cargo: 'Professor(a)',
      area: 'Docência',
    },
    // ⚠️ Coordenador(a) Pedagógico(a) SAIU em 08/09/2026, e o motivo vale para
    // qualquer cargo futuro: ele está em `cargosSemAssessment` do roster
    // escolar, ou seja, tem o Top 5 zerado DE PROPÓSITO — a coordenação existe
    // para adequação e gestão de equipe, não para percorrer a jornada. Um cargo
    // sem Top 5 não tem competência nem cenário, então a degustação dele morria
    // na etapa 01 com "Cenário ainda não foi gerado", na frente do prospect.
    //
    // As duas decisões (oferecer o cargo · zerar o Top 5) entraram com um dia de
    // diferença e nenhuma das duas estava errada sozinha. Hoje
    // `tests/unit/degustacao-cargo-com-matriz.test.ts` cruza as duas listas.
  ],
} as const;

export type DemoProspectAmbienteSlug = keyof typeof DEMO_PROSPECT_ROLES_POR_AMBIENTE;

/** Papéis do ambiente, ou os do ACME para quem ainda não oferece degustação. */
export function papeisDaDegustacao(slug: string) {
  if (!Object.prototype.hasOwnProperty.call(DEMO_PROSPECT_ROLES_POR_AMBIENTE, slug)) return ACME_PROSPECT_ROLES;
  return (DEMO_PROSPECT_ROLES_POR_AMBIENTE as Record<string, readonly any[]>)[slug];
}

/** O papel dentro do ambiente — `null` se ele não pertence àquele elenco. */
export function getPapelDaDegustacao(slug: string, key: unknown) {
  return papeisDaDegustacao(slug).find((role) => role.key === key) ?? null;
}

/**
 * Qual roteiro o vendedor manda.
 *
 * - `A`: quatro links; o da etapa 01 loga direto (e o robô de preview do
 *   WhatsApp "entra" junto, porque o GET cria a sessão).
 * - `B` (16/09/2026): um link só, para a página de boas-vindas
 *   (`/degustacao`), que não cria sessão. Primeiro as visões prontas; o perfil
 *   comportamental vira convite opcional.
 *
 * Linha sem versão é A: é o que todo passaporte anterior à mig 256 foi.
 */
export const DEGUSTACAO_VERSOES = ['A', 'B'] as const;
export type DegustacaoVersao = typeof DEGUSTACAO_VERSOES[number];

export type AcmeProspectExperienceInput = {
  nome: string;
  empresa: string;
  roleKey: AcmeProspectRoleKey;
  /** Ausente vale A. */
  versao?: DegustacaoVersao;
};

export type AcmeProspectExperienceAccess = {
  sessionId: string;
  nome: string;
  empresa: string;
  cargo: string;
  url: string;
  expiresAt: string;
  versao: DegustacaoVersao;
};

export const ACME_PROSPECT_EXPERIENCE_VIEWS = [
  {
    roleKey: 'usuario',
    number: '02',
    title: 'Veja como colaborador',
    description: 'Explore uma jornada preenchida pela perspectiva de quem participa.',
  },
  {
    roleKey: 'gestor',
    number: '03',
    title: 'Veja como gestor',
    description: 'Veja a leitura de equipe, a adequação e o desenvolvimento da liderança.',
  },
  {
    roleKey: 'rh',
    number: '04',
    title: 'Veja como RH',
    description: 'Veja o panorama organizacional, os indicadores e os relatórios de RH.',
  },
] as const;

export type AcmeProspectPresentationRoleKey = typeof ACME_PROSPECT_EXPERIENCE_VIEWS[number]['roleKey'];

export type AcmeProspectPresentationAccess = {
  roleKey: AcmeProspectPresentationRoleKey;
  url: string;
};

export type AcmeProspectExperienceShareAccess = AcmeProspectExperienceAccess & {
  views: readonly AcmeProspectPresentationAccess[];
};

export type AcmeProspectExperienceStep = {
  number: '01' | '02' | '03' | '04';
  title: string;
  description: string;
  url: string;
  note: string;
};

export type AcmeProspectProgress = {
  sessionId: string;
  /** E-mail técnico da conta, com o prefixo do ambiente (não se remonta: lê-se). */
  authEmail: string;
  nome: string;
  empresa: string;
  cargo: string;
  createdAt: string;
  expiresAt: string;
  versao: DegustacaoVersao;
  /** Abertura VERIFICADA do convite (só a versão B registra). */
  conviteAbertoEm: string | null;
  personalAccessedAt: string | null;
  discCompletedAt: string | null;
  colaboradorAccessedAt: string | null;
  gestorAccessedAt: string | null;
  rhAccessedAt: string | null;
  /** Primeira resposta da situação do cargo, lida de `respostas`. */
  situacaoRespondidaEm: string | null;
  accessClosedAt: string | null;
};

/**
 * Como a pessoa entrou no tenant de demonstração:
 *
 * - `passaporte`: veio do botão "preparar experiência", tem linha em
 *   `demo_prospect_sessions`, prazo D+10 e as três visões da apresentação.
 * - `cadastro`: é um colaborador do tenant que não faz parte do elenco fixo
 *   (convidado nomeado do seed, como o Alpheu no Grupo Sinal, ou alguém
 *   cadastrado à mão). Não tem prazo nem visões; só entrada e DISC.
 */
export type DemoGuestOrigin = 'passaporte' | 'cadastro';

/**
 * Linha do acompanhamento comercial. Une as duas origens acima: o cartão do
 * `cadastro` só preenche as duas primeiras marcas, porque as visões 02–04 não
 * existem fora do passaporte (dizer "Aguardando" nelas seria inventar uma
 * etapa que ninguém pode cumprir).
 *
 * `personalAccessedAt` no `passaporte` é o PRIMEIRO acesso, carimbado pelo app;
 * no `cadastro` é o último login do Supabase Auth, o único registro que existe.
 * Para o que o painel responde (entrou ou não entrou) os dois servem.
 */
export type DemoGuestProgress = {
  id: string;
  origem: DemoGuestOrigin;
  nome: string;
  /** Empresa do prospect (passaporte) ou e-mail do convidado (cadastro). */
  contexto: string;
  cargo: string;
  createdAt: string;
  expiresAt: string | null;
  /** Só o passaporte tem roteiro; o cadastro vem `null`. */
  versao: DegustacaoVersao | null;
  conviteAbertoEm: string | null;
  personalAccessedAt: string | null;
  discCompletedAt: string | null;
  colaboradorAccessedAt: string | null;
  gestorAccessedAt: string | null;
  rhAccessedAt: string | null;
  situacaoRespondidaEm: string | null;
  accessClosedAt: string | null;
};

export const ACME_PROSPECT_AUTH_PREFIX = 'convidado.acme.';
export const ACME_PROSPECT_AUTH_SUFFIX = '@vertho.ai';
export const ACME_PROSPECT_AUTH_MARKER = 'acme-prospect-experience-v1';
export const ACME_PROSPECT_SESSION_PATTERN = /^[a-f0-9]{20}$/;

/**
 * Ambientes de demonstração que oferecem degustação self-service.
 *
 * 🔑 **O prefixo do e-mail é o que separa um ambiente do outro no Auth.** A
 * conta do convidado não guarda tenant em lugar nenhum: o marcador
 * (`vertho_demo_access`) é o mesmo para todos e a tabela `demo_prospect_sessions`
 * só é consultada por `empresa_id`. A limpeza varre o Auth atrás de convidados
 * SEM sessão rastreada no tenant e os apaga como resíduo — então, com um prefixo
 * compartilhado, a faxina de um ambiente apagaria os convidados vivos do outro.
 * Um prefixo por tenant mantém cada varredura dentro da própria casa.
 */
export const DEMO_PROSPECT_TENANTS = {
  'acme-demo': {
    slug: 'acme-demo',
    authPrefix: ACME_PROSPECT_AUTH_PREFIX,
  },
  'escolas-acme': {
    slug: 'escolas-acme',
    // Mesmo prefixo que a derivação produziria (`convidado.<slug>.`): registrar
    // com uma forma DIFERENTE criaria duas regras para a mesma coisa, e a conta
    // criada antes do registro deixaria de ser reconhecida pela faxina depois.
    authPrefix: 'convidado.escolas-acme.',
  },
  gruposinal: {
    slug: 'gruposinal',
    authPrefix: 'convidado.gruposinal.',
  },
} as const;

export type DemoProspectTenantSlug = keyof typeof DEMO_PROSPECT_TENANTS;

export function getDemoProspectTenant(slug: string) {
  // `hasOwnProperty`, não indexação: `DEMO_PROSPECT_TENANTS['constructor']` é a
  // função `Object`, verdadeira, e passaria por ambiente registrado.
  if (typeof slug !== 'string' || !Object.prototype.hasOwnProperty.call(DEMO_PROSPECT_TENANTS, slug)) return null;
  return (DEMO_PROSPECT_TENANTS as Record<string, { slug: string; authPrefix: string }>)[slug];
}

/**
 * Prefixo do ambiente. Um tenant ainda não registrado ganha prefixo DERIVADO do
 * próprio slug — nunca o do ACME por omissão: herdar o prefixo do vizinho é
 * exatamente o que faz a faxina de um ambiente apagar o convidado vivo do outro.
 */
export function demoProspectAuthPrefix(slug: string): string {
  const registrado = getDemoProspectTenant(slug);
  if (registrado) return registrado.authPrefix;
  const token = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `convidado.${token || 'demo'}.`;
}

/**
 * E-mail técnico do convidado de passaporte. Deliberadamente NÃO termina em
 * `.demo@vertho.ai`: o filtro canônico (`lib/internal-emails`) trata esta conta
 * como interna e a exclui dos indicadores agregados.
 */
export function acmeProspectAuthEmail(sessionId: string): string {
  return `${ACME_PROSPECT_AUTH_PREFIX}${sessionId}${ACME_PROSPECT_AUTH_SUFFIX}`;
}

/** Igual ao anterior, com o prefixo do ambiente que hospeda o convidado. */
export function demoProspectAuthEmail(slug: string, sessionId: string): string {
  return `${demoProspectAuthPrefix(slug)}${sessionId}${ACME_PROSPECT_AUTH_SUFFIX}`;
}

/**
 * O caminho de volta do e-mail técnico: de QUAL ambiente e de QUAL sessão ele é.
 *
 * 🔴 POR QUE ISTO EXISTE. Quem reconhecia o convidado conhecia um prefixo só, o
 * do ACME (`convidado.acme.`). Quando a degustação passou a existir em outros
 * ambientes, a criação ganhou prefixo por ambiente e os leitores ficaram para
 * trás. `Medido 16/09/2026` nos 3 passaportes do Grupo Sinal: sessão criada no
 * Auth e `personal_accessed_at` nulo nos três (o carimbo nunca reconheceu a
 * conta), o painel não os listava e o cenário deles não era tratado como
 * degustação (sairia o assessment completo, sem avaliação automática).
 *
 * Exige o formato inteiro (prefixo registrado + 20 hex + sufixo), e não só o
 * começo: um e-mail que apenas COMEÇA com o prefixo não é passaporte.
 *
 * ⚠️ A faxina NÃO usa esta função de propósito: ela varre um ambiente por vez,
 * com o prefixo daquele ambiente, para nunca apagar o convidado vivo de outro.
 */
export function lerEmailDePassaporte(
  email: unknown,
): { slug: DemoProspectTenantSlug; sessionId: string } | null {
  const valor = String(email ?? '').trim().toLowerCase();
  if (!valor.endsWith(ACME_PROSPECT_AUTH_SUFFIX)) return null;
  for (const tenant of Object.values(DEMO_PROSPECT_TENANTS)) {
    if (!valor.startsWith(tenant.authPrefix)) continue;
    const sessionId = valor.slice(tenant.authPrefix.length, -ACME_PROSPECT_AUTH_SUFFIX.length);
    if (ACME_PROSPECT_SESSION_PATTERN.test(sessionId)) {
      return { slug: tenant.slug, sessionId };
    }
  }
  return null;
}

function cleanHumanText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAcmeProspectRole(key: unknown) {
  return ACME_PROSPECT_ROLES.find((role) => role.key === key) ?? null;
}

/**
 * Valida a entrada da degustação. O `slug` do ambiente decide QUAL elenco de
 * papéis é aceito: um papel do ACME num roteiro escolar produziria um convidado
 * com cargo sem matriz no tenant, e a etapa 01 morreria em "cenário ainda não
 * gerado" na frente do prospect.
 */
export function validateAcmeProspectExperienceInput(
  input: unknown,
  slug: string = 'acme-demo',
):
  | { ok: true; value: AcmeProspectExperienceInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Preencha os dados do prospect.' };
  }

  const raw = input as Record<string, unknown>;
  const nome = cleanHumanText(raw.nome);
  const empresa = cleanHumanText(raw.empresa);
  const role = getPapelDaDegustacao(slug, raw.roleKey);

  if (nome.length < 2 || nome.length > 100) {
    return { ok: false, error: 'Informe um nome entre 2 e 100 caracteres.' };
  }
  if (empresa.length < 2 || empresa.length > 120) {
    return { ok: false, error: 'Informe uma empresa entre 2 e 120 caracteres.' };
  }
  if (!role) {
    return { ok: false, error: 'Escolha um papel demonstrativo válido.' };
  }
  // Ausente é A (o formulário antigo não mandava versão). Qualquer outro valor é
  // ERRO, nunca A em silêncio: a action é endpoint HTTP, e um valor estranho
  // virar o roteiro antigo sem aviso esconderia o problema de quem chamou.
  const versao = raw.versao === undefined || raw.versao === null || raw.versao === ''
    ? 'A'
    : (DEGUSTACAO_VERSOES as readonly unknown[]).includes(raw.versao)
      ? raw.versao as DegustacaoVersao
      : null;
  if (!versao) {
    return { ok: false, error: 'Escolha uma versão de roteiro válida.' };
  }

  return {
    ok: true,
    value: { nome, empresa, roleKey: role.key, versao },
  };
}

/**
 * O que muda de um ambiente para outro no convite e na página da versão B.
 *
 * Escrito por extenso, sem artigo montado em cima de campo livre: "a
 * coordenação" e "o gestor" não saem de uma regra, e texto que vai para fora com
 * concordância errada desqualifica a conversa antes de ela começar.
 * `tests/unit/degustacao-versao-b.test.ts` cobra uma entrada por ambiente de
 * `DEMO_PROSPECT_TENANTS`.
 */
export type CopiaDaDegustacaoGuiada = {
  /** Onde a pessoa está, dito para ela ("numa empresa de demonstração"). */
  contexto: string;
  /** Quem acompanha, no convite: "o RH e o gestor acompanham". */
  quemAcompanha: string;
  /** Cartões na ORDEM em que aparecem na página. */
  visoes: ReadonlyArray<{
    roleKey: AcmeProspectPresentationRoleKey;
    titulo: string;
    descricao: string;
  }>;
  /** Próximo passo, no fim da página. */
  contato: {
    /** Falando com a pessoa: "Quer ver isso na sua empresa?" */
    titulo: string;
    /** Falando POR ela, no botão e na mensagem pronta: "na minha empresa". */
    minhaCasa: string;
  };
};

const VISOES_EMPRESA: CopiaDaDegustacaoGuiada['visoes'] = [
  {
    roleKey: 'rh',
    titulo: 'O painel do RH',
    descricao: 'O panorama da empresa, os indicadores do programa e os relatórios prontos.',
  },
  {
    roleKey: 'gestor',
    titulo: 'O que o gestor acompanha',
    descricao: 'A equipe, a adequação de cada pessoa ao cargo e onde apoiar o próximo passo.',
  },
  {
    roleKey: 'usuario',
    titulo: 'A jornada de quem participa',
    descricao: 'Diagnóstico, plano de desenvolvimento e a trilha semanal, pelo olhar do colaborador.',
  },
];

export const COPIA_DEGUSTACAO_GUIADA: Record<DemoProspectTenantSlug, CopiaDaDegustacaoGuiada> = {
  'acme-demo': {
    contexto: 'numa empresa de demonstração',
    quemAcompanha: 'o RH e o gestor acompanham',
    visoes: VISOES_EMPRESA,
    contato: { titulo: 'Quer ver isso na sua empresa?', minhaCasa: 'na minha empresa' },
  },
  gruposinal: {
    contexto: 'num ambiente de demonstração',
    quemAcompanha: 'o RH e o gestor acompanham',
    visoes: VISOES_EMPRESA,
    contato: { titulo: 'Quer ver isso na sua empresa?', minhaCasa: 'na minha empresa' },
  },
  'escolas-acme': {
    contexto: 'numa rede de escolas de demonstração',
    quemAcompanha: 'a direção e a coordenação acompanham',
    contato: { titulo: 'Quer ver isso na sua rede?', minhaCasa: 'na minha rede' },
    visoes: [
      {
        roleKey: 'rh',
        titulo: 'O painel da direção',
        descricao: 'O panorama da rede, os indicadores do programa e os relatórios prontos.',
      },
      {
        roleKey: 'gestor',
        titulo: 'O que a coordenação acompanha',
        descricao: 'Os professores, a adequação de cada um à função e onde apoiar o próximo passo.',
      },
      {
        roleKey: 'usuario',
        titulo: 'A jornada do professor',
        descricao: 'Diagnóstico, plano de desenvolvimento e a trilha semanal, pelo olhar de quem dá aula.',
      },
    ],
  },
};

/**
 * Qual visao entra em destaque na pagina de boas-vindas.
 *
 * Hoje e fixa: o convite ainda nao carrega a recomendacao do comercial (decisao
 * de coluna pendente com o dono). Quando carregar, este valor vira o PADRAO de
 * quem nao escolheu, que e exatamente o que o dono pediu para os convites ja
 * enviados. Tres cartoes com o mesmo peso obrigam o lead a decidir sem saber
 * nada da plataforma, e essa decisao e trabalho.
 */
export const VISAO_RECOMENDADA_PADRAO: AcmeProspectPresentationRoleKey = 'rh';

export function copiaDaDegustacaoGuiada(slug: string): CopiaDaDegustacaoGuiada {
  return Object.prototype.hasOwnProperty.call(COPIA_DEGUSTACAO_GUIADA, slug)
    ? COPIA_DEGUSTACAO_GUIADA[slug as DemoProspectTenantSlug]
    : COPIA_DEGUSTACAO_GUIADA['acme-demo'];
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] || nome.trim();
}

/**
 * Convite da versão B: um link, poucas linhas.
 *
 * O texto da A tinha quatro etapas e quatro links, e a primeira era trabalho.
 * `Medido 16/09/2026`: 0 de 8 prospects abriram qualquer uma das visões, que não
 * pedem esforço nenhum. Aqui o convite diz o que a pessoa vê e oferece o perfil
 * como opção.
 *
 * Sem minuto em número (mesma régua do texto da A: duração prometida em texto
 * que sai para o cliente vira dívida) e sem o nome da empresa numa frase que
 * precisaria de artigo.
 */
export function buildDegustacaoConviteText(
  access: { nome: string; url: string; expiresAt: string },
  slug: string,
): string {
  const copia = copiaDaDegustacaoGuiada(slug);
  return [
    `Olá, ${primeiroNome(access.nome)}!`,
    '',
    `Preparei um acesso para você conhecer a Vertho por dentro, ${copia.contexto}. `
      + `Em poucos minutos você vê o que ${copia.quemAcompanha} e, se quiser, descobre o seu perfil comportamental.`,
    '',
    access.url,
    '',
    `O link é só seu e fica ativo até ${formatAcmeProspectExpiry(access.expiresAt)} (horário de Brasília).`,
  ].join('\n');
}

/** Lembrete para quem ainda não abriu: o MESMO link, sem repetir o convite inteiro. */
export function buildDegustacaoLembreteText(access: { nome: string; url: string }): string {
  return [
    `Oi, ${primeiroNome(access.nome)}! Passando para lembrar do acesso à Vertho que preparei para você. `
      + 'Leva poucos minutos:',
    '',
    access.url,
  ].join('\n');
}

/**
 * Para onde o botão pessoal da página leva, por CHAVE. O formulário manda a
 * chave, nunca um caminho: nada que venha do cliente vira destino de redirect.
 *
 * ⚠️ `/dashboard` não entra de propósito: para o convidado B ele volta para a
 * página de boas-vindas, e um destino que redireciona para a origem é laço.
 */
export const DESTINOS_DEGUSTACAO = {
  mapeamento: '/dashboard/perfil-comportamental/mapeamento',
  perfil: '/dashboard/perfil-comportamental',
  assessment: '/dashboard/assessment',
} as const;

export type DestinoDegustacao = keyof typeof DESTINOS_DEGUSTACAO;

export function destinoDaDegustacao(chave: unknown): string | null {
  if (typeof chave !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(DESTINOS_DEGUSTACAO, chave)
    ? DESTINOS_DEGUSTACAO[chave as DestinoDegustacao]
    : null;
}

/**
 * Estado pessoal do convidado, só com booleanos (a página não mostra resultado).
 *
 * ⚠️ Não existe "começou o perfil" aqui, de propósito: o único rastro disso
 * seria `personal_accessed_at`, que nos passaportes da versão A foi carimbado
 * pelo robô de preview. Um passaporte A reenviado como B mostraria "continue
 * seu perfil" a quem nunca abriu nada. Só entra o que é fato no banco.
 */
export type EstadoPessoalDegustacao = {
  discFeito: boolean;
  respondeuSituacao: boolean;
  devolutivaPronta: boolean;
  /**
   * O cargo do convidado tem situação para responder (Top 5 no tenant). Cargo
   * que só lidera não tem: a avaliação dele responde "Nenhuma competência
   * configurada", e oferecer o botão seria levar a pessoa a um beco.
   */
  situacaoDisponivel: boolean;
};

export type PassoPessoalDegustacao =
  | 'descobrir-perfil'
  | 'responder-situacao'
  | 'perfil-pronto'
  | 'aguardar-devolutiva'
  | 'ler-devolutiva';

/**
 * O próximo passo pessoal. A situação do cargo só é oferecida DEPOIS do perfil:
 * a pessoa vê o resultado do DISC antes de lhe pedirem mais trabalho. Para quem
 * só lidera, o perfil é o fim do caminho pessoal.
 */
export function passoPessoalDaDegustacao(estado: EstadoPessoalDegustacao): PassoPessoalDegustacao {
  if (estado.respondeuSituacao) return estado.devolutivaPronta ? 'ler-devolutiva' : 'aguardar-devolutiva';
  if (!estado.discFeito) return 'descobrir-perfil';
  return estado.situacaoDisponivel ? 'responder-situacao' : 'perfil-pronto';
}

/** A seção pessoal sobe para o topo quando a pessoa já avançou nela. */
export function pessoalVemPrimeiro(estado: EstadoPessoalDegustacao): boolean {
  return estado.discFeito || estado.respondeuSituacao;
}

/**
 * Dias de validade do passaporte. Era 2 e virou 10 em 03/09/2026, a pedido do
 * dono: a janela curta obrigava a conversa a acontecer em 48h, e quem deixava
 * para depois perdia o acesso — e, antes desta rodada, também o que tinha feito.
 */
export const DEGUSTACAO_DIAS_DE_VALIDADE = 10;

/**
 * O passe expira às 04:00 BRT do décimo dia civil depois da criação (D+10).
 * BRT é UTC-3; deslocamos o relógio antes de extrair a data para não transformar
 * uma criação depois das 21h BRT no dia seguinte por causa da data UTC.
 */
export function acmeProspectExpiresAt(now: Date = new Date()): string {
  const brtClock = new Date(now.getTime() - (3 * 60 * 60 * 1_000));
  return new Date(Date.UTC(
    brtClock.getUTCFullYear(),
    brtClock.getUTCMonth(),
    brtClock.getUTCDate() + DEGUSTACAO_DIAS_DE_VALIDADE,
    7, 0, 0, 0,
  )).toISOString();
}

export function formatAcmeProspectExpiry(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function getAcmeProspectExperienceSteps(
  access: AcmeProspectExperienceShareAccess,
): AcmeProspectExperienceStep[] {
  const views = new Map(access.views.map((view) => [view.roleKey, view]));
  const presentationSteps = ACME_PROSPECT_EXPERIENCE_VIEWS.map((step) => {
    const view = views.get(step.roleKey);
    if (!view?.url) {
      throw new Error(`Fluxo de experiência incompleto: visão ${step.roleKey} ausente.`);
    }
    return {
      number: step.number,
      title: step.title,
      description: step.description,
      url: view.url,
      note: `Disponível até ${formatAcmeProspectExpiry(access.expiresAt)}`,
    };
  });

  return [
    {
      number: '01',
      title: 'Comece como você',
      // A segunda frase existe para dar MOTIVO de não parar na 01: quem responde
      // e fecha a aba nunca volta, e o resultado dele fica pronto para ninguém.
      // Sem número de propósito — a duração muda com modelo e fila, e prazo em
      // copy que sai para o cliente vira promessa.
      description: `Comece do zero como ${access.cargo} e faça seu próprio mapeamento. `
        + 'O resultado fica pronto enquanto você avança pelas próximas etapas.',
      url: access.url,
      note: `Acesso individual até ${formatAcmeProspectExpiry(access.expiresAt)}`,
    },
    ...presentationSteps,
  ];
}

export function buildAcmeProspectShareText(access: AcmeProspectExperienceShareAccess): string {
  const firstName = access.nome.split(/\s+/)[0] || access.nome;
  const steps = getAcmeProspectExperienceSteps(access);
  const itinerary = steps.flatMap((step) => [
    `${step.number}/04 — ${step.title}`,
    step.description,
    step.url,
    '',
  ]);

  return [
    `Olá, ${firstName}!`,
    '',
    `Preparei um roteiro de experiência da Vertho em um ambiente neutro para a ${access.empresa}.`,
    'Siga as quatro etapas abaixo para conhecer a plataforma por diferentes perspectivas:',
    '',
    ...itinerary,
    `Os quatro acessos ficam disponíveis até ${formatAcmeProspectExpiry(access.expiresAt)} (horário de Brasília).`,
    'O link da etapa 01 é individual e continua valendo até o prazo acima: se você fechar, é só abri-lo de novo e continuar de onde parou.',
  ].join('\n').trim();
}
