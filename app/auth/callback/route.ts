import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  const next = searchParams.get('next') || '/dashboard';

  const store = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (c) => {
          for (const { name, value, options } of c) {
            try { store.set(name, value, options); } catch {}
          }
        },
      },
    },
  );

  let error: string | null = null;

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
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL(next, origin));
}
