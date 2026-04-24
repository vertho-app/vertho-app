import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, redirectTo } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });

    const trimmed = email.trim().toLowerCase();
    const sb = createSupabaseAdmin();

    // redirectTo aponta para /auth/callback que troca o code por sessão
    const origin = redirectTo ? new URL(redirectTo).origin : undefined;
    const callbackUrl = origin ? `${origin}/auth/callback?next=/dashboard` : undefined;

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: callbackUrl || undefined },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      const msg = linkErr?.message || 'generateLink não retornou action_link';
      console.error('[magic-link] generateLink failed:', msg);
      return NextResponse.json({ error: `Falha ao gerar link: ${msg}` });
    }

    const magicLink = linkData.properties.action_link;

    // Busca colaborador — usa findColabByEmail que resolve tenant pelo cookie
    const colab = await findColabByEmail(trimmed, 'id, nome_completo, telefone, empresa_id');
    console.log('[magic-link] colab:', colab?.nome_completo, 'tel:', colab?.telefone, 'empresa:', colab?.empresa_id);

    // Fallback: se findColabByEmail não achou (sem cookie de tenant), busca direto
    let telefone = (colab as any)?.telefone;
    let nomeCompleto = colab?.nome_completo;
    let empresaId = colab?.empresa_id;

    if (!colab) {
      const { data: rows } = await sb.from('colaboradores')
        .select('nome_completo, telefone, empresa_id')
        .ilike('email', trimmed)
        .limit(1);
      if (rows?.[0]) {
        telefone = rows[0].telefone;
        nomeCompleto = rows[0].nome_completo;
        empresaId = rows[0].empresa_id;
        console.log('[magic-link] fallback found:', nomeCompleto, 'tel:', telefone);
      }
    }

    const empresa = empresaId
      ? (await sb.from('empresas').select('nome').eq('id', empresaId).maybeSingle()).data
      : null;

    const nome = nomeCompleto?.split(' ')[0] || '';
    const empresaNome = empresa?.nome || 'Vertho';

    const results = { email: false, whatsapp: false };

    // 1) Email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const fromEmail = process.env.EMAIL_FROM || 'Vertho <noreply@vertho.com.br>';
        const html = `
          <div style="font-family:system-ui;max-width:480px;margin:0 auto;padding:32px 24px;background:#091D35;border-radius:16px;color:#fff">
            <p style="font-size:15px;color:#ccc">Olá${nome ? `, ${nome}` : ''}!</p>
            <p style="font-size:15px;color:#ccc">Clique no botão abaixo para acessar a plataforma <strong>${empresaNome}</strong>:</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${magicLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0D9488,#34C5CC);color:#062032;font-weight:bold;font-size:15px;border-radius:12px;text-decoration:none">
                Acessar plataforma
              </a>
            </div>
            <p style="font-size:12px;color:#666">Este link é pessoal e expira em 24h.</p>
          </div>`;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from: fromEmail, to: trimmed, subject: `Seu acesso — ${empresaNome}`, html }),
        });
        results.email = res.ok;
        if (!res.ok) console.error('[magic-link] Resend error:', await res.text());
      } catch (e: any) {
        console.error('[magic-link] Resend error:', e.message);
      }
    }

    // 2) WhatsApp via Z-API
    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (zapiInstance && zapiToken && telefone) {
      try {
        let phone = String(telefone).replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        const msg = `Olá, ${nome}! 🔐\n\nSeu link de acesso à *${empresaNome}*:\n${magicLink}\n\nClique para entrar direto, sem senha.\nEste link expira em 24h.`;

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
        !resendKey && 'RESEND_API_KEY não configurada',
        !telefone && `colaborador sem telefone (found: ${!!colab})`,
        (!zapiInstance || !zapiToken) && 'Z-API não configurado',
      ].filter(Boolean).join('; ');
      return NextResponse.json({ error: `Não foi possível enviar. ${detail || 'Verifique os logs.'}` });
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[magic-link]', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return NextResponse.json({ error: `Erro: ${err.message}` });
  }
}
