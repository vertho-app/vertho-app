import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsapp, type WaSendMeta } from '@/lib/whatsapp';

/**
 * Webhook chamado pelo QStash para enviar um link CIS individual via WhatsApp.
 * Valida assinatura QStash (Receiver manual/lazy), chama Z-API, retorna 200 ou 500 (retry).
 */

// Lazy Receiver — só instancia se as keys existirem
const whatsappPayloadSchema = z.object({
  telefone: z.string().trim().min(8).max(32),
  mensagem: z.string().trim().min(1).max(4000),
  envioId: z.string().uuid().optional(),
  // Carimbo pós-envio da pílula diária (fase 4): quando presentes, após o
  // sendWhatsapp ok o webhook grava o carimbo do canal em fase4_envios — quem
  // prova a entrega é o webhook, não o enfileiramento (F-C4). Enum fechado:
  // string livre deixaria o payload escolher QUALQUER coluna para sobrescrever.
  fase4EnvioId: z.string().uuid().optional(),
  carimboCampo: z.enum(['ultima_pilula1_whatsapp_em', 'ultima_pilula2_whatsapp_em']).optional(),
  // Anexo opcional (ex.: PDF do relatório individual no disparo em lote).
  // Vai por URL assinada — o documento é enviado após o texto, best-effort.
  documentoUrl: z.string().url().max(2000).optional(),
  documentoNome: z.string().trim().min(1).max(200).optional(),
  // Identificação da PESSOA no disparo em lote (broadcast/relatório), que não
  // tem `envioId` nem `fase4EnvioId` para resolvê-la.
  //
  // Sem isto, o lote de 11/08/2026 gravou 155 entregas com `colaborador_id`
  // NULO: não havia no banco quem tinha recebido, e a lista dos que ficaram de
  // fora teve de ser reconstruída da DLQ do QStash (que expira). Um novo
  // disparo com o mesmo filtro reenviaria para quem já recebeu.
  colaboradorId: z.string().uuid().optional(),
  empresaId: z.string().uuid().optional(),
  // Enum FECHADO, como `carimboCampo`: este valor vai para uma coluna de
  // telemetria e o payload é escolhido por quem publica — string livre deixaria
  // o `kind` do log ser qualquer coisa, e a métrica por tipo de envio pararia
  // de fechar.
  kindEnvio: z.enum(['broadcast', 'relatorio', 'magic_link']).optional(),
}).strict();

