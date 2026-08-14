import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { interpretarPayload, camposDoStatus } from '@/lib/whatsapp/cloud-webhook';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

/**
 * Webhook da WhatsApp Cloud API — mensagens recebidas e status de entrega.
 *
 * GET  = handshake de verificação (a Meta chama uma vez, ao configurar).
 * POST = eventos. Ver `lib/whatsapp/cloud-webhook.ts` para o formato.
 *
 * ⚠️ ESTE ENDPOINT É PÚBLICO na internet e a autenticação é a ASSINATURA do
 * corpo (`X-Hub-Signature-256`, HMAC-SHA256 com o app secret). Sem validá-la,
 * qualquer um injeta mensagem falsa na caixa de entrada de um tenant — e, pior,
 * marca como "entregue" uma mensagem que nunca chegou, corrompendo justamente a
 * métrica que este webhook existe para tornar confiável.
 *
 * ⚠️ RESPONDER 200 É A REGRA, mesmo em evento que não entendemos. A Meta
 * reentrega enquanto não receber 200 e DESATIVA a inscrição se o erro persistir:
 * um 500 por um campo novo deixaria o canal inteiro mudo. O que falha aqui vira
 * degradação registrada, não status de erro. A exceção é a assinatura inválida —
 * essa é 401 de propósito, porque não é "evento estranho", é requisição não
 * autenticada.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Verificação do handshake (GET) — a Meta manda o desafio uma vez. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!esperado) {
    console.error('[whatsapp-cloud] FAIL-CLOSED: META_WEBHOOK_VERIFY_TOKEN ausente');
    return new NextResponse('não configurado', { status: 503 });
  }
  if (modo === 'subscribe' && safeSecretEqual(token, esperado)) {
    // A Meta espera o challenge CRU no corpo, não JSON.
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

/**
 * Valida `X-Hub-Signature-256` sobre o corpo CRU.
 *
 * Tem que ser o corpo cru, byte a byte: reserializar o JSON muda espaços e ordem
 * de chaves e a assinatura não bate mais. Por isso a rota lê `req.text()` antes
 * de qualquer `JSON.parse`.
 */
function assinaturaValida(raw: string, header: string | null): boolean {
  const segredo = process.env.META_APP_SECRET;
  if (!segredo) return false;
  if (!header?.startsWith('sha256=')) return false;
  const esperado = 'sha256=' + crypto.createHmac('sha256', segredo).update(raw, 'utf8').digest('hex');
  // `safeSecretEqual` (lib/secure-compare) em vez de comparação própria: ele
  // hasheia os dois lados antes do timingSafeEqual, então não lança por
  // comprimentos diferentes nem vaza o tamanho pelo tempo.
  return safeSecretEqual(header, esperado);
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!process.env.META_APP_SECRET) {
    // FAIL-CLOSED: sem segredo não há como distinguir a Meta de um impostor.
    console.error('[whatsapp-cloud] FAIL-CLOSED: META_APP_SECRET ausente');
    return NextResponse.json({ error: 'não configurado' }, { status: 503 });
  }
  if (!assinaturaValida(raw, req.headers.get('x-hub-signature-256'))) {
    console.error('[whatsapp-cloud] assinatura inválida');
    return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    // 200 de propósito: corpo ilegível não melhora com retry, e insistir nele
    // custa a inscrição do webhook.
    console.error('[whatsapp-cloud] corpo não é JSON');
    return NextResponse.json({ ok: true, ignorado: 'corpo inválido' });
  }

  const { mensagens, statuses, ignorados } = interpretarPayload(body);
  const sb = createSupabaseAdmin();

  // ── Mensagens recebidas ───────────────────────────────────────────────────
  for (const m of mensagens) {
    try {
      const { empresaId, colaboradorId, ambiguidade } = await resolverDono(sb, m.fromPhone);
      // upsert por wa_message_id: a Meta reentrega o mesmo evento.
      const { error } = await sb.from('whatsapp_mensagens_recebidas')
        .upsert({
          empresa_id: empresaId,
          colaborador_id: colaboradorId,
          ambiguidade,
          wa_message_id: m.waMessageId,
          from_phone: m.fromPhone,
          to_phone_id: m.toPhoneId,
          tipo: m.tipo,
          texto: m.texto,
          raw: m.raw as any,
          recebida_em: m.recebidaEm,
        }, { onConflict: 'wa_message_id', ignoreDuplicates: true });
      // supabase-js RETORNA {error} — sem este check a mensagem sumiria calada.
      if (error) throw new Error(error.message);
    } catch (e: any) {
      console.error('[whatsapp-cloud] gravar mensagem falhou:', e?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_INBOUND_PERDIDO,
        chave: 'inbound',
        severidade: 'critico',
        detalhe: { wamid: m.waMessageId, motivo: e?.message || String(e) },
      });
    }
  }

  // ── Status de entrega ─────────────────────────────────────────────────────
  for (const s of statuses) {
    try {
      const { error } = await sb.from('notification_deliveries')
        .update(camposDoStatus(s))
        .eq('provider_message_id', s.waMessageId);
      if (error) throw new Error(error.message);
    } catch (e: any) {
      // Status perdido degrada a MEDIÇÃO, não a entrega — aviso, não crítico.
      console.error('[whatsapp-cloud] status falhou:', e?.message);
      await registrarDegradacao({
        fluxo: 'envio',
        tipo: DEGRADACAO.WHATSAPP_STATUS_PERDIDO,
        chave: 'status',
        severidade: 'aviso',
        detalhe: { wamid: s.waMessageId, status: s.status, motivo: e?.message || String(e) },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    mensagens: mensagens.length,
    statuses: statuses.length,
    ignorados,
  });
}

/**
 * De quem é este telefone?
 *
 * O número da Cloud API é ÚNICO para todos os tenants, então quem escreve chega
 * sem tenant. A resolução é pelo telefone — e ela pode ser AMBÍGUA: a mesma
 * pessoa (ou o mesmo aparelho) pode estar cadastrada em duas empresas. Nesse
 * caso a linha fica SEM empresa, com o motivo registrado.
 *
 * Chutar um tenant seria mostrar a mensagem de um colaborador no painel de outro
 * cliente — vazamento entre tenants, exatamente o que o isolamento desta base
 * existe para impedir. Lacuna contável é preferível a atribuição errada.
 */
async function resolverDono(sb: any, telefone: string) {
  const digits = telefone.replace(/\D/g, '');
  const { data, error } = await sb.from('colaboradores')
    .select('id, empresa_id')
    .or(`whatsapp.eq.${digits},telefone.eq.${digits},whatsapp.eq.+${digits},telefone.eq.+${digits}`)
    .limit(5);

  if (error) return { empresaId: null, colaboradorId: null, ambiguidade: `erro-na-resolucao: ${error.message}` };
  if (!data?.length) return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-desconhecido' };

  const empresas = new Set(data.map((c: any) => c.empresa_id));
  if (empresas.size > 1) {
    return { empresaId: null, colaboradorId: null, ambiguidade: 'telefone-em-multiplas-empresas' };
  }
  return { empresaId: data[0].empresa_id, colaboradorId: data[0].id, ambiguidade: null };
}
