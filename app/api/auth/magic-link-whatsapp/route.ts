'use server';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { email, redirectTo } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, telefone, empresa_id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!colab?.telefone) return NextResponse.json({ sent: false });

    const { data: empresa } = await sb.from('empresas')
      .select('nome').eq('id', colab.empresa_id).maybeSingle();

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim().toLowerCase(),
      options: { redirectTo: redirectTo || undefined },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[magic-link-whatsapp]', linkErr?.message);
      return NextResponse.json({ sent: false });
    }

    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    const zapiClient = process.env.ZAPI_CLIENT_TOKEN || '';
    if (!zapiInstance || !zapiToken) return NextResponse.json({ sent: false });

    let phone = colab.telefone.replace(/\D/g, '');
    if (phone.length <= 11) phone = `55${phone}`;

    const nome = colab.nome_completo?.split(' ')[0] || '';
    const empresaNome = empresa?.nome || 'Vertho';
    const magicLink = linkData.properties.action_link;

    const msg = `Olá, ${nome}! 🔐

Seu link de acesso à *${empresaNome}*:
${magicLink}

Clique para entrar direto, sem senha.
Este link expira em 24h.`;

    await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': zapiClient },
      body: JSON.stringify({ phone, message: msg }),
    });

    return NextResponse.json({ sent: true });
  } catch (err: any) {
    console.error('[magic-link-whatsapp]', err.message);
    return NextResponse.json({ sent: false });
  }
}
