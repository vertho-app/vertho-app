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
export const DEMO_PRESENTATION_TICKET_PARAM = 'sala';
export const DEMO_PRESENTATION_TICKET_STORAGE_KEY = 'vertho-demo-presentation-ticket';
export const DEMO_PRESENTATION_DEVICE_PARAM = 'tela';
export const DEMO_PRESENTATION_DEVICE_STORAGE_KEY = 'vertho-demo-presentation-device';

export const DEMO_PRESENTATION_DEVICES = [
  { key: 'desktop', label: 'Computador', queryValue: 'computador' },
  { key: 'mobile', label: 'Celular', queryValue: 'celular' },
] as const;

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

/**
 * As SALAS: cada ambiente demo tem os seus três hostnames.
 *
 * 🔑 **O hostname identifica a sala inteira, papel E ambiente.** É por isso que
 * os hosts não podem se repetir entre ambientes: `usuario-demo` só pode
 * pertencer a um deles, senão o mesmo endereço abriria tenants diferentes
 * dependendo de quem emitiu o passe. O papel continua saindo do host; o passe
 * assinado é que carrega o ambiente, e a rota confere os dois.
 */
export const DEMO_PRESENTATION_ROOMS = {
  [DEMO_PRESENTATION_TENANT_SLUG]: {
    tenantSlug: DEMO_PRESENTATION_TENANT_SLUG,
    rotulo: 'ACME Demo',
    roles: DEMO_PRESENTATION_ROLES,
  },
  'escolas-acme': {
    tenantSlug: 'escolas-acme',
    rotulo: 'Rede de Escolas ACME',
    // Hosts próprios, e os rótulos no vocabulário de quem vai assistir: o papel
    // técnico continua sendo usuário/gestor/rh (é o que o produto autoriza),
    // mas ninguém numa escola se reconhece como "RH".
    roles: [
      { key: 'usuario', label: 'Professor(a)', hostSlug: 'professor-escolas', homePath: '/dashboard' },
      { key: 'gestor', label: 'Coordenação', hostSlug: 'coordenacao-escolas', homePath: '/dashboard/gestor' },
      { key: 'rh', label: 'Direção', hostSlug: 'direcao-escolas', homePath: '/dashboard' },
    ],
  },
} as const;

export type DemoPresentationTenantSlug = keyof typeof DEMO_PRESENTATION_ROOMS;

export function isDemoPresentationTenant(slug: unknown): slug is DemoPresentationTenantSlug {
  return typeof slug === 'string'
    && Object.prototype.hasOwnProperty.call(DEMO_PRESENTATION_ROOMS, slug);
}

export function getDemoPresentationRoom(slug: string) {
  if (!isDemoPresentationTenant(slug)) throw new Error(`Sala de apresentação inválida: ${slug}`);
  return DEMO_PRESENTATION_ROOMS[slug];
}

/**
 * Todos os papéis de todas as salas, cada um sabendo de que ambiente é.
 *
 * 🔴 A LISTA É CONSTRUÍDA UMA VEZ, E ISSO É REQUISITO, NÃO OTIMIZAÇÃO.
 *
 * `getDemoPresentationRoleFromHostname` alimenta o `getSnapshot` de um
 * `useSyncExternalStore` (`PresentationEnvironment`), e o React compara
 * snapshots com `Object.is`. Enquanto esta função montava os objetos a cada
 * chamada (`.map(role => ({ ...role, tenantSlug }))`), cada leitura devolvia
 * uma referência NOVA: a comparação falhava sempre, o React concluía que a
 * store tinha mudado e forçava outro render, que lia de novo, para sempre.
 *
 * `Medido:` 01/09/2026 — o dashboard inteiro caiu com "Maximum update depth
 * exceeded" (React #185) em `rh-demo.vertho.ai`, e SOMENTE nos domínios de
 * apresentação, porque só neles o `PresentationEnvironment` monta. O sintoma
 * não aponta para cá: chega como tela de erro genérica no dashboard, com um
 * stack inteiro de funções internas do React.
 *
 * Ao mexer aqui, a invariante é: **a mesma entrada devolve a mesma
 * referência**. Guard: `tests/unit/demo-presentation-snapshot.test.ts`.
 */
