import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { APP_URL, EMAIL_FROM_DEFAULT } from '@/lib/domain';

export const dynamic = 'force-dynamic';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function emailHtml({ nome, empresaNome, link }: { nome: string; empresaNome: string; link: string }) {
  const saud = nome ? `Olá, ${escapeHtml(nome)}!` : 'Olá!';
  const safeEmp = escapeHtml(empresaNome);
  // Logo precisa ser URL absoluta — clientes de email não resolvem paths
  // relativos. APP_URL aponta pra app.vertho.ai onde o asset estático mora.
  const logoUrl = `${APP_URL}/logo-vertho.png`;
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7fb;padding:24px;">
  <table cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
    <tr><td style="background:#0f2b54;padding:24px 28px;color:#fff;">
      <img src="${logoUrl}" alt="Vertho" height="22" style="height:22px;display:block;margin-bottom:14px;border:0;outline:none;text-decoration:none;" />
      <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34c5cc;">${safeEmp}</p>
      <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">Bem-vindo!</h1>
    </td></tr>
    <tr><td style="padding:28px;color:#1e293b;line-height:1.65;font-size:14px;">
      <p>${saud}</p>
      <p>Seu cadastro foi criado. Clique no botão abaixo para entrar — sem precisar de senha. O link expira em 24 horas.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}" style="background:#34c5cc;color:#0f2b54;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;display:inline-block;">Entrar agora</a>
      </p>
      <p style="font-size:12px;color:#64748b;">Se o botão não funcionar, copie o link abaixo no seu navegador:</p>
      <p style="font-size:11px;color:#64748b;word-break:break-all;background:#f8fafc;padding:8px;border-radius:6px;">${escapeHtml(link)}</p>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Auto-cadastro de colaborador em tenant que aceita open signup.
 *
 * Pré-condições:
 *   - empresa.sys_config.allow_open_signup === true (controlado por tenant)
 *   - email ainda não existe em colaboradores da empresa
 *
 * Após criar o colaborador, dispara magic-link via Resend (email) e Z-API
 * (WhatsApp) — mesma lógica do /api/auth/magic-link.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const nomeCompleto = String(body?.nome_completo || '').trim();
    const cargo = body?.cargo ? String(body.cargo).trim() : null;
    const telefoneRaw = body?.telefone ? String(body.telefone).trim() : '';
    const redirectTo = typeof body?.redirectTo === 'string' ? body.redirectTo : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }
    if (!nomeCompleto || nomeCompleto.length < 2) {
      return NextResponse.json({ error: 'Nome completo obrigatório' }, { status: 400 });
    }
    const telefoneDigits = telefoneRaw.replace(/\D/g, '');
    if (telefoneDigits.length < 10) {
      return NextResponse.json({ error: 'Telefone obrigatório (com DDD)' }, { status: 400 });
    }

    const slug = getTenantSlug(req);
    if (!slug) {
      return NextResponse.json({ error: 'Tenant não identificado' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    const { data: empresa } = await sb
      .from('empresas')
      .select('id, nome, sys_config')
      .eq('slug', slug)
      .maybeSingle();

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }
    if (empresa.sys_config?.allow_open_signup !== true) {
      return NextResponse.json({ error: 'Auto-cadastro não habilitado nesta empresa' }, { status: 403 });
    }

    // Garante que email não existe ainda nesse tenant
    const { data: existing } = await sb
      .from('colaboradores')
      .select('id')
      .eq('email', email)
      .eq('empresa_id', empresa.id)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado nessa empresa' }, { status: 409 });
    }

    // Cria colaborador (role mínima — admin promove se necessário).
    // Schema da tabela: empresa_id, email, nome_completo, cargo, area_depto,
    // telefone, gestor_nome/email/whatsapp, role. Não tem coluna `ativo`.
    const { error: insertErr } = await sb.from('colaboradores').insert({
      empresa_id: empresa.id,
      email,
      nome_completo: nomeCompleto,
      cargo,
      telefone: telefoneDigits,
      role: 'colaborador',
    });
    if (insertErr) {
      console.error('[signup] insert error:', insertErr.message);
      return NextResponse.json({ error: 'Erro ao criar cadastro' }, { status: 500 });
    }

    // Resolve redirect e gera magic link (mesma lógica do /api/auth/magic-link)
    let safeRedirectTo: string | undefined;
    let nextPath = '/dashboard';
    let origin = '';
    if (redirectTo) {
      try {
        const parsed = new URL(redirectTo);
        origin = parsed.origin;
        safeRedirectTo = `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/dashboard';
      } catch {}
    }

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: safeRedirectTo || undefined },
    });

    if (linkErr || !linkData?.properties) {
      console.error('[signup] generateLink failed:', linkErr?.message);
      // Cadastro foi criado, mas link falhou — reportar pra cliente
      return NextResponse.json({
        success: true,
        warning: 'Cadastro criado, mas falhou ao enviar o link. Tente fazer login.',
      });
    }

    const tokenHash = linkData.properties.hashed_token;
    const actionLink = linkData.properties.action_link;
    const nome = nomeCompleto.split(' ')[0] || '';
    const empresaNome = empresa.nome || 'Vertho';
    const results = { email: false, whatsapp: false };

    // Email via Resend
    if (process.env.RESEND_API_KEY && actionLink) {
      try {
        const linkPraEmail = (origin && tokenHash)
          ? `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`
          : actionLink;

        const resend = new Resend(process.env.RESEND_API_KEY);
        const sendResult = await resend.emails.send({
          from: EMAIL_FROM_DEFAULT,
          to: email,
          subject: `${empresaNome} — bem-vindo!`,
          html: emailHtml({ nome, empresaNome, link: linkPraEmail }),
        });
        results.email = !((sendResult as any)?.error);
      } catch (e: any) {
        console.error('[signup] Resend exception:', e.message);
      }
    }

    // WhatsApp via Z-API (telefone é obrigatório no signup)
    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (zapiInstance && zapiToken && telefoneDigits && tokenHash && origin) {
      try {
        let phone = telefoneDigits;
        if (phone.length <= 11) phone = `55${phone}`;

        const whatsappLink = `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`;
        const msg = `Olá, ${nome}! Bem-vindo à *${empresaNome}*! 🎉\n\nSeu link de acesso:\n${whatsappLink}\n\nClique para entrar direto, sem senha.\nEste link expira em 24h.`;

        const res = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '' },
          body: JSON.stringify({ phone, message: msg }),
        });
        results.whatsapp = res.ok;
      } catch (e: any) {
        console.error('[signup] Z-API error:', e.message);
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[signup]', err.message);
    return NextResponse.json({ error: `Erro: ${err.message}` }, { status: 500 });
  }
}
