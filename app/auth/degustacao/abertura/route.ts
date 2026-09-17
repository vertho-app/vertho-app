import { NextRequest, NextResponse } from 'next/server';
import { authLimiter } from '@/lib/rate-limit';
import { verificarPasseDegustacao } from '@/lib/demo/degustacao-passe';
import {
  abrirAcessoDaDegustacao,
  escritaDeOutraOrigem,
  hostnameDaRequisicao,
} from '@/lib/demo/degustacao-acesso';

export const dynamic = 'force-dynamic';

/**
 * User agents de robô que buscam link para montar prévia. Segunda camada: a
 * primeira é o próprio registro só acontecer quando a página roda JavaScript
 * e a pessoa interage (ver `app/degustacao/abertura-beacon.tsx`).
 */
const ROBO_DE_PREVIA = /whatsapp|facebookexternalhit|facebot|meta-externalagent|slackbot|telegrambot|twitterbot|linkedinbot|discordbot|skypeuripreview|googlebot|bingbot|crawler|spider|preview/i;

function vazio() {
  const res = new NextResponse(null, { status: 204 });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/**
 * Registro da PRIMEIRA abertura verificada do convite da versão B.
 *
 * 🔴 POR QUE ISTO EXISTE. Na versão A o "acesso" era carimbado pelo GET do link,
 * e o GET também é o que o robô de preview do WhatsApp faz ao montar o cartão.
 * `Medido 16/09/2026`: 6 dos 8 prospects reais tinham uma única sessão, aberta
 * entre 12 s e 1 min 44 s depois da criação, sem nenhum JavaScript rodando. O
 * painel dizia "entrou" para quem, muito provavelmente, nunca clicou.
 *
 * Aqui a abertura só é registrada por um POST que a página faz depois de a
 * pessoa interagir (ou de a página ficar visível por alguns segundos), com a
 * mesma decisão de acesso das outras portas. A resposta é SEMPRE 204: quem está
 * testando passes não aprende nada com ela.
 */
export async function POST(req: NextRequest) {
  const host = hostnameDaRequisicao(req);
  if (escritaDeOutraOrigem(req, host)) return vazio();
  if (ROBO_DE_PREVIA.test(req.headers.get('user-agent') || '')) return vazio();

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return vazio();
  }
  const passe = typeof corpo?.passe === 'string' ? corpo.passe : '';
  const payload = verificarPasseDegustacao(passe);
  if (!payload) return vazio();

  if (await authLimiter.check(req, `degustacao-abertura:${payload.sid}`)) return vazio();

  const acesso = await abrirAcessoDaDegustacao(passe, host, ['invite_opened_at']);
  if (acesso.status !== 'ok') {
    if (acesso.status === 'indisponivel') {
      console.warn('[auth/degustacao/abertura] carregar sessão:', acesso.motivo);
    }
    return vazio();
  }
  if (acesso.sessao.invite_opened_at) return vazio();

  const { error } = await acesso.tdb.from('demo_prospect_sessions')
    .update({ invite_opened_at: new Date().toISOString() })
    .eq('session_id', acesso.sessionId)
    .is('invite_opened_at', null);
  if (error) console.warn('[auth/degustacao/abertura] registrar abertura:', error.message);
  return vazio();
}
