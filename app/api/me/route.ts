import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdmin } from '@/lib/supabase';

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

    const sb = createSupabaseAdmin();
    const { data } = await sb.from('colaboradores')
      .select('nome_completo, foto_url')
      .eq('email', user.email.trim().toLowerCase())
      .maybeSingle();

    return NextResponse.json(data || { nome_completo: user.email, foto_url: null });
  } catch (err) {
    console.error('[/api/me]', err);
    return NextResponse.json(null);
  }
}
