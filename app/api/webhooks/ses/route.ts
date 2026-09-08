import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { verifySesWebhook, urlDaAws } from '@/lib/email/sns-assinatura';
import { interpretarEventoSes, camposDoEventoSes } from '@/lib/email/ses-eventos';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/**
 * Webhook do Amazon SES (via SNS): entrega, bounce e reclamação de e-mail.
 *
 * Fecha o par que já existe no WhatsApp — o envio guarda o id da mensagem e este
 * endpoint carimba a linha depois. `Medido 08/09/2026`: 1.255 e-mails em 30 dias
 * sem um único registro de entrega, porque o Resend não devolvia id e não havia
 * webhook. O SES devolve `MessageId` no envio e o evento traz o mesmo valor em
 * `mail.messageId`.
 *
 * ⚠️ PÚBLICO na internet: a autenticação é a ASSINATURA da mensagem SNS, com o
 * `TopicArn` conferido contra o esperado. Sem isso, qualquer um marca como
 * entregue o que nunca chegou.
 *
 * ⚠️ RESPONDER 200 é a regra para evento que não entendemos — o SNS reentrega e
 * pode desabilitar a inscrição se o erro persistir, e aí o canal fica mudo. O
 * que falha vira degradação registrada. A exceção é assinatura inválida: 401,
 * porque não é evento estranho, é requisição não autenticada.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request) {
  const cru = await req.text();

  let msg: Record<string, any>;
  try { msg = JSON.parse(cru); } catch {
    return NextResponse.json({ ok: true, ignorado: 'corpo não é JSON' });
  }

  const valida = await verifySesWebhook(msg, { topicArnEsperado: process.env.SES_SNS_TOPIC_ARN });
  if (!valida.ok) {
    console.error('[ses-webhook] recusado:', valida.motivo);
    return new NextResponse('unauthorized', { status: 401 });
  }

  // A AWS confirma a inscrição visitando a URL que ela mesma manda. O host já foi
  // validado como da AWS na checagem de assinatura, e é reconferido aqui porque
  // este é um GET que o servidor faz por conta própria.
  if (msg.Type === 'SubscriptionConfirmation') {
    const url = String(msg.SubscribeURL || '');
    if (!urlDaAws(url)) return new NextResponse('unauthorized', { status: 401 });
    try {
      await fetch(url);
      console.log('[ses-webhook] inscrição confirmada no tópico', msg.TopicArn);
    } catch (e: any) {
      console.error('[ses-webhook] falha ao confirmar inscrição:', e?.message);
    }
    return NextResponse.json({ ok: true, confirmado: true });
  }

  if (msg.Type !== 'Notification') return NextResponse.json({ ok: true, ignorado: msg.Type });

  const evento = interpretarEventoSes(msg.Message);
  if (!evento) return NextResponse.json({ ok: true, ignorado: 'sem mail.messageId' });

  const campos = camposDoEventoSes(evento);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('notification_deliveries')
    .update(campos)
    .eq('provider_message_id', evento.messageId)
    .eq('channel', 'email')
    .select('id');

  // supabase-js RETORNA o erro. Sem checar, uma falha de escrita viraria "200,
  // tudo certo" e a métrica ficaria em branco com o webhook aparentemente vivo.
  if (error) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
      chave: `ses:${evento.tipo}`,
      detalhe: { messageId: evento.messageId, tipo: evento.tipo, erro: error.message },
    });
    return NextResponse.json({ ok: true, erro: 'update falhou' });
  }

  // Zero linhas não é erro: e-mail enviado antes do SES (ou por outro sistema)
  // não tem linha com este id. Vira contagem, não silêncio.
  if (!data?.length) {
    console.warn(`[ses-webhook] ${evento.tipo} sem linha correspondente: ${evento.messageId}`);
  }

  return NextResponse.json({ ok: true, tipo: evento.tipo, linhas: data?.length ?? 0 });
}
