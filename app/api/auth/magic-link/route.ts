import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';
import { resolveAppLocale } from '@/lib/i18n';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { sendAccessLink, recipientFromLookup } from '@/lib/notifications/access-link-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Rate limit por IP — rota não autenticada que dispara email/WhatsApp (custo).
  const limited = authLimiter.check(req);
  if (limited) return limited;

  try {
    const { email, redirectTo, locale: bodyLocale } = await req.json();
    const locale = resolveAppLocale(bodyLocale, req.cookies.get('vertho-locale')?.value);
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });

    const trimmed = email.trim().toLowerCase();
    const sb = createSupabaseAdmin();

    // ── Elegibilidade + escopo de tenant ───────────────────────────────────
    // Só enviamos link a quem é colaborador (de alguma empresa) ou platform admin.
    // COM subdomínio: exigimos que o email pertença ÀQUELA empresa (fecha o
    // open-relay e o vazamento cross-tenant). SEM subdomínio (apex): o magic link
    // é GLOBAL por email (o tenant é resolvido só no login), então um email em >1
    // empresa NÃO é ambíguo aqui — pegamos um registro representativo p/ nome e
    // telefone da mensagem. (findColabByEmail é fail-closed na ambiguidade por ser
    // usado em autorização; usá-lo aqui causava "sucesso silencioso" p/ emails
    // duplicados em tenants — o usuário existia mas nada era enviado.)
    const slug = getTenantSlug(req);
    let colab: { nome_completo: string | null; telefone: string | null; empresa_id: string } | null = null;
    if (slug) {
      const { data: empresa } = await sb.from('empresas').select('id').eq('slug', slug).maybeSingle();
      if (empresa) {
        const { data } = await sb.from('colaboradores')
          .select('nome_completo, telefone, empresa_id')
          .eq('email', trimmed).eq('empresa_id', empresa.id)
          .limit(1).maybeSingle();
        colab = data as typeof colab;
      }
    } else {
      const { data } = await sb.from('colaboradores')
        .select('nome_completo, telefone, empresa_id')
        .eq('email', trimmed)
        .limit(1).maybeSingle();
      colab = data as typeof colab;
    }

    let platformAdmin: { nome: string | null } | null = null;
    if (!colab) {
      const { data: admin } = await sb.from('platform_admins')
        .select('nome').eq('email', trimmed).maybeSingle();
      platformAdmin = admin as typeof platformAdmin;
    }

    const recipient = recipientFromLookup(colab, platformAdmin);
    // Não é colaborador nem admin → sucesso genérico SEM enviar (anti-enumeração).
    if (!recipient.eligible) {
      return NextResponse.json({ success: true });
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);

    // Gera magic link via admin API (sem o rate limit de SMTP do Supabase Auth).
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: redirect.safeRedirectTo },
    });
    if (linkErr || !linkData?.properties) {
      console.error('[magic-link] generateLink failed:', linkErr?.message);
      return NextResponse.json({ error: `Falha ao gerar link: ${linkErr?.message || 'erro desconhecido'}` });
    }

    const tokenHash = linkData.properties.hashed_token;
    const actionLink = linkData.properties.action_link;

    const empresa = colab?.empresa_id
      ? (await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle()).data
      : null;
    const empresaNome = empresa?.nome || 'Vertho';

    // Callback server-side com token_hash — evita PKCE quebrar quando o link é
    // aberto em outro navegador (email) ou no app do WhatsApp.
    const callbackLink = tokenHash
      ? `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(redirect.nextPath)}`
      : null;

    const result = await sendAccessLink({
      to: trimmed,
      telefone: recipient.telefone,
      nome: recipient.nome,
      empresaNome,
      locale,
      emailLink: callbackLink || actionLink,
      whatsappLink: callbackLink,
    });

    // NUNCA reportar sucesso se nenhum canal foi realmente enviado (fim do
    // "sucesso silencioso").
    if (!result.anySent) {
      const motivo = [
        result.emailReason && `email: ${result.emailReason}`,
        result.whatsappReason && `whatsapp: ${result.whatsappReason}`,
      ].filter(Boolean).join('; ');
      console.error('[magic-link] nenhum canal enviado:', motivo);
      return NextResponse.json({ error: `Não foi possível enviar o link de acesso.${motivo ? ` (${motivo})` : ''}` });
    }

    return NextResponse.json({ success: true, email: result.email, whatsapp: result.whatsapp });
  } catch (err: any) {
    console.error('[magic-link]', err.message);
    return NextResponse.json({ error: `Erro: ${err.message}` });
  }
}
