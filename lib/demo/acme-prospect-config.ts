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

export const ACME_PROSPECT_AUTH_PREFIX = 'convidado.acme.';
export const ACME_PROSPECT_AUTH_SUFFIX = '@vertho.ai';
export const ACME_PROSPECT_AUTH_MARKER = 'acme-prospect-experience-v1';
export const ACME_PROSPECT_SESSION_PATTERN = /^[a-f0-9]{20}$/;

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
