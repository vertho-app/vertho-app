import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  DEMO_PRESENTATION_DEVICE_PARAM,
  DEMO_PRESENTATION_TICKET_PARAM,
  getDemoPresentationDeviceQueryValue,
  getDemoPresentationRoleFromHostname,
  parseDemoPresentationDevice,
} from '@/lib/demo/presentation';
import { verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import { gerarMagicLinkPapelApresentacaoDemo } from '@/lib/demo/reset-acme-demo';

export const dynamic = 'force-dynamic';

function loginComErro(req: NextRequest, codigo: string) {
  const url = new URL('/login', req.url);
  url.searchParams.set('error', codigo);
  return NextResponse.redirect(url);
}

/**
 * Autenticação automática da sala de apresentação.
 *
 * O passe só nasce numa server action de platform admin, expira em quatro
 * horas e é assinado no servidor. O hostname escolhe um dos três papéis da
 * allowlist; nenhum e-mail, tenant ou role vem da query string. Assim o
 * dropdown entrega a conveniência de uma senha "por trás" sem expor senha no
 * browser e sem criar override de autorização.
 */
export async function GET(req: NextRequest) {
  const role = getDemoPresentationRoleFromHostname(req.nextUrl.hostname);
  if (!role) return loginComErro(req, 'apresentacao-invalida');

  const ticket = req.nextUrl.searchParams.get('ticket');
  if (!verifyDemoPresentationTicket(ticket)) {
    return loginComErro(req, 'apresentacao-expirada');
  }

  const login = await gerarMagicLinkPapelApresentacaoDemo(role.key);
  if ('error' in login) {
    console.error('[auth/apresentacao] gerar login:', login.error);
    return loginComErro(req, 'apresentacao-indisponivel');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: login.tokenHash,
    type: 'email',
  });
  if (error) {
    console.error('[auth/apresentacao] verifyOtp:', error.message);
    return loginComErro(req, 'apresentacao-indisponivel');
  }

  const destino = new URL(login.nextPath, req.url);
  // O shell guarda o passe em sessionStorage e remove este parâmetro da barra
  // de endereço. Ele precisa chegar uma vez a cada origem para que o próximo
  // salto do dropdown também seja automático.
  destino.searchParams.set(DEMO_PRESENTATION_TICKET_PARAM, ticket!);
  // A preferência também precisa atravessar os hostnames. Quando o link vem da
  // preparação inicial, o padrão explícito é Computador; valores arbitrários
  // são descartados e nunca reaproveitados no redirect.
  const device = parseDemoPresentationDevice(
    req.nextUrl.searchParams.get(DEMO_PRESENTATION_DEVICE_PARAM),
  ) || 'desktop';
  destino.searchParams.set(
    DEMO_PRESENTATION_DEVICE_PARAM,
    getDemoPresentationDeviceQueryValue(device),
  );
  return NextResponse.redirect(destino);
}
