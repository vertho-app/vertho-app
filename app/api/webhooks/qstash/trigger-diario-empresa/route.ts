import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { processarEmpresaDiario } from '@/lib/fase4/trigger-diario-empresa';

/**
 * Worker do trigger diário (fan-out): processa a cadência de HOJE de UMA
 * empresa por invocação. O dispatcher (actions/cron-jobs.ts → triggerDiario,
 * que detém o lock diário) enfileira uma task QStash por empresa aqui — antes
 * o loop sequencial monolítico estourava o maxDuration da lambda e as empresas
 * do fim da lista ficavam sem envio.
 *
 * A task é IDEMPOTENTE no mesmo dia (carimbos por canal em fase4_envios), então
 * erro → 5xx para o QStash retentar sem risco de duplicar envio.
 *
 * Autenticação (mesmo padrão de app/api/conarh/artefato):
 *   1. header x-internal-dispatch == INTERNAL_DISPATCH_SECRET, ou
 *   2. assinatura QStash (QSTASH_CURRENT/NEXT_SIGNING_KEY);
 *   sem nenhum dos dois configurados → FAIL-CLOSED em produção.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  empresaId: z.string().uuid(),
}).strict();

async function verifyRequest(req: Request, body: string): Promise<boolean> {
  // 1) Bypass via header interno (server-to-server fallback quando QStash não está configurado).
  const internalSecret = process.env.INTERNAL_DISPATCH_SECRET;
  if (internalSecret) {
    const headerToken = req.headers.get('x-internal-dispatch') || '';
    if (safeSecretEqual(headerToken, internalSecret)) return true;
  }

  // 2) QStash signature
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[qstash/trigger-diario-empresa] FAIL-CLOSED: nem signing keys nem internal secret em produção');
      return false;
    }
    console.warn('[qstash/trigger-diario-empresa] dev/preview sem signing keys — pulando verificação');
    return true;
  }
  try {
    const { Receiver } = await import('@upstash/qstash');
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    const signature = req.headers.get('upstash-signature') || '';
    await receiver.verify({ signature, body });
    return true;
  } catch (err: any) {
    console.error('[qstash/trigger-diario-empresa] Assinatura QStash inválida:', err?.message);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const valid = await verifyRequest(req, rawBody);
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });

    let payload: z.infer<typeof bodySchema>;
    try {
      payload = bodySchema.parse(JSON.parse(rawBody));
    } catch {
      return NextResponse.json({ error: 'Payload inválido (esperado { empresaId })' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    const { data: empresa, error } = await sb.from('empresas')
      .select('id, nome, slug, is_demo, sys_config')
      .eq('id', payload.empresaId)
      .maybeSingle();
    if (error) {
      // Falha de banco é transitória → 5xx para o QStash retentar.
      console.error('[qstash/trigger-diario-empresa] erro ao buscar empresa:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!empresa) {
      // Empresa apagada entre o enqueue e o consumo: retry não resolve → 4xx.
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const hoje = new Date().getUTCDay();          // 0=dom..6=sáb (= índice da config)
    const hojeUTC = new Date().toISOString().slice(0, 10);
    const resumo = await processarEmpresaDiario(empresa, { hoje, hojeUTC });

    console.log(`[qstash/trigger-diario-empresa] ${(empresa as any).slug || empresa.id}:`, JSON.stringify(resumo));
    return NextResponse.json({ ok: true, empresaId: empresa.id, ...resumo });
  } catch (err: any) {
    // 500 sinaliza pro QStash retentar (a task é idempotente no mesmo dia).
    console.error('[qstash/trigger-diario-empresa] FATAL', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
