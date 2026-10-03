import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { verifyDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import { getDemoPresentationRoleFromHostname } from '@/lib/demo/presentation';
import { emitirPasseDegustacao } from '@/lib/demo/degustacao-passe';
import { abrirAcessoDaDegustacao, escritaDeOutraOrigem, hostnameDaRequisicao } from '@/lib/demo/degustacao-acesso';
import { rosterDemo } from '@/lib/demo/rosters';
import { ehExploracao } from '@/lib/demo/degustacao-metricas';
import { desafioDoAlvo } from '@/lib/demo/degustacao-desafios';
import { authLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const vazio = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
export async function POST(req: NextRequest) {
  const host = hostnameDaRequisicao(req);
  if (escritaDeOutraOrigem(req, host)) return vazio();
  let body: any;
  try { body = await req.json(); } catch { return vazio(); }
  if (!ehExploracao(body?.alvo)) return vazio();
  const role = getDemoPresentationRoleFromHostname(host);
  const ticket = verifyDemoPresentationTicket(body?.ticket);
  if (!role || !ticket?.prospectSessionId || ticket.tenant !== role.tenantSlug) return vazio();
  if (await authLimiter.check(req, `degustacao-exploracao:${ticket.prospectSessionId}`)) return vazio();
  const sb = await createSupabaseServerClient();
  const { data: { user }, error } = await sb.auth.getUser();
  const persona = rosterDemo(ticket.tenant === 'escolas-acme' ? 'escolar' : 'comercial').salaApresentacao
    .find(p => p.presentationRoleKey === role.key);
  if (error || !user?.email || user.email.toLowerCase() !== persona?.email.toLowerCase()) return vazio();
  // Host de sala conferido acima; acesso canônico reconfirma prazo/fechamento no banco.
  const passe = emitirPasseDegustacao(ticket.tenant, ticket.prospectSessionId, ticket.exp);
  const acesso = await abrirAcessoDaDegustacao(passe, `${ticket.tenant}.vertho.ai`, ['experience_version']);
  if (acesso.status !== 'ok') return vazio();
  const agora = new Date().toISOString();
  // 🔴 Na versão C a "exploração relevante" é o primeiro DESAFIO escolhido
  // (`dor-<chave>`). O beacon da própria tela (`engajamento`, `evolucao`...)
  // dispara na mesma visita e disputaria a coluna: quem chegasse primeiro
  // decidiria o que o painel diz que o lead escolheu. Então C só aceita `dor-*`,
  // e as outras versões nunca aceitam. A abertura do convite vale para todas.
  const ehC = acesso.sessao.experience_version === 'C';
  const ehDor = desafioDoAlvo(body.alvo) !== null;
  if (ehC === ehDor) {
    const result = await acesso.tdb.from('demo_prospect_sessions')
      .update({ relevant_exploration_at: agora, relevant_exploration_target: body.alvo })
      .eq('session_id', acesso.sessionId).gt('expires_at', agora).is('access_closed_at', null).is('relevant_exploration_at', null);
    if (result.error) console.warn('[degustacao/exploracao] registrar:', result.error.message);
  }
  const abertura = await acesso.tdb.from('demo_prospect_sessions').update({ invite_opened_at: agora })
    .eq('session_id', acesso.sessionId).gt('expires_at', agora).is('access_closed_at', null).is('invite_opened_at', null);
  if (abertura.error) console.warn('[degustacao/exploracao] abertura:', abertura.error.message);
  return vazio();
}
