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
import { recordAcmeProspectPresentationAccess } from '@/lib/demo/acme-prospect-tracking';

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
 * allowlist E o ambiente; nenhum e-mail, tenant ou role vem da query string.
 * Assim o dropdown entrega a conveniência de uma senha "por trás" sem expor
 * senha no browser e sem criar override de autorização.
 */
export async function GET(req: NextRequest) {
  const role = getDemoPresentationRoleFromHostname(req.nextUrl.hostname);
  if (!role) return loginComErro(req, 'apresentacao-invalida');

  const ticket = req.nextUrl.searchParams.get('ticket');
  const ticketPayload = verifyDemoPresentationTicket(ticket);
  if (!ticketPayload) {
    return loginComErro(req, 'apresentacao-expirada');
  }

  // O hostname diz QUAL SALA é esta; o passe diz para qual sala foi emitido.
  // Com mais de um ambiente demo, conferir só a assinatura deixaria um passe
  // válido de um ambiente abrir sessão no outro — mesma assinatura, tenant
  // diferente. O passe vale onde foi emitido, e em nenhum outro lugar.
  if (ticketPayload.tenant !== role.tenantSlug) {
    return loginComErro(req, 'apresentacao-invalida');
  }

  const login = await gerarMagicLinkPapelApresentacaoDemo(role.key, role.tenantSlug);
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

  if (ticketPayload.prospectSessionId) {
    try {
      await recordAcmeProspectPresentationAccess(ticketPayload.prospectSessionId, role.key);
    } catch (trackingError: any) {
      // O acompanhamento é best-effort; uma sessão válida não deve ser negada.
      console.warn('[auth/apresentacao] registrar acesso do prospect:', trackingError?.message);
    }
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
