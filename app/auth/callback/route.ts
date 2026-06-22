import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLocaleForEmail } from '@/lib/i18n-server';
import { localeCookieName } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  let next = searchParams.get('next') || '/dashboard';
  if (!next.startsWith('/')) next = '/dashboard';

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
