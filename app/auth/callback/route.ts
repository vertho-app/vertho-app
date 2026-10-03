import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLocaleForEmail } from '@/lib/i18n-server';
import { localeCookieName } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { caminhoLocalOu } from '@/lib/auth/caminho-local';
import {
  readAcmeProspectAuthContext,
  recordAcmeProspectPersonalAccess,
} from '@/lib/demo/acme-prospect-tracking';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  // Só caminho local (R-75): `//outro-site` passava pelo `startsWith('/')` e a
  // sessão recém-criada seguia para fora do Vertho. Régua em `caminho-local.ts`.
  const next = caminhoLocalOu(searchParams.get('next'));

  const store = await cookies();
  const supabase = await createSupabaseServerClient();

  let error: string | null = null;
  const redirectTo = new URL(next, origin);
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');
  redirectTo.searchParams.delete('next');

  if (token_hash && type) {
    const { error: verifyErr } = await supabase.auth.verifyOtp({ token_hash, type });
    if (verifyErr) {
      console.error('[auth/callback] verifyOtp error:', verifyErr.message);
      error = verifyErr.message;
    }
  } else if (code) {
    const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
    if (codeErr) {
      console.error('[auth/callback] exchangeCode error:', codeErr.message);
      error = codeErr.message;
    }
  } else {
    error = 'Nenhum token ou código fornecido';
  }

  if (error) {
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', error);
    if (next && next !== '/dashboard') loginUrl.searchParams.set('redirect', next);
    return NextResponse.redirect(loginUrl);
  }

  const { data: { user } } = await supabase.auth.getUser();
  const prospect = user ? readAcmeProspectAuthContext(user) : null;
  if (prospect?.expired) {
    await supabase.auth.signOut();
    const loginUrl = new URL('/login', origin);
    loginUrl.searchParams.set('error', 'convite-expirado');
    return NextResponse.redirect(loginUrl);
  }
  if (prospect) {
    try {
      await recordAcmeProspectPersonalAccess(user!);
    } catch (trackingError: any) {
      // Telemetria comercial não pode impedir a entrada válida do convidado.
      console.warn('[auth/callback] registrar acesso do prospect:', trackingError?.message);
    }
  }
  const locale = await getLocaleForEmail(user?.email);
  if (locale) {
    store.set(localeCookieName, locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return NextResponse.redirect(redirectTo);
}
