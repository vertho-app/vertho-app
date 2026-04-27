/**
 * Constantes e helpers centralizados para o domínio raiz da aplicação.
 *
 * Configuração via env (Vercel):
 *   - NEXT_PUBLIC_ROOT_DOMAIN  = "vertho.ai" (sem protocolo, sem subdomínio)
 *   - NEXT_PUBLIC_APP_URL      = "https://vertho.ai"
 *   - EMAIL_FROM               = "Vertho <noreply@vertho.ai>"
 *
 * Para mudar de domínio, basta atualizar essas 3 envs no Vercel —
 * o código todo passa a usar o novo domínio sem PRs.
 *
 * `middleware.js` mantém uma lista própria de domínios raiz (extração
 * de subdomínio precisa funcionar pra TODOS os domínios servidos
 * simultaneamente durante migrações).
 */

export const ROOT_DOMAIN: string =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'vertho.com.br';

export const APP_URL: string =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://${ROOT_DOMAIN}`);

export const EMAIL_FROM_DEFAULT: string =
  process.env.EMAIL_FROM || `Vertho <noreply@${ROOT_DOMAIN}>`;

export function tenantUrl(slug: string, path: string = ''): string {
  const p = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `https://${slug}.${ROOT_DOMAIN}${p}`;
}

export function tenantEmailFrom(slug: string, displayName: string = 'Vertho'): string {
  return `${displayName} <noreply@${slug}.${ROOT_DOMAIN}>`;
}
