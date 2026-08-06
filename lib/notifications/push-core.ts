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
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';
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

  // ⚠️ `semEndpoints: false` aqui, e isto NÃO é detalhe. Este caminho é falha de
  // AMBIENTE, não ausência de adesão — e devolver `semEndpoints: true` faria
  // "VAPID ausente" ler exatamente igual a "ninguém aderiu" para quem consumisse
  // esse campo. Quem quer saber de falha sistêmica lê `motivo`.
  if (!webPushConfigurado()) {
    return {
      entregues: 0, falhas: 0, desligados: 0, semEndpoints: false,
      motivo: 'VAPID não configurado no ambiente',
    };
  }

  const { data: endpoints, error } = await client
    .from('notification_endpoints')
    .select('id, subscription, provider')
    .eq('colaborador_id', input.colaboradorId)
    .eq('enabled', true);

  // supabase-js RETORNA `{ error }` — sem esta checagem a falha viraria
  // "ninguém tem push" em silêncio, que é a conclusão oposta da verdadeira.
  if (error) {
    // Idem: falha de leitura não é ausência de inscrição.
    return {
      entregues: 0, falhas: 0, desligados: 0, semEndpoints: false,
      motivo: `falha ao ler endpoints: ${error.message}`,
    };
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
          .update({ enabled: false, disabled_reason: 'inscricao-morta', updated_at: new Date().toISOString() })
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
    // Fallback NUNCA silencioso — a regra desta base. Sem isto, um push sai,
    // chega na pessoa e não existe em lugar nenhum: entrega não medida, e sem
    // `deliveryId` ele também nunca poderá registrar abertura. Para um
    // experimento cuja conclusão sai da tabela, entrega invisível é pior que
    // entrega ausente, porque enviesa o denominador para baixo em silêncio.
    //
    // Escolha deliberada de NÃO falhar fechado: abortar o envio trocaria uma
    // lacuna de medição por uma lacuna de entrega — a pessoa deixaria de ser
    // avisada porque o log caiu. Degrada-se registrando, e o health estrutural
    // (R10) reclama do volume.
    console.error('[push-core] falha ao gravar entrega:', error.message);
    await registrarDegradacao({
      fluxo: 'envio',
      tipo: DEGRADACAO.TELEMETRIA_ENTREGA_FALHOU,
      chave: `webpush:${input.kind}`,
      empresaId: input.empresaId ?? null,
      colaboradorId: input.colaboradorId,
      severidade: 'aviso',
      detalhe: { motivo: error.message, endpointId },
    });
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
