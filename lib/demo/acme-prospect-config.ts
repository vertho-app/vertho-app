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
 * O cron canônico do ACME roda às 07:00 UTC (04:00 BRT). O colaborador
 * temporário deixa de existir nesse reset, encerrando a sessão no produto mesmo
 * que o cookie do Auth ainda esteja presente no navegador.
 */
export function nextAcmeDemoResetAt(now: Date = new Date()): string {
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    7, 0, 0, 0,
  ));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate.toISOString();
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
      note: 'Visão demonstrativa disponível por 4 horas',
    };
  });

  return [
    {
      number: '01',
      title: 'Comece como você',
      description: `Comece do zero como ${access.cargo} e faça seu próprio mapeamento.`,
      url: access.url,
      note: 'Link individual e de uso único',
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
    'O link da etapa 01 é individual e funciona uma única vez.',
    'As etapas 02 a 04 ficam disponíveis por 4 horas.',
  ].join('\n').trim();
}
