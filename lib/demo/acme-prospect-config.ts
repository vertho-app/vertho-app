export const ACME_PROSPECT_ROLES = [
  {
    key: 'representante-comercial',
    label: 'Representante Comercial',
    cargo: 'Representante Comercial',
    area: 'Comercial',
  },
  {
    key: 'gerente-comercial',
    label: 'Gerente Comercial',
    cargo: 'Gerente Comercial',
    area: 'Comercial',
  },
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

export type AcmeProspectExperienceInput = {
  nome: string;
  empresa: string;
  roleKey: AcmeProspectRoleKey;
};

export type AcmeProspectExperienceAccess = {
  sessionId: string;
  nome: string;
  empresa: string;
  cargo: string;
  url: string;
  expiresAt: string;
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
  nome: string;
  empresa: string;
  cargo: string;
  createdAt: string;
  expiresAt: string;
  personalAccessedAt: string | null;
  discCompletedAt: string | null;
  colaboradorAccessedAt: string | null;
  gestorAccessedAt: string | null;
  rhAccessedAt: string | null;
  accessClosedAt: string | null;
};

/**
 * Como a pessoa entrou no tenant de demonstração:
 *
 * - `passaporte`: veio do botão "preparar experiência", tem linha em
 *   `demo_prospect_sessions`, prazo D+2 e as três visões da apresentação.
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
  personalAccessedAt: string | null;
  discCompletedAt: string | null;
  colaboradorAccessedAt: string | null;
  gestorAccessedAt: string | null;
  rhAccessedAt: string | null;
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
} as const;

export type DemoProspectTenantSlug = keyof typeof DEMO_PROSPECT_TENANTS;

export function getDemoProspectTenant(slug: string) {
  return (DEMO_PROSPECT_TENANTS as Record<string, { slug: string; authPrefix: string }>)[slug] ?? null;
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

function cleanHumanText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAcmeProspectRole(key: unknown) {
  return ACME_PROSPECT_ROLES.find((role) => role.key === key) ?? null;
}

export function validateAcmeProspectExperienceInput(input: unknown):
  | { ok: true; value: AcmeProspectExperienceInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Preencha os dados do prospect.' };
  }

  const raw = input as Record<string, unknown>;
  const nome = cleanHumanText(raw.nome);
  const empresa = cleanHumanText(raw.empresa);
  const role = getAcmeProspectRole(raw.roleKey);

  if (nome.length < 2 || nome.length > 100) {
    return { ok: false, error: 'Informe um nome entre 2 e 100 caracteres.' };
  }
  if (empresa.length < 2 || empresa.length > 120) {
    return { ok: false, error: 'Informe uma empresa entre 2 e 120 caracteres.' };
  }
  if (!role) {
    return { ok: false, error: 'Escolha um papel demonstrativo válido.' };
  }

  return {
    ok: true,
    value: { nome, empresa, roleKey: role.key },
  };
}

/**
 * O passe expira às 04:00 BRT do segundo dia civil depois da criação (D+2).
 * BRT é UTC-3; deslocamos o relógio antes de extrair a data para não transformar
 * uma criação depois das 21h BRT no dia seguinte por causa da data UTC.
 */
export function acmeProspectExpiresAt(now: Date = new Date()): string {
  const brtClock = new Date(now.getTime() - (3 * 60 * 60 * 1_000));
  return new Date(Date.UTC(
    brtClock.getUTCFullYear(),
    brtClock.getUTCMonth(),
    brtClock.getUTCDate() + 2,
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
      description: `Comece do zero como ${access.cargo} e faça seu próprio mapeamento.`,
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
    'O link da etapa 01 é individual e funciona uma única vez; depois da entrada, a sessão permanece ativa neste navegador até o prazo acima.',
  ].join('\n').trim();
}
