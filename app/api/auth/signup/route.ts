import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { resolveAppLocale } from '@/lib/i18n';
import { authLimiter, limitarPorDestino } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { sendAccessLink } from '@/lib/notifications/access-link-service';
import {
  CODIGO_CADASTRO_INDISPONIVEL, CODIGO_EMAIL_INVALIDO, CODIGO_EMAIL_JA_CADASTRADO, CODIGO_FALHA_NO_CADASTRO,
  CODIGO_NOME_OBRIGATORIO, CODIGO_TELEFONE_INVALIDO,
} from '@/lib/auth/login-respostas';

export const dynamic = 'force-dynamic';

/**
 * Auto-cadastro de colaborador em tenant que aceita open signup.
 *
 * Pré-condições:
 *   - empresa.sys_config.allow_open_signup === true (controlado por tenant)
 *   - email ainda não existe em colaboradores da empresa
 *
 * Após criar o colaborador, envia o link de acesso (boas-vindas) via o serviço
 * central (status explícito por canal). Por e-mail sempre; por WhatsApp só em
 * tenant de demonstração com conta recém-criada (ver `confiaNoTelefone`).
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
      return NextResponse.json({ error: 'Email inválido', codigo: CODIGO_EMAIL_INVALIDO }, { status: 400 });
    }
    if (!nomeCompleto || nomeCompleto.length < 2) {
      return NextResponse.json({ error: 'Nome completo obrigatório', codigo: CODIGO_NOME_OBRIGATORIO }, { status: 400 });
    }
    // Valida e normaliza pra E.164 ("5511912345678" — 13 dígitos com 55). Convenção:
    // SEMPRE salvar com country code, pra Z-API consumir direto sem prefixar em runtime.
    const phoneCheck = validateWhatsApp(telefoneRaw);
    if (phoneCheck.valid === false) {
      return NextResponse.json({ error: phoneCheck.error, codigo: CODIGO_TELEFONE_INVALIDO }, { status: 400 });
    }
    const telefoneE164 = phoneCheck.e164;

    // Teto por destinatário (R-79): o cadastro manda link para o e-mail E
    // para o WhatsApp informados. Sem teto por telefone, e-mails inventados em
    // série disparavam boas-vindas pagas para o número de uma pessoa só.
    const limiteDoEmail = await limitarPorDestino(req, 'email', email);
    if (limiteDoEmail) return limiteDoEmail;
    const limiteDoTelefone = await limitarPorDestino(req, 'telefone', telefoneE164);
    if (limiteDoTelefone) return limiteDoTelefone;

    const slug = getTenantSlug(req);
    if (!slug) {
      return NextResponse.json({ error: 'Tenant não identificado', codigo: CODIGO_CADASTRO_INDISPONIVEL }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    const { data: empresa, error: errEmpresa } = await sb
      .from('empresas')
      .select('id, nome, sys_config, is_demo')
      .eq('slug', slug)
      .maybeSingle();

    // Falha de leitura não é "empresa não encontrada": o 404 mandaria a pessoa
    // desistir de um cadastro que só precisa ser tentado de novo.
    if (errEmpresa) {
      console.error('[signup] leitura da empresa falhou:', errEmpresa.message);
      return NextResponse.json({ error: 'Erro ao criar cadastro', codigo: CODIGO_FALHA_NO_CADASTRO }, { status: 500 });
    }
    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada', codigo: CODIGO_CADASTRO_INDISPONIVEL }, { status: 404 });
    }
    if (empresa.sys_config?.allow_open_signup !== true) {
      return NextResponse.json({ error: 'Auto-cadastro não habilitado nesta empresa', codigo: CODIGO_CADASTRO_INDISPONIVEL }, { status: 403 });
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
      return NextResponse.json({ error: 'Email já cadastrado nessa empresa', codigo: CODIGO_EMAIL_JA_CADASTRADO }, { status: 409 });
    }

    // 🔴 `generateLink` NÃO cria usuário (R-76). Quem se cadastrava aqui era,
    // por definição, um e-mail novo, sem conta no Auth: o link falhava sempre,
    // a rota devolvia sucesso com aviso e a tela mostrava "Link enviado!". A
    // porta do e-mail (`magic-link`) e a do WhatsApp já criavam a conta antes;
    // esta era a terceira, e a única que não criava. Mesmo padrão delas: conta
    // que já existe volta como erro "already registered" e segue.
    //
    // 🔴 E a conta é criada ANTES da linha, porque é ela que diz se o telefone
    // do formulário pode valer alguma coisa (análise de 05/10/2026). A conta do
    // Auth é global por e-mail e o formulário é anônimo: quem digita o e-mail de
    // OUTRA pessoa e o próprio telefone recebia no WhatsApp o link de login da
    // conta dela (inclusive de platform admin), e a linha gravada com esse
    // telefone ainda fazia o `magic-link` repetir o envio. Telefone digitado por
    // quem não provou ser dono do e-mail não é canal de acesso. Só vale quando
    // a conta nasceu AGORA, neste pedido, e o tenant é de demonstração (a
    // degustação precisa do WhatsApp e o envio real já é barrado pelo gate de
    // demo). Em tenant real o link vai SÓ para o e-mail e o telefone não é
    // gravado até existir verificação por código.
    let contaNascidaAgora = false;
    try {
      const { error: createErr } = await sb.auth.admin.createUser({ email, email_confirm: true });
      contaNascidaAgora = !createErr;
      if (createErr && !/already|registered|exists/i.test(createErr.message)) {
        console.warn('[signup] createUser:', createErr.message);
      }
    } catch (e: any) {
      console.warn('[signup] createUser:', e?.message || e);
    }
    const confiaNoTelefone = empresa.is_demo === true && contaNascidaAgora;

    // Cria colaborador (role mínima — admin promove se necessário).
    const { error: insertErr } = await sb.from('colaboradores').insert({
      empresa_id: empresa.id,
      email,
      nome_completo: nomeCompleto,
      cargo,
      telefone: confiaNoTelefone ? telefoneE164 : null,
      role: 'colaborador',
    });
    if (insertErr) {
      console.error('[signup] insert error:', insertErr.message);
      return NextResponse.json({ error: 'Erro ao criar cadastro', codigo: CODIGO_FALHA_NO_CADASTRO }, { status: 500 });
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
      telefone: confiaNoTelefone ? telefoneE164 : null,
      nome: nomeCompleto.split(' ')[0] || '',
      empresaNome: empresa.nome || 'Vertho',
      empresaId: empresa.id, // gate: bloqueia envio real se o tenant for demo
      locale,
      emailLink: callbackLink || linkData.properties.action_link,
      whatsappLink: confiaNoTelefone ? callbackLink : null,
      channels: confiaNoTelefone ? ['email', 'whatsapp'] : ['email'],
      // Rede de segurança do botão do template quando o host não tem tenant.
      tenantSlug: slug,
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
    // R-67: a exceção fica no log; a tela recebe o código.
    return NextResponse.json({ error: 'Erro ao criar cadastro', codigo: CODIGO_FALHA_NO_CADASTRO }, { status: 500 });
  }
}
