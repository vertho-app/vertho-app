import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { issueOtp } from '@/lib/phone-otp';
import { resolveAppLocale } from '@/lib/i18n';
import { otpWhatsapp, otpSms } from '@/lib/i18n-auth-templates';
import { authLimiter } from '@/lib/rate-limit';
import { sendWhatsapp } from '@/lib/whatsapp';
import { sendSms } from '@/lib/sms';
import { enviarTemplateOtp, cloudApiConfigurada } from '@/lib/whatsapp/cloud-api';

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

    const empresaNome = empresa.nome || 'Vertho';

    // ── 1º: Cloud API oficial, com o template `otp_acesso` (APPROVED em 14/08) ──
    //
    // Preferida ao caminho por QR porque não depende de sessão pareada — foi
    // exatamente isso que caiu em 11 e 13/08 e derrubou o canal. Categoria
    // AUTHENTICATION, a mais barata no Brasil.
    //
    // Só o OTP passa por aqui: os templates da cadência ainda estão PENDING, e
    // mandar a cadência pela Cloud API antes disso seria trocar um canal que
    // funciona por um que ainda não pode enviar nada.
    if (cloudApiConfigurada()) {
      const cloud = await enviarTemplateOtp(
        { phone: e164, codigo: issued.code },
        { motivo: 'otp', empresaId: empresa.id, colaboradorId: colab.id },
      );
      if (cloud.ok) return NextResponse.json({ ok: true, canal: 'whatsapp-oficial' });
      // Não retorna: cai para o caminho antigo. Enquanto a migração não fecha,
      // ter os dois é o que impede uma falha na Cloud API de virar "ninguém entra".
      console.error('[phone-otp/request] Cloud API falhou:', cloud.reason);
    }

    // ── 2º: caminho legado (Z-API → WaSender), texto livre ──
    const msg = otpWhatsapp(locale, { empresaNome, code: issued.code });
    const r = await sendWhatsapp({ kind: 'text', phone: e164, text: msg }, { motivo: 'otp', empresaId: empresa.id, colaboradorId: colab.id });
    if (r.ok) return NextResponse.json({ ok: true, canal: 'whatsapp' });

    // ── CONTINGÊNCIA: SMS ────────────────────────────────────────────────────
    //
    // Medido em 13/08/2026: a instância Z-API caiu e derrubou junto o único
    // caminho de login por telefone das 271 pessoas com `login_por_whatsapp`.
    // E-mail não substitui aqui — quem entra por este fluxo digitou um número,
    // não um endereço, e 4 dessas pessoas não têm e-mail cadastrado.
    //
    // O código JÁ foi emitido acima e vale 10 minutos: mandá-lo por outro canal
    // é entregar o MESMO segredo, não emitir um novo. Reemitir aqui invalidaria
    // o código que talvez já tenha chegado por WhatsApp (a falha pode ser no
    // aceite, com a mensagem saindo mesmo assim) e deixaria a pessoa com dois
    // códigos, só um válido.
    console.error('[phone-otp/request] WhatsApp falhou:', r.reason);
    const sms = await sendSms(
      { phone: e164, text: otpSms(locale, { empresaNome, code: issued.code }) },
      { motivo: 'otp', empresaId: empresa.id, colaboradorId: colab.id },
    );
    if (sms.ok) return NextResponse.json({ ok: true, canal: 'sms' });

    // Os dois canais fora. A mensagem ao usuário não cita WhatsApp: ele pediu
    // "um código", e dizer o nome do canal que falhou o faz esperar por algo que
    // não vem. `bloqueadoPorTeto` não vaza para a resposta — é limite nosso, não
    // erro dele, e o rastro fica na degradação `sms-teto-diario`.
    console.error('[phone-otp/request] SMS também falhou:', sms.reason);
    return NextResponse.json({ error: 'Não foi possível enviar o código agora. Tente novamente em alguns minutos.' }, { status: 502 });
  } catch (err: any) {
    console.error('[phone-otp/request]', err.message);
    return NextResponse.json({ error: 'Erro ao solicitar código.' }, { status: 500 });
  }
}
