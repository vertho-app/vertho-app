import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { isProxyEmail, proxyEmailFromPhone } from '@/lib/phone-otp';
import { resolveAppLocale } from '@/lib/i18n';
import { sendAccessLink } from '@/lib/notifications/access-link-service';
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

    const check = validateWhatsApp(telefone);
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

    // Identidade: e-mail REAL do colab quando houver (login por WhatsApp e e-mail
    // no mesmo auth.users); senão o proxy interno.
    const authEmail = (colab.email && !isProxyEmail(colab.email))
      ? colab.email.toLowerCase()
      : (isProxyEmail(colab.email) ? colab.email!.toLowerCase() : proxyEmailFromPhone(empresa.id, e164));

    const { error: createErr } = await sb.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[phone-magic-link/request] createUser:', createErr.message);
      return NextResponse.json({ error: 'Falha ao preparar o acesso.' }, { status: 500 });
    }

    // Só sincroniza colaboradores.email quando a identidade é o proxy. NUNCA
    // sobrescreve um e-mail real cadastrado.
    if (isProxyEmail(authEmail) && (colab.email || '').toLowerCase() !== authEmail) {
      await sb.from('colaboradores').update({ email: authEmail }).eq('id', colab.id);
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: redirect.safeRedirectTo },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[phone-magic-link/request] generateLink:', linkErr?.message);
      return NextResponse.json({ error: 'Falha ao gerar o link de acesso.' }, { status: 500 });
    }

    const link =
      `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=email&next=${encodeURIComponent(redirect.nextPath)}`;

    const result = await sendAccessLink({
      to: authEmail,
      telefone: e164,
      nome: colab.nome_completo?.split(' ')[0] || '',
      empresaNome: empresa.nome || 'Vertho',
      empresaId: empresa.id, // gate de tenant-demo
      locale,
      whatsappLink: link,
      channels: ['whatsapp'],
    });

    if (result.whatsapp !== 'sent') {
      console.error('[phone-magic-link/request] não enviado:', result.whatsappReason);
      // Preserva os status HTTP: Z-API não configurado → 503; falha de envio → 502.
      const indisponivel = /não configurado|nao configurado/i.test(result.whatsappReason || '');
      return indisponivel
        ? NextResponse.json({ error: 'Canal WhatsApp indisponível no momento.' }, { status: 503 })
        : NextResponse.json({ error: 'Não foi possível enviar o link pelo WhatsApp. Tente novamente.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[phone-magic-link/request]', err.message);
    return NextResponse.json({ error: 'Erro ao enviar link de acesso.' }, { status: 500 });
  }
}
