import { NextRequest, NextResponse } from 'next/server';
import { abrirAcessoDaDegustacao, escritaDeOutraOrigem, hostnameDaRequisicao } from '@/lib/demo/degustacao-acesso';
import { copiaDaDegustacaoGuiada } from '@/lib/demo/acme-prospect-config';
import { linkDeContatoDaDegustacao } from '@/lib/demo/degustacao-contato';
import { desafioDoAmbiente, desafiosDaLista, limparOutroDesafio } from '@/lib/demo/degustacao-desafios';
import { authLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
/** POST explícito: robô de preview/GET não conta e funciona sem JavaScript. */
export async function POST(req: NextRequest) {
  const host = hostnameDaRequisicao(req);
  if (escritaDeOutraOrigem(req, host)) return new NextResponse(null, { status: 403 });
  let passe = '';
  let dores = '';
  let outro = '';
  try {
    const form = await req.formData();
    passe = String(form.get('passe') || '');
    dores = String(form.get('dores') || '');
    outro = String(form.get('outro') || '');
  } catch { /* inválido */ }
  const acesso = await abrirAcessoDaDegustacao(passe, host, ['prospect_name', 'prospect_company', 'created_by_email', 'experience_version']);
  if (acesso.status !== 'ok') return new NextResponse('Não foi possível abrir este contato. Volte ao convite e tente novamente.', { status: 400 });
  if (await authLimiter.check(req, `degustacao-contato:${acesso.sessionId}`)) return new NextResponse('Tente novamente em instantes.', { status: 429 });
  // Só a versão C carrega os desafios na mensagem. Na B os campos são ignorados
  // e o texto segue exatamente o de sempre. Chave desconhecida é descartada, e o
  // "outro" é o texto do lead, limpo, que vai para a URL do WhatsApp e mais nada.
  const ehC = acesso.sessao.experience_version === 'C';
  const desafios = ehC
    ? desafiosDaLista(dores)
      .map((chave) => desafioDoAmbiente(acesso.slug, chave)?.frase)
      .filter((frase): frase is string => Boolean(frase))
    : [];
  const url = linkDeContatoDaDegustacao({ nome: acesso.sessao.prospect_name, empresa: acesso.sessao.prospect_company,
    criadoPor: acesso.sessao.created_by_email, minhaCasa: copiaDaDegustacaoGuiada(acesso.slug).contato.minhaCasa,
    desafios, outro: ehC ? limparOutroDesafio(outro) : '' });
  const agora = new Date().toISOString();
  // Falha de telemetria não impede a conversa. Nunca envia a mensagem.
  try {
    for (const column of ['contact_clicked_at', 'invite_opened_at']) {
      const { error } = await acesso.tdb.from('demo_prospect_sessions').update({ [column]: agora })
        .eq('session_id', acesso.sessionId).gt('expires_at', agora).is('access_closed_at', null).is(column, null);
      if (error) console.warn('[degustacao/contato] registrar clique:', error.message);
    }
  } catch { console.warn('[degustacao/contato] telemetria indisponível'); }
  return NextResponse.redirect(url, { status: 303, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
