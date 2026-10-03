import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import {
  DEMO_PRESENTATION_DEVICE_PARAM,
  DEMO_PRESENTATION_RETURN_PARAM,
  DEMO_PRESENTATION_TICKET_PARAM,
  getDemoPresentationDeviceQueryValue,
  getDemoPresentationRoleFromHostname,
  parseDemoPresentationDevice,
  linkDaPaginaDeBoasVindas,
} from '@/lib/demo/presentation';
import { issueDemoPresentationTicket, verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import { lerCodigoCurto, emitirCodigoCurto } from '@/lib/demo/degustacao-link-curto';
import { CENA_PARAM, cenaDaSala } from '@/lib/demo/degustacao-desafios';
import { autenticarPapelApresentacaoDemo } from '@/lib/demo/reset-acme-demo';
import { recordAcmeProspectPresentationAccess } from '@/lib/demo/acme-prospect-tracking';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  const supabase = await createSupabaseServerClient();
  const login = await autenticarPapelApresentacaoDemo(role.key, supabase, role.tenantSlug);
  if (!login.ok) {
    // Passe válido + serviço indisponível não é convite vencido. O lead pode
    // repetir a entrada no próprio convite, sem cair num login de conta técnica.
    if (ticketPayload.prospectSessionId) {
      const casa = linkDaPaginaDeBoasVindas(ticketPayload.tenant, emitirCodigoCurto(ticketPayload.tenant, ticketPayload.prospectSessionId));
      const url = new URL(casa!);
      url.searchParams.set('aviso', 'indisponivel');
      return NextResponse.redirect(url, { headers: { 'Cache-Control': 'no-store' } });
    }
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

  // Versão C: o convite abre a sala DIRETO na tela que responde ao desafio. O
  // destino sai do mapa por CHAVE (`degustacao-desafios`), nunca da URL: chave
  // desconhecida, de outro papel ou sem passe de convidado é ignorada em
  // silêncio e a sala abre na casa, como sempre abriu.
  const cena = ticketPayload.prospectSessionId
    ? cenaDaSala(ticketPayload.tenant, role.key, req.nextUrl.searchParams.get(CENA_PARAM))
    : null;
  const destino = new URL(cena ? cena.caminho : login.nextPath, req.url);
  if (cena) destino.searchParams.set(CENA_PARAM, cena.chave);
  // O shell guarda o passe em sessionStorage e remove este parâmetro da barra
  // de endereço. Ele precisa chegar uma vez a cada origem para que o próximo
  // salto do dropdown também seja automático.
  //
  // 🔴 RENOVA o passe do apresentador a cada troca de papel. Ele vale 4 h fixas
  // e o mesmo texto viajava de host em host sem nunca ser reemitido: numa sala
  // aberta há mais de 4 h TODA troca caía em `apresentacao-expirada`, e o
  // `/login` (que só se recupera porque o host já tinha sessão) piscava o aviso
  // "link expirou" antes de entrar na tela — a tela de antes, não a nova.
  // Medido 29/09/2026 pelo `login?error=apresentacao-expirada` no Network. A
  // janela passa a ser de INATIVIDADE (4 h sem trocar de papel). O passe de
  // convidado (`prospectSessionId`) NÃO renova: a validade dele é a do
  // passaporte, decidida no servidor, e não pode se estender por uso.
  const ticketDaViagem = ticketPayload.prospectSessionId
    ? ticket!
    : issueDemoPresentationTicket(undefined, undefined, ticketPayload.tenant);
  destino.searchParams.set(DEMO_PRESENTATION_TICKET_PARAM, ticketDaViagem);
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
  // "Voltar ao início": o código do link curto da página de boas-vindas só
  // atravessa quando foi assinado para ESTE ambiente e é da MESMA sessão do
  // ticket. Código de outra pessoa, de outro ambiente ou forjado é descartado em
  // silêncio: a sala abre normalmente, só sem o botão.
  const volta = req.nextUrl.searchParams.get(DEMO_PRESENTATION_RETURN_PARAM);
  if (
    volta
    && ticketPayload.prospectSessionId
    && lerCodigoCurto(volta, ticketPayload.tenant) === ticketPayload.prospectSessionId
  ) {
    destino.searchParams.set(DEMO_PRESENTATION_RETURN_PARAM, volta);
  }
  return NextResponse.redirect(destino, { headers: { 'Cache-Control': 'no-store' } });
}
