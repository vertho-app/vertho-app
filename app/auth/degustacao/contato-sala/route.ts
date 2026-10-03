import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import { getDemoPresentationRoleFromHostname } from '@/lib/demo/presentation';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { abrirAcessoDaDegustacao, escritaDeOutraOrigem, hostnameDaRequisicao } from '@/lib/demo/degustacao-acesso';
import { copiaDaDegustacaoGuiada } from '@/lib/demo/acme-prospect-config';
import { linkDeContatoDaDegustacao } from '@/lib/demo/degustacao-contato';
import { cenaDaSala } from '@/lib/demo/degustacao-desafios';
import { rosterDemo } from '@/lib/demo/rosters';
import { authLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * O contato do painel da cena (versão C), disparado de DENTRO da sala.
 *
 * Existe porque a rota de contato do início (`../contato`) exige a mesma origem
 * do host do convite: um host de sala é outra origem, e é exatamente isso que ela
 * recusa (`escritaDeOutraOrigem`). Aqui a origem conferida é a da SALA, e quem
 * prova que a requisição é de gente dentro dela é o par ticket assinado + sessão
 * da persona, o mesmo contrato do beacon de exploração.
 *
 * POST de formulário com 303: abre o WhatsApp numa aba nova, com o texto do
 * desafio escrito, e funciona sem JavaScript. O servidor NUNCA envia a mensagem;
 * o clique só carimba o marco de intenção. Robô de preview (GET) não passa por aqui.
 */
export async function POST(req: NextRequest) {
  const host = hostnameDaRequisicao(req);
  if (escritaDeOutraOrigem(req, host)) return new NextResponse(null, { status: 403 });

  let ticketCru = '';
  let chave = '';
  try {
    const form = await req.formData();
    ticketCru = String(form.get('ticket') || '');
    chave = String(form.get('desafio') || '');
  } catch { /* inválido */ }

  const recusa = () => new NextResponse('Não foi possível abrir este contato. Volte ao convite e tente novamente.', { status: 400 });
  const role = getDemoPresentationRoleFromHostname(host);
  const ticket = verifyDemoPresentationTicket(ticketCru);
  if (!role || !ticket?.prospectSessionId || ticket.tenant !== role.tenantSlug) return recusa();
  if (await authLimiter.check(req, `degustacao-contato-sala:${ticket.prospectSessionId}`)) {
    return new NextResponse('Tente novamente em instantes.', { status: 429 });
  }

  const sb = await createSupabaseServerClient();
  const { data: { user }, error } = await sb.auth.getUser();
  const persona = rosterDemo(ticket.tenant === 'escolas-acme' ? 'escolar' : 'comercial').salaApresentacao
    .find((p) => p.presentationRoleKey === role.key);
  if (error || !user?.email || user.email.toLowerCase() !== persona?.email.toLowerCase()) return recusa();

  // Host de sala conferido acima; o acesso canônico reconfirma prazo e fechamento no banco.
  const passe = emitirPasseDegustacao(ticket.tenant, ticket.prospectSessionId, ticket.exp);
  const acesso = await abrirAcessoDaDegustacao(passe, `${ticket.tenant}.vertho.ai`, [
    'prospect_name', 'prospect_company', 'created_by_email', 'experience_version',
  ]);
  if (acesso.status !== 'ok' || acesso.sessao.experience_version !== 'C') return recusa();

  // Só o desafio que ESTA sala responde: o painel nunca aparece em outra, e um
  // pedido de outro papel não é de gente que viu a cena.
  const desafio = cenaDaSala(acesso.slug, role.key, chave);
  if (!desafio) return recusa();

  const url = linkDeContatoDaDegustacao({
    nome: acesso.sessao.prospect_name,
    empresa: acesso.sessao.prospect_company,
    criadoPor: acesso.sessao.created_by_email,
    minhaCasa: copiaDaDegustacaoGuiada(acesso.slug).contato.minhaCasa,
    desafios: [desafio.frase],
  });

  const agora = new Date().toISOString();
  // Falha de telemetria não impede a conversa. Nunca envia a mensagem.
  try {
    for (const column of ['contact_clicked_at', 'invite_opened_at']) {
      const { error: erroMarco } = await acesso.tdb.from('demo_prospect_sessions').update({ [column]: agora })
        .eq('session_id', acesso.sessionId).gt('expires_at', agora).is('access_closed_at', null).is(column, null);
      if (erroMarco) console.warn('[degustacao/contato-sala] registrar clique:', erroMarco.message);
    }
  } catch { console.warn('[degustacao/contato-sala] telemetria indisponível'); }

  return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
