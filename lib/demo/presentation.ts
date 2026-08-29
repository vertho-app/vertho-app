import { ROOT_DOMAIN } from '@/lib/domain';

/**
 * A sala de apresentação usa o ACME Demo porque ele recebe o mesmo fixture e
 * os mesmos artefatos do tenant contextualizado, sem carregar a marca de um
 * prospect específico.
 *
 * Cada papel vive em um hostname diferente. Os cookies do Supabase são
 * host-only, então os três logins coexistem no mesmo navegador sem uma aba
 * derrubar a sessão da outra. O proxy converte esses aliases de volta para o
 * tenant canônico `acme-demo`; o hostname nunca concede papel ou permissão.
 */
export const DEMO_PRESENTATION_TENANT_SLUG = 'acme-demo' as const;

export const DEMO_PRESENTATION_ROLES = [
  {
    key: 'usuario',
    label: 'Usuário',
    hostSlug: 'usuario-demo',
    homePath: '/dashboard',
  },
  {
    key: 'gestor',
    label: 'Gestor',
    hostSlug: 'gestor-demo',
    homePath: '/dashboard/gestor',
  },
  {
    key: 'rh',
    label: 'RH',
    hostSlug: 'rh-demo',
    homePath: '/dashboard',
  },
] as const;

export type DemoPresentationRoleKey = typeof DEMO_PRESENTATION_ROLES[number]['key'];
export type DemoPresentationRole = typeof DEMO_PRESENTATION_ROLES[number];

export function getDemoPresentationRole(key: DemoPresentationRoleKey): DemoPresentationRole {
  const role = DEMO_PRESENTATION_ROLES.find((item) => item.key === key);
  if (!role) throw new Error(`Papel de apresentação inválido: ${key}`);
  return role;
}

/** Retorna o tenant canônico somente para aliases fixos da sala de apresentação. */
export function resolvePresentationTenantSlug(hostSlug: string): typeof DEMO_PRESENTATION_TENANT_SLUG | null {
  const normalized = String(hostSlug || '').trim().toLowerCase();
  return DEMO_PRESENTATION_ROLES.some((role) => role.hostSlug === normalized)
    ? DEMO_PRESENTATION_TENANT_SLUG
    : null;
}

/** Identifica a visão atual pelo hostname; fora da sala retorna null. */
export function getDemoPresentationRoleFromHostname(hostname: string): DemoPresentationRole | null {
  const host = String(hostname || '').trim().toLowerCase().split(':')[0];
  const hostSlug = host.split('.')[0];
  return DEMO_PRESENTATION_ROLES.find((role) => role.hostSlug === hostSlug) || null;
}

export function demoPresentationUrl(
  roleKey: DemoPresentationRoleKey,
  path?: string,
  rootDomain: string = ROOT_DOMAIN,
): string {
  const role = getDemoPresentationRole(roleKey);
  const targetPath = path ?? role.homePath;
  const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  return `https://${role.hostSlug}.${rootDomain}${normalizedPath}`;
}
