import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { resolveAppLocale } from '@/lib/i18n';
import { authLimiter } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { sendAccessLink } from '@/lib/notifications/access-link-service';

export const dynamic = 'force-dynamic';

/**
 * Auto-cadastro de colaborador em tenant que aceita open signup.
 *
 * Pré-condições:
 *   - empresa.sys_config.allow_open_signup === true (controlado por tenant)
 *   - email ainda não existe em colaboradores da empresa
 *
 * Após criar o colaborador, envia o link de acesso (boas-vindas) por email +
 * WhatsApp via o serviço central (status explícito por canal).
 */
export async function POST(req: NextRequest) {
  // Rate limit por IP — cria colaborador e dispara email/WhatsApp (custo + abuso).
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const nomeCompleto = String(body?.nome_completo || '').trim();
    const cargo = body?.cargo ? String(body.cargo).trim() : null;
    const telefoneRaw = body?.telefone ? String(body.telefone).trim() : '';
    const redirectTo = typeof body?.redirectTo === 'string' ? body.redirectTo : '';
    const locale = resolveAppLocale(body?.locale, req.cookies.get('vertho-locale')?.value);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }
    if (!nomeCompleto || nomeCompleto.length < 2) {
      return NextResponse.json({ error: 'Nome completo obrigatório' }, { status: 400 });
    }
    // Valida e normaliza pra E.164 ("5511912345678" — 13 dígitos com 55). Convenção:
    // SEMPRE salvar com country code, pra Z-API consumir direto sem prefixar em runtime.
    const phoneCheck = validateWhatsApp(telefoneRaw);
    if (phoneCheck.valid === false) {
      return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
    }
    const telefoneE164 = phoneCheck.e164;

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

    // Garante que email não existe ainda nesse tenant.
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
    const { error: insertErr } = await sb.from('colaboradores').insert({
      empresa_id: empresa.id,
      email,
      nome_completo: nomeCompleto,
      cargo,
      telefone: telefoneE164,
      role: 'colaborador',
    });
    if (insertErr) {
      console.error('[signup] insert error:', insertErr.message);
      return NextResponse.json({ error: 'Erro ao criar cadastro' }, { status: 500 });
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: redirect.safeRedirectTo },
    });
    if (linkErr || !linkData?.properties) {
      console.error('[signup] generateLink failed:', linkErr?.message);
      // Cadastro foi criado, mas o link falhou — reporta sem enganar.
      return NextResponse.json({
        success: true,
        warning: 'Cadastro criado, mas falhou ao enviar o link. Tente fazer login.',
      });
    }

    const tokenHash = linkData.properties.hashed_token;
    const callbackLink = tokenHash
      ? `${redirect.origin}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(redirect.nextPath)}`
      : null;

    const result = await sendAccessLink({
      kind: 'signup',
      to: email,
      telefone: telefoneE164,
      nome: nomeCompleto.split(' ')[0] || '',
      empresaNome: empresa.nome || 'Vertho',
      empresaId: empresa.id, // gate: bloqueia envio real se o tenant for demo
      locale,
      emailLink: callbackLink || linkData.properties.action_link,
      whatsappLink: callbackLink,
    });

    // O cadastro JÁ existe; se nenhum canal saiu, devolve sucesso COM warning
    // (corrige o "success:true" mudo de antes — o usuário precisa saber que o
    // link não chegou e que pode pedir um novo via "entrar").
    if (!result.anySent) {
      console.error('[signup] cadastro criado mas link não enviado:', result.emailReason, result.whatsappReason);
      return NextResponse.json({
        success: true,
        email: result.email,
        whatsapp: result.whatsapp,
        warning: 'Cadastro criado, mas não foi possível enviar o link agora. Use "entrar" para receber um novo.',
      });
    }

    return NextResponse.json({ success: true, email: result.email, whatsapp: result.whatsapp });
  } catch (err: any) {
    console.error('[signup]', err.message);
    return NextResponse.json({ error: `Erro: ${err.message}` }, { status: 500 });
  }
}
