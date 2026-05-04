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

/**
 * Garante que a URL tem esquema `https://`. Aceita valor com ou sem
 * protocolo nas envs (paste descuidado de `app.vertho.ai` em vez de
 * `https://app.vertho.ai` é o erro mais comum).
 *
 * Limpa caracteres invisíveis (BOM, NBSP, espaços não-quebráveis, controle)
 * que costumam vir junto em copy/paste de painéis admin.
 */
function ensureHttps(url: string | undefined | null): string | null {
  if (!url) return null;
  // Remove caracteres invisiveis: control chars, DEL, NBSP, BOM
  // Range escapado em hex para evitar corrupcao de encoding do arquivo
  const ctrlChars = String.fromCharCode(0x00) + '-' + String.fromCharCode(0x1F);
  const ctrlChars2 = String.fromCharCode(0x7F) + '-' + String.fromCharCode(0xA0);
  const bom = String.fromCharCode(0xFEFF);
  const cleaned = String(url)
    .replace(new RegExp('[' + ctrlChars + ctrlChars2 + bom + ']', 'g'), '')
    .trim()
    .replace(new RegExp('/+$'), ''); // sem trailing slash
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

/**
 * URL para webhooks (QStash, Bunny, Resend) que precisam bater de volta na
 * aplicação. NÃO pode usar APP_URL porque a raiz `vertho.ai` pode estar
 * apontando pra um site institucional externo (Gamma) — qualquer chamada
 * pra `vertho.ai/api/...` cai no Gamma e retorna 404/405. Webhooks têm que
 * ir pra `app.{ROOT_DOMAIN}` (Vercel) ou pro domínio Vercel direto.
 *
 * Aceita env com ou sem protocolo (normaliza para https://).
 */
export const APP_WEBHOOK_URL: string =
  ensureHttps(process.env.NEXT_PUBLIC_APP_WEBHOOK_URL) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `https://app.${ROOT_DOMAIN}`);

/**
 * Base URL do QStash (Upstash). O token é vinculado a uma região específica
 * (us-east-1, eu-central-1, etc) e a URL `qstash.upstash.io` genérica pode
 * rotear pro lugar errado. Usar a URL regional do workspace evita 404s do
 * tipo "user not found in this region".
 *
 * Configurar via env `QSTASH_URL` no formato:
 *   QSTASH_URL=https://qstash-us-east-1.upstash.io  (sem barra final)
 *
 * Aceita env com ou sem protocolo (normaliza para https://).
 */
export const QSTASH_BASE_URL: string =
  ensureHttps(process.env.QSTASH_URL) || 'https://qstash.upstash.io';

export const EMAIL_FROM_DEFAULT: string =
  process.env.EMAIL_FROM || `Vertho <noreply@${ROOT_DOMAIN}>`;

export function tenantUrl(slug: string, path: string = ''): string {
  const p = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `https://${slug}.${ROOT_DOMAIN}${p}`;
}

export function tenantEmailFrom(slug: string, displayName: string = 'Vertho'): string {
  return `${displayName} <noreply@${slug}.${ROOT_DOMAIN}>`;
}
