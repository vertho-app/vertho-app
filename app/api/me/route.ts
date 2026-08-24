import { NextResponse } from 'next/server';
import { findColabByEmail, isPlatformAdmin } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json(null);

    const data = await findColabByEmail(
      user.email,
      'nome_completo, foto_url, avatar_preset, role, locale, empresa_id',
    );

    // Atalho para o painel no shell do dashboard. É só EXIBIÇÃO: o gate de
    // verdade continua no layout de `/admin`, que refaz a pergunta server-side —
    // este campo não concede nada, e sem ele quem administra a plataforma entrava
    // por um tenant e não tinha caminho de volta ao painel.
    const platformAdmin = await isPlatformAdmin(user.email);

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

    return NextResponse.json(data ? { ...data, locale, platformAdmin } : {
      nome_completo: user.email,
      foto_url: null,
      avatar_preset: null,
      role: 'colaborador',
      locale,
      platformAdmin,
    });
  } catch (err) {
    console.error('[/api/me]', err);
    return NextResponse.json(null);
  }
}
