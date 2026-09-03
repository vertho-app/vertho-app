import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { resolveTenant } from '@/lib/tenant-resolver';

export const dynamic = 'force-dynamic';

function loginComErro(req: NextRequest, codigo: string) {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', codigo);
  return NextResponse.redirect(url);
}

/**
 * Entrada REABRÍVEL do convidado da degustação (etapa 01).
 *
 * Antes, o link do roteiro era um magic link consumido na primeira abertura.
 * Quem fechava a aba e voltava depois batia em "link inválido" e não tinha como
 * pedir outro: o e-mail de acesso é técnico e aleatório. Aqui o link é um PASSE
 * assinado, válido enquanto o passaporte vale, e o magic link nasce no servidor
 * a cada abertura — o que a pessoa perdeu era a porta, nunca o progresso, que
 * vive no banco e é reencontrado pela identidade.
 *
 * O que NÃO vem do cliente: e-mail, tenant e identidade. O passe carrega só o
 * ambiente, a sessão e o prazo; o resto sai de `demo_prospect_sessions`.
 *
 * Três checagens antes de criar sessão:
 *   1. assinatura e prazo do passe (contexto de assinatura próprio, ver
 *      `lib/demo/degustacao-passe`);
 *   2. o ambiente do passe é o MESMO do hostname — passe de um ambiente não
 *      abre sessão no outro;
 *   3. a sessão existe, não foi fechada e ainda está no prazo no BANCO. O passe
 *      diz o que foi emitido; o banco diz o que ainda vale. Um passaporte
 *      revogado antes da hora precisa fechar a porta imediatamente.
 */
export async function GET(req: NextRequest) {
  const passe = verificarPasseDegustacao(req.nextUrl.searchParams.get('passe'));
  if (!passe) return loginComErro(req, 'convite-expirado');

  const tenant = await resolveTenant(req.nextUrl.hostname.split('.')[0]);
  if (!tenant?.id || tenant.slug !== passe.tenant) {
    return loginComErro(req, 'convite-invalido');
  }

  const sb = createSupabaseAdmin();
  const { data: sessao, error } = await sb.from('demo_prospect_sessions')
    .select('auth_email,expires_at,access_closed_at')
    .eq('empresa_id', tenant.id)
    .eq('session_id', passe.sid)
    .maybeSingle();
  // supabase-js RETORNA o erro: sem este check, uma falha de banco viraria
  // "sessão não encontrada" e o convidado veria "convite inválido" por causa de
  // um problema nosso.
  if (error) {
    console.error('[auth/degustacao] carregar sessão do passaporte:', error.message);
    return loginComErro(req, 'indisponivel');
  }
  if (!sessao || sessao.access_closed_at) return loginComErro(req, 'convite-expirado');
  if (Date.parse(sessao.expires_at) <= Date.now()) return loginComErro(req, 'convite-expirado');

  const nextPath = '/dashboard';
  const { data: link, error: linkError } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: sessao.auth_email,
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
