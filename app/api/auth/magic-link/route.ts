import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';
import { APP_URL, EMAIL_FROM_DEFAULT } from '@/lib/domain';
import { resolveAppLocale } from '@/lib/i18n';
import { magicLinkEmail, magicLinkWhatsapp } from '@/lib/i18n-auth-templates';

export const dynamic = 'force-dynamic';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emailHtml({ nome, empresaNome, link }: { nome: string; empresaNome: string; link: string }) {
  const saud = nome ? `Olá, ${escapeHtml(nome)}!` : 'Olá!';
  const safeEmp = escapeHtml(empresaNome);
  // URL absoluta — clientes de email não resolvem paths relativos.
  const logoUrl = `${APP_URL}/logo-vertho.png`;
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;padding:24px;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
      <img src="${logoUrl}" alt="Vertho" height="22" style="height:22px;display:block;margin-bottom:14px;border:0;outline:none;text-decoration:none;" />
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">${safeEmp}</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Seu link de acesso</h1>
    </td></tr>
    <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
      <p>${saud}</p>
      <p>Clique no botão abaixo para entrar — sem precisar de senha. O link expira em 24 horas.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">Entrar agora</a>
      </p>
      <p style="font-size:12px;color:#64748b;">Se o botão não funcionar, copie o link abaixo no seu navegador:</p>
      <p style="font-size:11px;color:#64748b;word-break:break-all;background:#f8fafc;padding:8px;border-radius:6px;">${escapeHtml(link)}</p>
      <p style="margin-top:24px;color:#94a3b8;font-size:12px;">
        Se você não solicitou este e-mail, ignore-o. Nenhuma ação será feita sem seu clique.
      </p>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:14px 28px;color:#94a3b8;font-size:11px;border-top:1px solid #e2e8f0;text-align:center;">
      Este é um e-mail automático, não responda.
    </td></tr>
  </table>
</body></html>`;
}

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

    // ── Escopo de tenant + anti-relay ──────────────────────────────────────
    // Só geramos/enviamos link para quem é colaborador. Com subdomínio (tenant
    // resolvido), exigimos que o email pertença ÀQUELA empresa — fecha o
    // open-relay e o vazamento cross-tenant. Sem tenant (apex), resolvemos pelo
    // contexto do cookie. Se não for colaborador → sucesso genérico sem enviar
    // (anti-enumeração), nunca o scan cross-tenant via ilike global de antes.
    const slug = getTenantSlug(req);
    let colab: { nome_completo: string | null; telefone: string | null; empresa_id: string } | null = null;
    if (slug) {
      const { data: empresa } = await sb.from('empresas').select('id').eq('slug', slug).maybeSingle();
      if (empresa) {
        const { data } = await sb.from('colaboradores')
          .select('nome_completo, telefone, empresa_id')
          .eq('email', trimmed)
          .eq('empresa_id', empresa.id)
          .limit(1)
          .maybeSingle();
        colab = data as typeof colab;
      }
    } else {
      colab = await findColabByEmail(trimmed, 'nome_completo, telefone, empresa_id') as typeof colab;
    }

    if (!colab) {
      return NextResponse.json({ success: true });
    }

    let safeRedirectTo: string | undefined;
    let nextPath = '/dashboard';
    let origin = '';
    if (typeof redirectTo === 'string' && redirectTo) {
      try {
        const parsed = new URL(redirectTo);
        origin = parsed.origin;
        // Mantém apenas o path/query/hash do próprio host informado no client.
        safeRedirectTo = `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/dashboard';
      } catch {
        // ignora redirect inválido
      }
    }

    // Gera magic link via admin API (sem rate limit do Supabase)
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: safeRedirectTo || undefined },
    });

    if (linkErr || !linkData?.properties) {
      console.error('[magic-link] generateLink failed:', linkErr?.message);
      return NextResponse.json({ error: `Falha ao gerar link: ${linkErr?.message || 'erro desconhecido'}` });
    }

    const tokenHash = linkData.properties.hashed_token;
    const actionLink = linkData.properties.action_link;

    const telefone = colab.telefone;
    const empresa = colab.empresa_id
      ? (await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle()).data
      : null;

    const nome = colab.nome_completo?.split(' ')[0] || '';
    const empresaNome = empresa?.nome || 'Vertho';
    const results = { email: false, whatsapp: false };

    // 1) Email — envia direto via Resend usando o action_link gerado pelo
    //    admin.generateLink (sem rate limit). Antes chamávamos signInWithOtp
    //    que usa SMTP do Supabase Auth (limite 2 emails/h no plano padrão).
    if (process.env.RESEND_API_KEY && actionLink) {
      try {
        // Se temos um redirectTo confiável, montamos um callback server-side
        // com token_hash (mesma estratégia do WhatsApp) — evita problemas de
        // PKCE quando o usuário abre o e-mail em outro navegador.
        const linkPraEmail = (origin && tokenHash)
          ? `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`
          : actionLink;

        const resend = new Resend(process.env.RESEND_API_KEY);
        const email = magicLinkEmail(locale, { nome, empresaNome, link: linkPraEmail });
        const sendResult = await resend.emails.send({
          from: EMAIL_FROM_DEFAULT,
          to: trimmed,
          subject: email.subject,
          html: email.html,
        });
        if ((sendResult as any)?.error) {
          console.error('[magic-link] Resend retornou erro:', JSON.stringify((sendResult as any).error).slice(0, 300));
          results.email = false;
        } else {
          results.email = true;
        }
      } catch (e: any) {
        console.error('[magic-link] Resend exception:', e.message);
      }
    } else if (!process.env.RESEND_API_KEY) {
      console.error('[magic-link] RESEND_API_KEY ausente — email não enviado');
    }

    // 2) WhatsApp — usa callback server-side com token_hash.
    // Isso evita depender do code_verifier do navegador original (PKCE), que costuma quebrar
    // quando o link é aberto pelo app/navegador do WhatsApp.
    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (zapiInstance && zapiToken && telefone && tokenHash && origin) {
      try {
        let phone = String(telefone).replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        const whatsappLink = `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`;
        const msg = magicLinkWhatsapp(locale, { nome, empresaNome, link: whatsappLink });

        const res = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '' },
          body: JSON.stringify({ phone, message: msg }),
        });
        results.whatsapp = res.ok;
        if (!res.ok) console.error('[magic-link] Z-API error:', res.status, (await res.text()).slice(0, 200));
      } catch (e: any) {
        console.error('[magic-link] Z-API error:', e.message);
      }
    }

    if (!results.email && !results.whatsapp) {
      const detail = [
        !telefone && 'colaborador sem telefone',
        (!zapiInstance || !zapiToken) && 'Z-API não configurado',
        !tokenHash && 'token não gerado',
      ].filter(Boolean).join('; ');
      return NextResponse.json({ error: `Não foi possível enviar. ${detail || 'Verifique os logs.'}` });
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[magic-link]', err.message);
    return NextResponse.json({ error: `Erro: ${err.message}` });
  }
}
