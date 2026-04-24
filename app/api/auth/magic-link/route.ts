import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, redirectTo } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });

    const trimmed = email.trim().toLowerCase();
    const sb = createSupabaseAdmin();

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: redirectTo || undefined },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[magic-link] generateLink failed:', linkErr?.message);
      return NextResponse.json({ error: linkErr?.message || 'Falha ao gerar link' });
    }

    const magicLink = linkData.properties.action_link;

    const colab = (await sb.from('colaboradores')
      .select('nome_completo, telefone, empresa_id')
      .eq('email', trimmed)
      .maybeSingle()).data;

    const empresa = colab?.empresa_id
      ? (await sb.from('empresas').select('nome').eq('id', colab.empresa_id).maybeSingle()).data
      : null;

    const nome = colab?.nome_completo?.split(' ')[0] || '';
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
          body: JSON.stringify({
            from: fromEmail,
            to: trimmed,
            subject: `Seu acesso — ${empresaNome}`,
            html,
          }),
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
    if (zapiInstance && zapiToken && colab?.telefone) {
      try {
        let phone = colab.telefone.replace(/\D/g, '');
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
      return NextResponse.json({ error: 'Não foi possível enviar o link. Tente novamente.' });
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[magic-link]', err.message);
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' });
  }
}
