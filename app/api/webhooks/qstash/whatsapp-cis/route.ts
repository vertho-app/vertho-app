import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase';
import { sendWhatsapp } from '@/lib/whatsapp';

/**
 * Webhook chamado pelo QStash para enviar um link CIS individual via WhatsApp.
 * Valida assinatura QStash (Receiver manual/lazy), chama Z-API, retorna 200 ou 500 (retry).
 */

// Lazy Receiver — só instancia se as keys existirem
const whatsappPayloadSchema = z.object({
  telefone: z.string().trim().min(8).max(32),
  mensagem: z.string().trim().min(1).max(4000),
  envioId: z.string().uuid().optional(),
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

    const { telefone, mensagem, envioId } = payload;

    if (!telefone || !mensagem) {
      return NextResponse.json({ error: 'telefone e mensagem obrigatórios' }, { status: 400 });
    }

    if (await envioJaFinalizado(envioId)) {
      console.log(`[qstash/whatsapp-cis] envio_diagnostico ${envioId} já finalizado; ignorando retry duplicado`);
      return NextResponse.json({ success: true, duplicate: true });
    }

    // Serviço central com failover (Z-API → WaSender). Se NENHUM provedor
    // entregar, devolve 503 para o QStash retentar (queda transitória de sessão).
    const r = await sendWhatsapp({ kind: 'text', phone: telefone, text: mensagem });
    console.log(
      `[qstash/whatsapp-cis] phone=***${telefone.replace(/\D/g, '').slice(-4)} ok=${r.ok} provider=${r.provider ?? '-'} trilha=${r.attempts.map((a) => `${a.provider}:${a.ok ? 'ok' : a.reason}`).join(' | ')}`,
    );
    if (!r.ok) {
      return NextResponse.json({ error: r.reason || 'WhatsApp indisponível' }, { status: 503 });
    }

    const statusAtualizado = await marcarEnvioWhatsAppEntregue(envioId);
    return NextResponse.json({ success: true, statusAtualizado, provider: r.provider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[qstash/whatsapp-cis] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
