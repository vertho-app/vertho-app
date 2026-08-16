/**
 * Fan-out de push da inbox para a equipe Vertho.
 *
 * Chamado de dentro do webhook `whatsapp-cloud` via `after()` — depois que a
 * mensagem já foi gravada em `whatsapp_mensagens_recebidas`. Não bloqueia o 200
 * da Meta: um push lento não pode custar a inscrição do webhook.
 *
 * Por que HEADLESS (sem 'use server'): quem decide se pode enviar é quem chama
 * (webhook já autenticado pela assinatura HMAC), e o núcleo não precisa de gate.
 *
 * Dedup: uma mensagem vira uma notificação por (wamid). Reentrega da Meta cai no
 * upsert da caixa e não gera push duplicado porque o fan-out é por mensagem
 * recém-inserida, não por evento cru.
 */

import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarWebPush, webPushConfigurado, type WebPushSubscription } from './providers/webpush';
import { inboxPushHabilitado } from './inbox-flag';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

export interface InboxPushInput {
  /** wamid — dedup e link para debug */
  waMessageId: string;
  /** telefone E.164 de quem escreveu */
  fromPhone: string;
  /** preview do texto (ou rotuloDoTipo quando for áudio/imagem) */
  preview: string;
  /** empresa resolvida ou null (sem dono) */
  empresaId: string | null;
  empresaNome?: string | null;
  /** nome do colaborador quando resolvido */
  colaboradorNome?: string | null;
}

export async function fanoutInboxPush(input: InboxPushInput): Promise<{ enviados: number; semFlag: boolean; semEndpoints: boolean }> {
  // FAIL-CLOSED: sem flag, sem push.
  if (!(await inboxPushHabilitado())) {
    return { enviados: 0, semFlag: true, semEndpoints: false };
  }
  if (!webPushConfigurado()) {
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
      chave: 'inbox-push-sem-vapid',
      empresaId: input.empresaId,
      severidade: 'aviso',
      detalhe: { wamid: input.waMessageId, motivo: 'VAPID ausente' },
    });
    return { enviados: 0, semFlag: false, semEndpoints: true };
  }

  const sb = createSupabaseAdmin();

  // Todos os admins com instalação ativa. Não filtramos por empresa: inbox é
  // global da plataforma (uma mensagem de qualquer cliente interessa a toda a
  // equipe). Quem não quiser, desativa no aparelho.
  const { data: endpoints, error } = await sb
    .from('notification_endpoints')
    .select('id, subscription, user_id')
    .eq('enabled', true)
    .not('user_id', 'is', null);

  if (error) {
    console.error('[inbox-push] falha ao listar endpoints admin:', error.message);
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
      chave: 'inbox-push-leitura',
      empresaId: input.empresaId,
      severidade: 'aviso',
      detalhe: { wamid: input.waMessageId, motivo: error.message },
    });
    return { enviados: 0, semFlag: false, semEndpoints: true };
  }

  const lista = (endpoints ?? []) as Array<{ id: string; subscription: WebPushSubscription; user_id: string }>;
  if (!lista.length) return { enviados: 0, semFlag: false, semEndpoints: true };

  const titulo = input.empresaNome
    ? `Nova mensagem · ${input.empresaNome}`
    : input.colaboradorNome
      ? `Nova mensagem · ${input.colaboradorNome}`
      : 'Nova mensagem no WhatsApp';

  const corpo = input.preview.slice(0, 120) || `De ${input.fromPhone}`;

  // Deep-link: se tem empresa, abre a conversa; senão vai para a caixa global
  // onde a fila de não identificados está. O sw.js já faz focus+navigate.
  const url = input.empresaId
    ? `/admin-v2/inbox?empresa=${encodeURIComponent(input.empresaId)}&tel=${encodeURIComponent(input.fromPhone)}`
    : '/admin-v2/inbox';

  let enviados = 0;

  for (const ep of lista) {
    // Grava a tentativa antes de enviar: o id precisa viajar no payload para o
    // sw.js devolver em /api/notifications/opened.
    const { data: entrega, error: errIns } = await sb
      .from('notification_deliveries')
      .insert({
        empresa_id: input.empresaId,
        colaborador_id: null,
        kind: 'whatsapp_inbound',
        channel: 'webpush',
        provider: 'webpush',
        endpoint_id: ep.id,
        status: 'tentativa',
        dedupe_key: `inbox:${input.waMessageId}:${ep.id}`,
      })
      .select('id')
      .single();

    if (errIns || !entrega) {
      console.error('[inbox-push] falha ao gravar entrega:', errIns?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
        chave: 'inbox-push-telemetria',
        empresaId: input.empresaId,
        severidade: 'aviso',
        detalhe: { wamid: input.waMessageId, motivo: errIns?.message || 'sem id' },
      });
      continue;
    }

    const deliveryId = (entrega as { id: string }).id;
    const payload = JSON.stringify({ title: titulo, body: corpo, url, deliveryId, kind: 'whatsapp_inbound' });

    const r = await enviarWebPush(ep.subscription, payload);
    if (r.ok) {
      enviados++;
      await sb.from('notification_deliveries').update({ status: 'sucesso', error: null }).eq('id', deliveryId);
    } else {
      await sb.from('notification_deliveries').update({ status: 'falha', error: r.motivo }).eq('id', deliveryId);
      if (r.morto) {
        await sb
          .from('notification_endpoints')
          .update({ enabled: false, disabled_reason: 'inscricao-morta', updated_at: new Date().toISOString() })
          .eq('id', ep.id);
      }
      // Falha de um endpoint não aborta os demais.
      console.warn('[inbox-push] falha em endpoint', ep.id, r.motivo);
    }
  }

  return { enviados, semFlag: false, semEndpoints: false };
}