const PAPEIS_DE_APRESENTACAO: readonly (DemoPresentationRole & { tenantSlug: DemoPresentationTenantSlug })[] =
  Object.freeze(
    Object.values(DEMO_PRESENTATION_ROOMS).flatMap((sala) =>
      sala.roles.map((role) => Object.freeze({ ...role, tenantSlug: sala.tenantSlug }))),
  );

export function listarPapeisDeApresentacao() {
  return PAPEIS_DE_APRESENTACAO;
}
/**
 * O papel de uma sala. A CHAVE é fechada (é ela que o produto autoriza), mas o
 * rótulo e o host são de cada ambiente: numa rede de escolas ninguém se
 * reconhece como "RH", e o tipo não pode exigir que se reconheça.
 */
export type DemoPresentationRole = {
  key: DemoPresentationRoleKey;
  label: string;
  hostSlug: string;
  homePath: string;
};
export type DemoPresentationDeviceKey = typeof DEMO_PRESENTATION_DEVICES[number]['key'];

export function getDemoPresentationRole(
  key: DemoPresentationRoleKey,
  tenantSlug: string = DEMO_PRESENTATION_TENANT_SLUG,
): DemoPresentationRole {
  const role = getDemoPresentationRoom(tenantSlug).roles.find((item) => item.key === key);
  if (!role) throw new Error(`Papel de apresentação inválido: ${key}`);
  return role;
}

/** Aceita somente os dois valores públicos usados pela sala de apresentação. */
export function parseDemoPresentationDevice(value: string | null | undefined): DemoPresentationDeviceKey | null {
  return DEMO_PRESENTATION_DEVICES.find((device) => device.queryValue === value)?.key ?? null;
}

export function getDemoPresentationDeviceQueryValue(deviceKey: DemoPresentationDeviceKey): string {
  return DEMO_PRESENTATION_DEVICES.find((device) => device.key === deviceKey)?.queryValue ?? 'computador';
}

/** Retorna o tenant canônico somente para aliases fixos das salas de apresentação. */
export function resolvePresentationTenantSlug(hostSlug: string): DemoPresentationTenantSlug | null {
  const normalized = String(hostSlug || '').trim().toLowerCase();
  return listarPapeisDeApresentacao().find((role) => role.hostSlug === normalized)?.tenantSlug ?? null;
}

/**
 * Identifica a visão atual pelo hostname; fora das salas retorna null. O papel
 * volta com o `tenantSlug` junto: quem autentica precisa saber de que ambiente
 * é este host para conferir contra o passe.
 */
export function getDemoPresentationRoleFromHostname(
  hostname: string,
): (DemoPresentationRole & { tenantSlug: DemoPresentationTenantSlug }) | null {
  const host = String(hostname || '').trim().toLowerCase().split(':')[0];
  const hostSlug = host.split('.')[0];
  return listarPapeisDeApresentacao().find((role) => role.hostSlug === hostSlug) || null;
}

export function demoPresentationUrl(
  roleKey: DemoPresentationRoleKey,
  path?: string,
  rootDomain: string = ROOT_DOMAIN,
  tenantSlug: string = DEMO_PRESENTATION_TENANT_SLUG,
): string {
  const role = getDemoPresentationRole(roleKey, tenantSlug);
  const targetPath = path ?? role.homePath;
  const normalizedPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  return `https://${role.hostSlug}.${rootDomain}${normalizedPath}`;
}

export function demoPresentationAuthUrl(
  roleKey: DemoPresentationRoleKey,
  ticket: string,
  rootDomain: string = ROOT_DOMAIN,
  tenantSlug: string = DEMO_PRESENTATION_TENANT_SLUG,
): string {
  return demoPresentationUrl(
    roleKey,
    `/auth/apresentacao?ticket=${encodeURIComponent(ticket)}`,
    rootDomain,
    tenantSlug,
  );
}

/**
 * Abre primeiro o destino capturado e só depois marca a sessão como preparada.
 * A ordem é parte do contrato: antecipar `markPrepared` pode trocar o destino
 * renderizado para a URL direta antes de o magic link ser consumido.
 */
export function launchDemoPresentationAccess(
  access: { authUrl: string; directUrl: string; prepared: boolean },
  openUrl: (url: string) => void,
  markPrepared: () => void,
): void {
  const target = access.prepared ? access.directUrl : access.authUrl;
  openUrl(target);
  if (!access.prepared) markPrepared();
}