async function verifyQStashSignature(req, body) {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[qstash/whatsapp-cis] FAIL-CLOSED: signing keys ausentes em produção');
      return false;
    }
    console.warn('[qstash/whatsapp-cis] dev/preview sem signing keys — pulando verificação');
    return true;
  }

  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err) {
    console.error('[qstash/whatsapp-cis] Assinatura inválida:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/**
 * Contexto de negócio do envio, para a telemetria de entrega (mig 198).
 *
 * Resolvido ANTES do `sendWhatsapp` porque é lá dentro que a linha de
 * `notification_deliveries` é gravada.
 *
 * O `kind` sai de `carimboCampo`, que é enum FECHADO no schema acima — derivar
 * de um enum é diferente de adivinhar por substring: se alguém acrescentar um
 * valor novo, o TypeScript obriga a decidir o kind aqui em vez de deixar cair
 * num default silencioso.
 *
 * A pessoa vem junto de propósito: a comparação honesta entre WhatsApp e push é
 * por PESSOA ALCANÇADA, e sem `colaborador_id` no lado do WhatsApp essa conta
 * não existe. Custa um lookup por chave primária, uma vez por mensagem.
 */
async function resolverMetaEnvio(
  fase4EnvioId?: string,
  carimboCampo?: 'ultima_pilula1_whatsapp_em' | 'ultima_pilula2_whatsapp_em',
  envioId?: string,
  lote?: { colaboradorId?: string; empresaId?: string; kindEnvio?: 'broadcast' | 'relatorio' | 'magic_link' },
): Promise<WaSendMeta> {
  if (fase4EnvioId && carimboCampo) {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb
      .from('fase4_envios')
      .select('colaborador_id, empresa_id')
      .eq('id', fase4EnvioId)
      .maybeSingle();
    // supabase-js RETORNA `{ error }`: sem checar, a falha viraria uma pílula
    // gravada sem pessoa, indistinguível de pílula que realmente não tem.
    if (error) {
      console.warn(`[qstash/whatsapp-cis] meta da pílula sem pessoa: ${error.message}`);
    }
    return {
      kind: 'pilula',
      colaboradorId: (data as any)?.colaborador_id ?? null,
      empresaId: (data as any)?.empresa_id ?? null,
      dedupeKey: `${carimboCampo}:${fase4EnvioId}`,
    };
  }
  if (envioId) return { kind: 'diagnostico', colaboradorId: lote?.colaboradorId ?? null, empresaId: lote?.empresaId ?? null };
  // Lote: a pessoa vem no próprio payload — não há registro intermediário para
  // consultar, e sem isto a entrega é gravada sem dono.
  if (lote?.colaboradorId || lote?.empresaId || lote?.kindEnvio) {
    return {
      kind: lote.kindEnvio ?? 'broadcast',
      colaboradorId: lote.colaboradorId ?? null,
      empresaId: lote.empresaId ?? null,
      dedupeKey: lote.colaboradorId ? `${lote.kindEnvio ?? 'broadcast'}:${lote.colaboradorId}` : null,
    };
  }
  return {};
}

async function envioJaFinalizado(envioId?: string) {
  if (!envioId) return false;

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('envios_diagnostico')
    .select('status')
    .eq('id', envioId)
    .maybeSingle();

  if (error) {
    console.warn(`[qstash/whatsapp-cis] Falha ao checar envio_diagnostico ${envioId}: ${error.message}`);
    return false;
  }

  return data?.status === 'enviado' || data?.status === 'respondido';
}

async function marcarEnvioWhatsAppEntregue(envioId?: string) {
  if (!envioId) return true;

  const sb = createSupabaseAdmin();
  const { data: envioAtual } = await sb
    .from('envios_diagnostico')
    .select('canal')
    .eq('id', envioId)
    .maybeSingle();
  const canalAtual = envioAtual?.canal;
  const canal = canalAtual === 'email' || canalAtual === 'email_whatsapp'
    ? 'email_whatsapp'
    : 'whatsapp';

  const { error } = await sb
    .from('envios_diagnostico')
    .update({
      status: 'enviado',
      enviado_em: new Date().toISOString(),
      canal,
    })
    .eq('id', envioId)
    .neq('status', 'respondido');

  if (error) {
    console.error(`[qstash/whatsapp-cis] Falha ao atualizar envio_diagnostico ${envioId}: ${error.message}`);
    return false;
  }

  return true;
}

/**
 * Carimbo do canal WhatsApp da pílula diária (fase 4), espelho de
 * marcarEnvioWhatsAppEntregue: roda APÓS o sendWhatsapp confirmar. Atualiza UM
 * campo só — não pode sobrescrever o carimbo do e-mail nem o consolidado
 * `ultima_pilulaN_em` (gravados pelo worker no enfileiramento/envio síncrono).
 * Falha aqui NÃO pode virar 5xx: o texto já foi entregue e o retry do QStash
 * reenviaria a mensagem — só loga e reporta no corpo da resposta.
 */
async function carimbarPilulaWhatsAppEntregue(fase4EnvioId?: string, carimboCampo?: string) {
  if (!fase4EnvioId || !carimboCampo) return true;

  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('fase4_envios')
    .update({ [carimboCampo]: new Date().toISOString() })
    .eq('id', fase4EnvioId);

  if (error) {
    console.error(`[qstash/whatsapp-cis] Falha ao carimbar fase4_envios ${fase4EnvioId}.${carimboCampo}: ${error.message}`);
    return false;
  }

  return true;
}

export async function POST(req) {
  try {
    const rawBody = await req.text();

    // Verificar assinatura
    const valid = await verifyQStashSignature(req, rawBody);
    if (!valid) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
    }

    let payload;
    try {
      payload = whatsappPayloadSchema.parse(JSON.parse(rawBody));
    } catch (err) {
      const detalhe = err instanceof z.ZodError ? err.issues[0]?.message : 'JSON inválido';
      return NextResponse.json({ error: detalhe || 'Payload inválido' }, { status: 400 });
    }

    const {
      telefone, mensagem, envioId, fase4EnvioId, carimboCampo, documentoUrl, documentoNome,
      colaboradorId, empresaId, kindEnvio,
    } = payload;

    if (!telefone || !mensagem) {
      return NextResponse.json({ error: 'telefone e mensagem obrigatórios' }, { status: 400 });
    }

    if (await envioJaFinalizado(envioId)) {
      console.log(`[qstash/whatsapp-cis] envio_diagnostico ${envioId} já finalizado; ignorando retry duplicado`);
      return NextResponse.json({ success: true, duplicate: true });
    }

    // Serviço central com failover (Z-API → WaSender). Se NENHUM provedor
    // entregar, devolve 503 para o QStash retentar (queda transitória de sessão).
    const metaEnvio = await resolverMetaEnvio(fase4EnvioId, carimboCampo, envioId, { colaboradorId, empresaId, kindEnvio });
    const r = await sendWhatsapp({ kind: 'text', phone: telefone, text: mensagem }, metaEnvio);
    console.log(
      `[qstash/whatsapp-cis] phone=***${telefone.replace(/\D/g, '').slice(-4)} ok=${r.ok} provider=${r.provider ?? '-'} trilha=${r.attempts.map((a) => `${a.provider}:${a.ok ? 'ok' : a.reason}`).join(' | ')}`,
    );
    if (!r.ok) {
      return NextResponse.json({ error: r.reason || 'WhatsApp indisponível' }, { status: 503 });
    }

    // Anexo (PDF do relatório): best-effort APÓS o texto entregue. NÃO pode
    // devolver 503/500 aqui — o texto já foi enviado e o retry do QStash
    // reenviaria a mensagem inteira, duplicando o texto. Falha só loga.
    if (documentoUrl) {
      try {
        const rDoc = await sendWhatsapp(
          {
            kind: 'document',
            phone: telefone,
            url: documentoUrl,
            filename: documentoNome || 'relatorio.pdf',
          },
          // O anexo é uma MENSAGEM à parte: conta como volume do canal, mas
          // carimbá-lo com o mesmo kind do texto inflaria a contagem de cadência
          // (duas linhas "pilula" para uma pílula só). Kind composto mantém as
          // duas leituras possíveis — com e sem anexos — de forma explícita.
          { ...metaEnvio, kind: metaEnvio.kind ? `${metaEnvio.kind}_anexo` : 'anexo' },
        );
        if (!rDoc.ok) {
          console.warn(`[qstash/whatsapp-cis] documento não enviado: ${rDoc.reason ?? '-'}`);
        }
      } catch (e) {
        console.warn('[qstash/whatsapp-cis] erro ao enviar documento:', e instanceof Error ? e.message : String(e));
      }
    }

    const statusAtualizado = await marcarEnvioWhatsAppEntregue(envioId);
    const carimboFase4 = await carimbarPilulaWhatsAppEntregue(fase4EnvioId, carimboCampo);
    return NextResponse.json({ success: true, statusAtualizado, carimboFase4, provider: r.provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[qstash/whatsapp-cis] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
