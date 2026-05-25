import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { findColabByEmail } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => store.getAll(),
          setAll: (c) => { for (const { name, value, options } of c) { try { store.set(name, value, options); } catch {} } },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json(null);

    const data = await findColabByEmail(
      user.email,
      'nome_completo, foto_url, avatar_preset, role, locale, empresa_id',
    );

    let locale = resolveAppLocale((data as any)?.locale);
    if ((data as any)?.empresa_id) {
      try {
        const sb = createSupabaseAdmin();
        const { data: empresa } = await sb
          .from('empresas')
          .select('default_locale')
          .eq('id', (data as any).empresa_id)
          .maybeSingle();
        locale = resolveAppLocale((data as any)?.locale, empresa?.default_locale);
      } catch {}
    }

    return NextResponse.json(data ? { ...data, locale } : {
      nome_completo: user.email,
      foto_url: null,
      avatar_preset: null,
      role: 'colaborador',
      locale,
    });
  } catch (err) {
    console.error('[/api/me]', err);
    return NextResponse.json(null);
  }
}
