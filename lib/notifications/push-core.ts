/**
 * Núcleo de envio de push — HEADLESS (sem `'use server'`, sem gate).
 *
 * Segue o padrão de `lib/season-engine/*-core.ts`: quem chama de fora (server
 * action, rota, cron) aplica o gate; este módulo só executa. Num arquivo
 * `'use server'` todo export vira endpoint HTTP, então o núcleo NÃO pode morar lá.
 *
 * ORDEM DAS OPERAÇÕES (não é detalhe):
 * a linha de `notification_deliveries` é criada ANTES do envio, com status
 * 'tentativa', porque o `id` dela precisa viajar dentro do payload — é ele que o
 * service worker devolve ao marcar a abertura. Criar depois tornaria impossível
 * ligar a abertura ao envio que a causou.
 */
import { createSupabaseAdmin } from '@/lib/supabase';
import { enviarWebPush, webPushConfigurado, type WebPushSubscription } from './providers/webpush';

export interface EnviarPushInput {
  colaboradorId: string;
  empresaId?: string | null;
  /** Motivo de negócio — mesmo vocabulário do canal WhatsApp (pilula, nudge...). */
  kind: string;
  titulo: string;
  corpo: string;
  /** Destino do toque. Deve ser o conteúdo EXATO, nunca a home. */
  url: string;
  dedupeKey?: string | null;
}

export interface EnviarPushResultado {
  /** Quantas instalações receberam de fato. */
  entregues: number;
  /** Instalações que falharam sem estarem mortas (transitório). */
  falhas: number;
  /** Endpoints desligados nesta execução (404/410). */
  desligados: number;
  /** Nenhuma instalação ativa — não é erro, é ausência de opt-in. */
  semEndpoints: boolean;
  motivo?: string;
}

interface EndpointRow {
  id: string;
  subscription: WebPushSubscription;
  provider: string;
}

export async function enviarPush(
  input: EnviarPushInput,
  sb?: any
): Promise<EnviarPushResultado> {
  const vazio: EnviarPushResultado = { entregues: 0, falhas: 0, desligados: 0, semEndpoints: true };
  const client = sb ?? createSupabaseAdmin();

  if (!webPushConfigurado()) {
    return { ...vazio, motivo: 'VAPID não configurado no ambiente' };
  }

  const { data: endpoints, error } = await client
    .from('notification_endpoints')
    .select('id, subscription, provider')
    .eq('colaborador_id', input.colaboradorId)
    .eq('enabled', true);

  // supabase-js RETORNA `{ error }` — sem esta checagem a falha viraria
  // "ninguém tem push" em silêncio, que é a conclusão oposta da verdadeira.
  if (error) {
    return { ...vazio, motivo: `falha ao ler endpoints: ${error.message}` };
  }
  const lista = (endpoints ?? []) as EndpointRow[];
  if (!lista.length) return vazio;

  let entregues = 0;
  let falhas = 0;
  let desligados = 0;

  for (const ep of lista) {
    if (ep.provider !== 'webpush') {
      // Coluna preparada para fcm/apns, código ainda não. Registrar em vez de
      // pular calado: endpoint que nunca recebe precisa aparecer em algum lugar.
      falhas++;
      await gravarEntrega(client, input, ep.id, 'falha', `provider ${ep.provider} sem implementação`);
      continue;
    }

    const deliveryId = await gravarEntrega(client, input, ep.id, 'tentativa', null);

    const payload = JSON.stringify({
      title: input.titulo,
      body: input.corpo,
      url: input.url,
      deliveryId,
      kind: input.kind,
    });

    const r = await enviarWebPush(ep.subscription, payload);

    if (r.ok) {
      entregues++;
      await atualizarEntrega(client, deliveryId, 'sucesso', null);
    } else {
      falhas++;
      await atualizarEntrega(client, deliveryId, 'falha', r.motivo);
      if (r.morto) {
        desligados++;
        falhas--; // inscrição morta não é falha de entrega: é ausência de destino
        await client
          .from('notification_endpoints')
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq('id', ep.id);
      }
    }
  }

  return { entregues, falhas, desligados, semEndpoints: false };
}

async function gravarEntrega(
  client: any,
  input: EnviarPushInput,
  endpointId: string,
  status: 'tentativa' | 'falha',
  erro: string | null
): Promise<string | null> {
  const { data, error } = await client
    .from('notification_deliveries')
    .insert({
      empresa_id: input.empresaId ?? null,
      colaborador_id: input.colaboradorId,
      kind: input.kind,
      channel: 'webpush',
      provider: 'webpush',
      endpoint_id: endpointId,
      status,
      error: erro,
      dedupe_key: input.dedupeKey ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('[push-core] falha ao gravar entrega:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function atualizarEntrega(
  client: any,
  deliveryId: string | null,
  status: 'sucesso' | 'falha',
  erro: string | null
) {
  if (!deliveryId) return;
  const { error } = await client
    .from('notification_deliveries')
    .update({ status, error: erro })
    .eq('id', deliveryId);
  if (error) console.error('[push-core] falha ao atualizar entrega:', error.message);
}
