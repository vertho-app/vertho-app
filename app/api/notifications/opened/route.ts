/**
 * Marca a ABERTURA de uma notificação. Chamado pelo `notificationclick` do
 * service worker.
 *
 * Por que POST autenticado e não um GET de redirect:
 * um GET que muta estado é disparado por pré-fetcher, antivírus corporativo e
 * bots de preview de link — inclusive o do próprio WhatsApp, se a URL algum dia
 * aparecer numa mensagem. Isso inflaria `opened_at` com robô e a métrica passaria
 * a medir varredura em vez de gente. Métrica inflada é pior que métrica ausente.
 *
 * O `.eq('colaborador_id')` é o gate de POSSE — sem ele, sessão válida bastaria
 * para marcar a entrega de qualquer outra pessoa como aberta.
 *
 * Falha de rede aqui perde UMA abertura. O viés é para BAIXO (subcontagem), que
 * é o lado seguro: nunca vai inventar engajamento que não houve.
 */
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const colaboradorId = auth.colaborador?.id;
  if (!colaboradorId) {
    return NextResponse.json({ error: 'sessão sem colaborador no tenant' }, { status: 403 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }

  const deliveryId = typeof body?.deliveryId === 'string' ? body.deliveryId.trim() : '';
  if (!deliveryId) {
    return NextResponse.json({ error: 'deliveryId obrigatório' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('notification_deliveries')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('colaborador_id', colaboradorId)
    .is('opened_at', null) // primeira abertura vale; reabrir não recarimba
    .select('id');

  if (error) {
    console.error('[notifications/opened] update falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível registrar' }, { status: 500 });
  }

  // Zero linhas = id inexistente, de outra pessoa, ou já aberto antes. Os três
  // são não-eventos, não erros: responder 200 evita ensinar o cliente a
  // distinguir "não é seu" de "não existe" (enumeração).
  return NextResponse.json({ ok: true, registrado: (data ?? []).length > 0 });
}
