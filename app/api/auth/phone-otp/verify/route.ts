import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsAppBR } from '@/lib/phone';
import { checkOtp, proxyEmailFromPhone, isProxyEmail } from '@/lib/phone-otp';

export const dynamic = 'force-dynamic';

/**
 * Verifica o código OTP e, em sucesso, devolve a URL de callback que
 * estabelece a sessão Supabase.
 *
 * Reusa o /auth/callback já testado: geramos um magic link via admin
 * (token_hash) pro email-proxy do colaborador e o client navega pra
 * /auth/callback?token_hash=...&type=email — mesmo caminho do magic-link.
 *
 * Body: { telefone, code, redirectTo } — tenant via header x-tenant-slug.
 */
export async function POST(req: NextRequest) {
  try {
    const { telefone, code, redirectTo } = await req.json();

    const check = validateWhatsAppBR(telefone);
    if (check.valid === false) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const e164 = check.e164;

    const slug = getTenantSlug(req);
    if (!slug) return NextResponse.json({ error: 'Tenant não identificado.' }, { status: 400 });

    const sb = createSupabaseAdmin();
    const { data: empresa } = await sb
      .from('empresas')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 404 });

    const { data: colab } = await sb
      .from('colaboradores')
      .select('id, email')
      .eq('empresa_id', empresa.id)
      .eq('telefone', e164)
      .eq('login_por_whatsapp', true)
      .limit(1)
      .maybeSingle();
    if (!colab) {
      // Mesmo erro do código inválido — não revela existência do número.
      return NextResponse.json({ error: 'Código incorreto.' }, { status: 400 });
    }

    const verified = await checkOtp(sb, empresa.id, e164, code);
    if (verified.ok === false) {
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }

    // Email-proxy: usa o do colaborador se já for proxy; senão o determinístico.
    const proxyEmail = isProxyEmail(colab.email)
      ? colab.email!.toLowerCase()
      : proxyEmailFromPhone(empresa.id, e164);

    // Garante o auth.user backing (idempotente: ignora "já registrado").
    const { error: createErr } = await sb.auth.admin.createUser({
      email: proxyEmail,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[phone-otp/verify] createUser:', createErr.message);
      return NextResponse.json({ error: 'Falha ao preparar a sessão.' }, { status: 500 });
    }
    // Mantém colaboradores.email consistente com o proxy (caso divergente).
    if ((colab.email || '').toLowerCase() !== proxyEmail) {
      await sb.from('colaboradores').update({ email: proxyEmail }).eq('id', colab.id);
    }

    // Redirect destino (path do próprio host informado pelo client).
    let nextPath = '/dashboard';
    let origin = req.nextUrl.origin;
    if (typeof redirectTo === 'string' && redirectTo) {
      try {
        const parsed = new URL(redirectTo);
        origin = parsed.origin;
        nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/dashboard';
      } catch { /* ignora redirect inválido */ }
    }
    if (!nextPath.startsWith('/')) nextPath = '/dashboard';

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: proxyEmail,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[phone-otp/verify] generateLink:', linkErr?.message);
      return NextResponse.json({ error: 'Falha ao estabelecer a sessão.' }, { status: 500 });
    }

    const callbackUrl =
      `${origin}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=email&next=${encodeURIComponent(nextPath)}`;

    return NextResponse.json({ ok: true, callbackUrl });
  } catch (err: any) {
    console.error('[phone-otp/verify]', err.message);
    return NextResponse.json({ error: 'Erro ao verificar código.' }, { status: 500 });
  }
}
