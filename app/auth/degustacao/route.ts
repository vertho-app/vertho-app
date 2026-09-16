import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { authLimiter } from '@/lib/rate-limit';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import {
  abrirAcessoDaDegustacao,
  escritaDeOutraOrigem,
  hostnameDaRequisicao,
} from '@/lib/demo/degustacao-acesso';
import { destinoDaDegustacao } from '@/lib/demo/acme-prospect-config';

export const dynamic = 'force-dynamic';

function loginComErro(req: NextRequest, codigo: string) {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', codigo);
  return NextResponse.redirect(url);
}

/**
 * Entrada REABRÍVEL do convidado da degustação (etapa 01 da versão A).
 *
 * Antes, o link do roteiro era um magic link consumido na primeira abertura.
 * Quem fechava a aba e voltava depois batia em "link inválido" e não tinha como
 * pedir outro: o e-mail de acesso é técnico e aleatório. Aqui o link é um PASSE
 * assinado, válido enquanto o passaporte vale, e o magic link nasce no servidor
 * a cada abertura — o que a pessoa perdeu era a porta, nunca o progresso, que
 * vive no banco e é reencontrado pela identidade.
 *
 * O que NÃO vem do cliente: e-mail, tenant e identidade. O passe carrega só o
 * ambiente, a sessão e o prazo; o resto sai de `demo_prospect_sessions`. As três
 * checagens moram em `abrirAcessoDaDegustacao`, compartilhadas com a versão B.
 *
 * ⚠️ Este GET cria a sessão, e por isso o robô de preview do WhatsApp "entra"
 * junto. `Medido 16/09/2026`: 6 dos 8 prospects reais tiveram o acesso carimbado
 * 12 s a 1 min 44 s depois da criação, sem nenhum JavaScript rodando. A versão B
 * não usa este GET: o convite abre `/degustacao`, e a sessão só nasce no POST
 * abaixo, que é um clique.
 */
