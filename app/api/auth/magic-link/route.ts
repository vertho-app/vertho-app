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
    const origin = redirectTo ? new URL(redirectTo).origin : '';

    // Gera magic link via admin API (sem rate limit)
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: origin ? `${origin}/dashboard` : undefined },
    });

    if (linkErr || !linkData?.properties) {
      console.error('[magic-link] generateLink failed:', linkErr?.message);
      return NextResponse.json({ error: `Falha ao gerar link: ${linkErr?.message || 'erro desconhecido'}` });
    }

    const tokenHash = linkData.properties.hashed_token;
    const actionLink = linkData.properties.action_link;

    // Busca colaborador para WhatsApp
    const colab = await findColabByEmail(trimmed, 'id, nome_completo, telefone, empresa_id');
    let telefone = colab?.telefone;
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
      }
    }

    const empresa = empresaId
      ? (await sb.from('empresas').select('nome').eq('id', empresaId).maybeSingle()).data
      : null;

    const nome = nomeCompleto?.split(' ')[0] || '';
    const empresaNome = empresa?.nome || 'Vertho';
    const results = { email: false, whatsapp: false };

    // 1) Email — usa o Supabase action_link nativo (redireciona via Supabase verify)
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const sbAnon = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { error: emailErr } = await sbAnon.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: origin ? `${origin}/dashboard` : undefined },
      });
      results.email = !emailErr;
      if (emailErr) console.error('[magic-link] OTP email error:', emailErr.message);
    } catch (e: any) {
      console.error('[magic-link] email error:', e.message);
    }

    // 2) WhatsApp — envia URL própria /auth/callback que verifica token server-side
    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (zapiInstance && zapiToken && telefone && tokenHash && origin) {
      try {
        let phone = String(telefone).replace(/\D/g, '');
        if (phone.length <= 11) phone = `55${phone}`;

        // URL própria — nosso callback verifica o token_hash server-side
        const whatsappLink = `${origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink`;

        const msg = `Olá, ${nome}! 🔐\n\nSeu link de acesso à *${empresaNome}*:\n${whatsappLink}\n\nClique para entrar direto, sem senha.\nEste link expira em 24h.`;

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
