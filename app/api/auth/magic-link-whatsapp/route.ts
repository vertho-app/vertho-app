import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { resolveAppLocale } from '@/lib/i18n';
import { sendAccessLink } from '@/lib/notifications/access-link-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Rate limit por IP — dispara WhatsApp (custo Z-API).
  const limited = authLimiter.check(req);
  if (limited) return limited;

  try {
    const { email, redirectTo } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    const trimmed = email.trim().toLowerCase();
    const locale = resolveAppLocale(req.cookies.get('vertho-locale')?.value);
    const sb = createSupabaseAdmin();

    // Escopo de tenant: com subdomínio, só atende colaborador da própria empresa.
    // Sem subdomínio, o link é global por email → pega 1 registro representativo
    // (limit 1; o maybeSingle anterior quebrava com email duplicado em tenants).
    const slug = getTenantSlug(req);
    let q = sb.from('colaboradores')
      .select('nome_completo, telefone, empresa_id')
      .eq('email', trimmed);
    if (slug) {
      const { data: emp } = await sb.from('empresas').select('id').eq('slug', slug).maybeSingle();
      if (!emp) return NextResponse.json({ sent: false });
      q = q.eq('empresa_id', emp.id);
    }
    const { data: colabRows } = await q.limit(1);
    const colab = colabRows?.[0] as { nome_completo: string | null; telefone: string | null; empresa_id: string } | undefined;

    if (!colab?.telefone) return NextResponse.json({ sent: false });

    const { data: empresa } = await sb.from('empresas')
      .select('nome').eq('id', colab.empresa_id).maybeSingle();

    const redirect = resolveSafeAuthRedirect(req, redirectTo);

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: redirect.safeRedirectTo },
    });
    if (linkErr || !linkData?.properties) {
      console.error('[magic-link-whatsapp]', linkErr?.message);
      return NextResponse.json({ sent: false });
    }

    const tokenHash = linkData.properties.hashed_token;
    const callbackLink = tokenHash
      ? `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(redirect.nextPath)}`
      : linkData.properties.action_link;

    const result = await sendAccessLink({
      to: trimmed,
      telefone: colab.telefone,
      nome: colab.nome_completo?.split(' ')[0] || '',
      empresaNome: empresa?.nome || 'Vertho',
      locale,
      whatsappLink: callbackLink,
      channels: ['whatsapp'],
    });

    if (result.whatsapp !== 'sent') {
      console.error('[magic-link-whatsapp] não enviado:', result.whatsappReason);
      return NextResponse.json({ sent: false, error: result.whatsappReason });
    }
    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('[magic-link-whatsapp]', err.message);
    return NextResponse.json({ sent: false });
  }
}
