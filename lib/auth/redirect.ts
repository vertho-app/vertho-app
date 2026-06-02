import { APP_URL } from '@/lib/domain';

export interface SafeAuthRedirect {
  safeRedirectTo: string;
  origin: string;
  nextPath: string;
}

function normalizeHost(value: string | null | undefined): string {
  return String(value || '').split(',')[0].trim().toLowerCase();
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function requestOrigin(req: Request): string {
  const host = normalizeHost(req.headers.get('x-forwarded-host') || req.headers.get('host'));
  const proto = normalizeHost(req.headers.get('x-forwarded-proto')) || (host.startsWith('localhost') ? 'http' : 'https');
  return host ? `${proto}://${host}` : APP_URL;
}

function isAllowedRedirect(url: URL, req: Request): boolean {
  const appUrl = new URL(APP_URL);
  const reqUrl = new URL(requestOrigin(req));

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalhost(url.hostname))) {
    return false;
  }

  if (url.host === reqUrl.host) return true;
  if (url.host === appUrl.host) return true;

  return false;
}

export function resolveSafeAuthRedirect(
  req: Request,
  redirectTo: unknown,
  fallbackPath = '/dashboard',
): SafeAuthRedirect {
  const fallbackOrigin = requestOrigin(req) || APP_URL;
  const fallback = new URL(fallbackPath, fallbackOrigin);

  if (typeof redirectTo === 'string' && redirectTo.trim()) {
    try {
      const parsed = new URL(redirectTo);
      if (isAllowedRedirect(parsed, req)) {
        return {
          safeRedirectTo: parsed.toString(),
          origin: parsed.origin,
          nextPath: `${parsed.pathname}${parsed.search}${parsed.hash}` || fallbackPath,
        };
      }
    } catch {
      // Ignora redirect inválido e usa fallback seguro.
    }
  }

  return {
    safeRedirectTo: fallback.toString(),
    origin: fallback.origin,
    nextPath: `${fallback.pathname}${fallback.search}${fallback.hash}` || fallbackPath,
  };
}
