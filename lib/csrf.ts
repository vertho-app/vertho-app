import { NextResponse } from 'next/server';

/**
 * Valida Origin pra proteger rotas mutativas autenticadas por cookie.
 *
 * Regras:
 * - Se request tem Authorization: Bearer explícito → skip (não é cookie-based)
 * - Se method é GET/HEAD/OPTIONS → skip (safe methods)
 * - Senão: exigir header Origin ou Referer com host confiável
 * - Falhar fechado com 403 se Origin ausente ou não confiável
 *
 * Uso: logo ANTES do auth check nas rotas mutativas.
 */

const TRUSTED_ORIGINS = new Set([
  'https://vertho.com.br',
  'https://www.vertho.com.br',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function isTrustedOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  // Exato match
  if (TRUSTED_ORIGINS.has(origin)) return true;
  // Subdomínios *.vertho.com.br
  try {
    const url = new URL(origin);
    if (url.hostname.endsWith('.vertho.com.br')) return true;
    if (url.hostname.endsWith('.vercel.app')) return true;
    // Same-origin: origin host == request host
    if (host && url.host === host) return true;
  } catch {}
  return false;
}

export function csrfCheck(req: Request): Response | null {
  // Safe methods: skip
  const method = req.method?.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;

  // Bearer auth: skip (token-based, not cookie-vulnerable)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return null;

  // Cookie-based auth: validate Origin
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host');

  // Try Origin first, fallback to Referer
  const checkOrigin = origin || (referer ? new URL(referer).origin : null);

  if (!isTrustedOrigin(checkOrigin, host)) {
    return NextResponse.json(
      { error: 'CSRF: origin não confiável' },
      { status: 403 },
    );
  }

  return null;
}
