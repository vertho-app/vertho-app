import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { findColabByEmail } from '@/lib/authz';

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
      'nome_completo, foto_url, avatar_preset',
    );

    return NextResponse.json(data || {
      nome_completo: user.email,
      foto_url: null,
      avatar_preset: null,
    });
  } catch (err) {
    console.error('[/api/me]', err);
    return NextResponse.json(null);
  }
}
