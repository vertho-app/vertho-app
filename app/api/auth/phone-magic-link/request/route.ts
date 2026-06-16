import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsAppBR } from '@/lib/phone';
import { isProxyEmail, proxyEmailFromPhone } from '@/lib/phone-otp';
import { resolveAppLocale } from '@/lib/i18n';
import { magicLinkWhatsapp } from '@/lib/i18n-auth-templates';
import { authLimiter } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';

export const dynamic = 'force-dynamic';

/**
 * Envia link de acesso por WhatsApp para colaboradores phone-only.
 *
 * Mantem a identidade real do usuario como telefone, mas usa o email proxy
 * interno apenas para criar a sessao Supabase via /auth/callback.
 */
export async function POST(req: NextRequest) {
  const limited = authLimiter.check(req);
  if (limited) return limited;

  try {
    const { telefone, redirectTo, locale: bodyLocale } = await req.json();
    const locale = resolveAppLocale(bodyLocale, req.cookies.get('vertho-locale')?.value);

    const check = validateWhatsAppBR(telefone);
    if (check.valid === false) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const e164 = check.e164;

    const slug = getTenantSlug(req);
    if (!slug) return NextResponse.json({ ok: true });

    const sb = createSupabaseAdmin();
    const { data: empresa } = await sb
      .from('empresas')
      .select('id, nome')
      .eq('slug', slug)
      .maybeSingle();
    if (!empresa) return NextResponse.json({ ok: true });

    const { data: colab } = await sb
      .from('colaboradores')
      .select('id, nome_completo, email')
      .eq('empresa_id', empresa.id)
      .eq('telefone', e164)
      .eq('login_por_whatsapp', true)
      .limit(1)
      .maybeSingle();

    if (!colab) return NextResponse.json({ ok: true });

    const proxyEmail = isProxyEmail(colab.email)
      ? colab.email!.toLowerCase()
      : proxyEmailFromPhone(empresa.id, e164);

    const { error: createErr } = await sb.auth.admin.createUser({
      email: proxyEmail,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[phone-magic-link/request] createUser:', createErr.message);
      return NextResponse.json({ error: 'Falha ao preparar o acesso.' }, { status: 500 });
    }

    if ((colab.email || '').toLowerCase() !== proxyEmail) {
      await sb.from('colaboradores').update({ email: proxyEmail }).eq('id', colab.id);
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: proxyEmail,
      options: { redirectTo: redirect.safeRedirectTo },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[phone-magic-link/request] generateLink:', linkErr?.message);
      return NextResponse.json({ error: 'Falha ao gerar o link de acesso.' }, { status: 500 });
    }

    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (!zapiInstance || !zapiToken) {
      console.error('[phone-magic-link/request] Z-API nao configurado');
      return NextResponse.json({ error: 'Canal WhatsApp indisponivel no momento.' }, { status: 503 });
    }

    const link =
      `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=email&next=${encodeURIComponent(redirect.nextPath)}`;
    const nome = colab.nome_completo?.split(' ')[0] || '';
    const msg = magicLinkWhatsapp(locale, { nome, empresaNome: empresa.nome || 'Vertho', link });

    const res = await fetch(
      `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '' },
        body: JSON.stringify({ phone: e164, message: msg }),
      },
    );
    if (!res.ok) {
      console.error('[phone-magic-link/request] Z-API error:', res.status, (await res.text()).slice(0, 200));
      return NextResponse.json({ error: 'Nao foi possivel enviar o link pelo WhatsApp. Tente novamente.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[phone-magic-link/request]', err.message);
    return NextResponse.json({ error: 'Erro ao enviar link de acesso.' }, { status: 500 });
  }
}
