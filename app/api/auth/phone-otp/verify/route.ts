import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { checkOtp, proxyEmailFromPhone, isProxyEmail } from '@/lib/phone-otp';
import { authLimiter } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';

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
  // Rate limit por IP — barra brute-force do código OTP (complementa o limite
  // de 5 tentativas por código no banco).
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { telefone, code, redirectTo } = await req.json();

    const check = validateWhatsApp(telefone);
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

    // Identidade de auth: o E-MAIL REAL do colaborador quando houver — assim o
    // login por WhatsApp E o login por e-mail caem no MESMO auth.users (a pessoa
    // pode entrar pelos dois). Sem e-mail real, usa o proxy interno determinístico.
    const authEmail = (colab.email && !isProxyEmail(colab.email))
      ? colab.email.toLowerCase()
      : (isProxyEmail(colab.email) ? colab.email!.toLowerCase() : proxyEmailFromPhone(empresa.id, e164));

    // Garante o auth.user backing (idempotente: ignora "já registrado").
    const { error: createErr } = await sb.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[phone-otp/verify] createUser:', createErr.message);
      return NextResponse.json({ error: 'Falha ao preparar a sessão.' }, { status: 500 });
    }
    // Sincroniza colaboradores.email SÓ quando a identidade é o proxy (colab
    // phone-only com e-mail vazio/divergente). NUNCA sobrescreve um e-mail REAL.
    if (isProxyEmail(authEmail) && (colab.email || '').toLowerCase() !== authEmail) {
      await sb.from('colaboradores').update({ email: authEmail }).eq('id', colab.id);
    }

    // Redirect destino — allowlist de host (mesmo helper das rotas irmãs de
    // auth). O callbackUrl carrega um `token_hash` que ESTABELECE SESSÃO: aceitar
    // o `redirectTo` do cliente sem validar entregava o token a um domínio
    // arbitrário (open redirect com sequestro de sessão).
    const { origin, nextPath: safeNextPath } = resolveSafeAuthRedirect(req, redirectTo);
    const nextPath = safeNextPath.startsWith('/') ? safeNextPath : '/dashboard';

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
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
