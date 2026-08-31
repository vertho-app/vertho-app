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