export async function GET(req: NextRequest) {
  const acesso = await abrirAcessoDaDegustacao(
    req.nextUrl.searchParams.get('passe'),
    req.nextUrl.hostname,
    ['auth_email'],
  );
  if (acesso.status === 'expirado') return loginComErro(req, 'convite-expirado');
  if (acesso.status === 'invalido') return loginComErro(req, 'convite-invalido');
  if (acesso.status === 'indisponivel') {
    console.error('[auth/degustacao] carregar sessão do passaporte:', acesso.motivo);
    return loginComErro(req, 'indisponivel');
  }

  const nextPath = '/dashboard';
  const { data: link, error: linkError } = await acesso.tdb.raw.auth.admin.generateLink({
    type: 'magiclink',
    email: acesso.sessao.auth_email,
    options: { redirectTo: new URL(nextPath, req.url).toString() },
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[auth/degustacao] gerar link do convidado:', linkError?.message || 'token ausente');
    return loginComErro(req, 'indisponivel');
  }

  const supabase = await createSupabaseServerClient();
  const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (otpError) {
    console.error('[auth/degustacao] verifyOtp:', otpError.message);
    return loginComErro(req, 'indisponivel');
  }

  // O primeiro acesso é carimbado uma vez só (a coluna só é escrita quando está
  // nula), então reabrir não reescreve a marca nem falseia o acompanhamento.
  try {
    const { recordAcmeProspectPersonalAccess } = await import('@/lib/demo/acme-prospect-tracking');
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await recordAcmeProspectPersonalAccess(user);
  } catch (trackingError: any) {
    console.warn('[auth/degustacao] registrar acesso do prospect:', trackingError?.message);
  }

  return NextResponse.redirect(new URL(nextPath, req.url));
}

function semCache(res: NextResponse) {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * Volta para a página de boas-vindas com um aviso.
 *
 * O passe só é devolvido quando ele mesmo é válido (ou seja, veio da página da
 * própria pessoa): recusa de origem estranha nunca reflete o que chegou.
 */
function paraAPagina(req: NextRequest, aviso: string, passe?: string) {
  const url = new URL('/degustacao', req.url);
  if (passe) url.searchParams.set('passe', passe);
  url.searchParams.set('aviso', aviso);
  return semCache(NextResponse.redirect(url, 303));
}

/**
 * Botão pessoal da página de boas-vindas (versão B): "Descobrir meu perfil",
 * "Continuar", "Responder a situação", "Ler a devolutiva".
 *
 * É AQUI que a sessão do convidado nasce na versão B, e por isso é POST: robô
 * de preview não envia formulário. O que protege, em ordem:
 *
 *   1. `csrfCheck` + origem do MESMO host. `csrfCheck` sozinho aceita qualquer
 *      `*.vertho.ai`, e um host de sala de apresentação não pode disparar login
 *      no host do convidado;
 *   2. passe válido, e só então o limite por sessão (barato antes de caro);
 *   3. as mesmas três checagens do GET (`abrirAcessoDaDegustacao`);
 *   4. destino por CHAVE de allowlist (`destinoDaDegustacao`), nunca caminho
 *      vindo do cliente.
 *
 * Quem já está logado como este convidado não gera outro magic link. Os
 * carimbos (`personal_accessed_at`, e `invite_opened_at` quando o JavaScript da
 * página não chegou a registrar a abertura) só são escritos quando estão nulos.
 * Toda recusa volta para a página em 303, nunca em JSON cru dentro do WhatsApp.
 */
export async function POST(req: NextRequest) {
  const host = hostnameDaRequisicao(req);
  if (escritaDeOutraOrigem(req, host)) return paraAPagina(req, 'origem');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return paraAPagina(req, 'origem');
  }
  const passe = String(form.get('passe') || '');
  const payload = verificarPasseDegustacao(passe);
  if (!payload) return paraAPagina(req, 'expirado');

  const limitado = await authLimiter.check(req, `degustacao:${payload.sid}`);
  if (limitado) return paraAPagina(req, 'aguarde', passe);

  const acesso = await abrirAcessoDaDegustacao(passe, host, [
    'auth_email',
    'personal_accessed_at',
    'invite_opened_at',
  ]);
  if (acesso.status === 'indisponivel') {
    console.error('[auth/degustacao] POST carregar sessão:', acesso.motivo);
    return paraAPagina(req, 'indisponivel', passe);
  }
  if (acesso.status !== 'ok') return paraAPagina(req, acesso.status, passe);

  const destino = destinoDaDegustacao(form.get('destino'));
  if (!destino) return paraAPagina(req, 'destino', passe);

  const supabase = await createSupabaseServerClient();
  const { data: atual, error: erroAtual } = await supabase.auth.getUser();
  const emailAtual = String(atual?.user?.email || '').trim().toLowerCase();
  const jaEhOConvidado = !erroAtual && emailAtual === String(acesso.sessao.auth_email).trim().toLowerCase();

  if (!jaEhOConvidado) {
    const { data: link, error: linkError } = await acesso.tdb.raw.auth.admin.generateLink({
      type: 'magiclink',
      email: acesso.sessao.auth_email,
      options: { redirectTo: new URL(destino, req.url).toString() },
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error('[auth/degustacao] POST gerar link:', linkError?.message || 'token ausente');
      return paraAPagina(req, 'indisponivel', passe);
    }
    const { error: otpError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    if (otpError) {
      console.error('[auth/degustacao] POST verifyOtp:', otpError.message);
      return paraAPagina(req, 'indisponivel', passe);
    }
  }

  const agora = new Date().toISOString();
  if (!acesso.sessao.personal_accessed_at) {
    const { error: erroPessoal } = await acesso.tdb.from('demo_prospect_sessions')
      .update({ personal_accessed_at: agora })
      .eq('session_id', acesso.sessionId)
      .is('personal_accessed_at', null);
    if (erroPessoal) console.warn('[auth/degustacao] carimbar início pessoal:', erroPessoal.message);
  }
  if (!acesso.sessao.invite_opened_at) {
    const { error: erroAbertura } = await acesso.tdb.from('demo_prospect_sessions')
      .update({ invite_opened_at: agora })
      .eq('session_id', acesso.sessionId)
      .is('invite_opened_at', null);
    if (erroAbertura) console.warn('[auth/degustacao] carimbar abertura pelo clique:', erroAbertura.message);
  }

  return semCache(NextResponse.redirect(new URL(destino, req.url), 303));
}
