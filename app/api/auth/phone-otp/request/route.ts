import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsAppBR } from '@/lib/phone';
import { issueOtp } from '@/lib/phone-otp';

export const dynamic = 'force-dynamic';

/**
 * Solicita um código OTP de login por WhatsApp.
 *
 * Body: { telefone }   — tenant resolvido pelo header x-tenant-slug.
 *
 * Resposta genérica { ok: true } mesmo quando o telefone não existe
 * (anti-enumeração). Só erros de rate-limit/validação são surfaçados.
 */
export async function POST(req: NextRequest) {
  try {
    const { telefone } = await req.json();

    const check = validateWhatsAppBR(telefone);
    if (check.valid === false) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    const e164 = check.e164;

    const slug = getTenantSlug(req);
    if (!slug) {
      // Sem tenant não há como escopar o login — resposta genérica.
      return NextResponse.json({ ok: true });
    }

    const sb = createSupabaseAdmin();
    const { data: empresa } = await sb
      .from('empresas')
      .select('id, nome')
      .eq('slug', slug)
      .maybeSingle();
    if (!empresa) return NextResponse.json({ ok: true });

    const { data: colab } = await sb
      .from('colaboradores')
      .select('id')
      .eq('empresa_id', empresa.id)
      .eq('telefone', e164)
      .eq('login_por_whatsapp', true)
      .limit(1)
      .maybeSingle();

    // Número não cadastrado pra login por WhatsApp → resposta genérica
    // (não revela se o número existe).
    if (!colab) return NextResponse.json({ ok: true });

    const issued = await issueOtp(sb, empresa.id, e164);
    if (issued.ok === false) {
      return NextResponse.json({ error: issued.error }, { status: 429 });
    }

    // Envia o código via Z-API (mesmo canal do magic-link).
    const zapiInstance = process.env.ZAPI_INSTANCE_ID;
    const zapiToken = process.env.ZAPI_TOKEN;
    if (zapiInstance && zapiToken) {
      const empresaNome = empresa.nome || 'Vertho';
      const msg = `*${empresaNome}* — seu código de acesso:\n\n*${issued.code}*\n\nDigite esse código no app para entrar. Ele expira em 10 minutos.\nSe você não solicitou, ignore esta mensagem.`;
      try {
        const res = await fetch(
          `https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Client-Token': process.env.ZAPI_CLIENT_TOKEN || '' },
            body: JSON.stringify({ phone: e164, message: msg }),
          },
        );
        if (!res.ok) {
          console.error('[phone-otp/request] Z-API error:', res.status, (await res.text()).slice(0, 200));
          return NextResponse.json({ error: 'Não foi possível enviar o código pelo WhatsApp. Tente novamente.' }, { status: 502 });
        }
      } catch (e: any) {
        console.error('[phone-otp/request] Z-API exception:', e.message);
        return NextResponse.json({ error: 'Falha ao enviar o código. Tente novamente.' }, { status: 502 });
      }
    } else {
      console.error('[phone-otp/request] Z-API não configurado');
      return NextResponse.json({ error: 'Canal WhatsApp indisponível no momento.' }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[phone-otp/request]', err.message);
    return NextResponse.json({ error: 'Erro ao solicitar código.' }, { status: 500 });
  }
}
