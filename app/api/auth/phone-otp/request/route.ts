import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { issueOtp } from '@/lib/phone-otp';
import { resolveAppLocale } from '@/lib/i18n';
import { otpWhatsapp } from '@/lib/i18n-auth-templates';
import { authLimiter } from '@/lib/rate-limit';
import { sendWhatsapp } from '@/lib/whatsapp';

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
  // Rate limit por IP — complementa o limite por-telefone do banco (que um
  // atacante contornaria variando o número), barrando flood de SMS/WhatsApp.
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { telefone, locale: bodyLocale } = await req.json();
    const locale = resolveAppLocale(bodyLocale, req.cookies.get('vertho-locale')?.value);

    const check = validateWhatsApp(telefone);
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

    // Envia o código pelo serviço central (failover Z-API → WaSender).
    const empresaNome = empresa.nome || 'Vertho';
    const msg = otpWhatsapp(locale, { empresaNome, code: issued.code });
    const r = await sendWhatsapp({ kind: 'text', phone: e164, text: msg });
    if (!r.ok) {
      console.error('[phone-otp/request] envio falhou:', r.reason);
      return NextResponse.json({ error: 'Não foi possível enviar o código pelo WhatsApp. Tente novamente.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[phone-otp/request]', err.message);
    return NextResponse.json({ error: 'Erro ao solicitar código.' }, { status: 500 });
  }
}
