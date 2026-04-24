import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json(null);

    const sb = createSupabaseAdmin();
    const { data } = await sb.from('colaboradores')
      .select('nome_completo, foto_url')
      .eq('email', user.email)
      .maybeSingle();

    return NextResponse.json(data || { nome_completo: user.email, foto_url: null });
  } catch {
    return NextResponse.json(null);
  }
}
