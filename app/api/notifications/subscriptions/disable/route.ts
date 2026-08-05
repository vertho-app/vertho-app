/**
 * Desativa a inscrição desta instalação (logout, troca de conta, usuário desliga).
 *
 * A linha NÃO é apagada: `enabled = false` preserva o histórico de quem já teve
 * push. Deletar sumiria com a pessoa do denominador e o funil passaria a
 * mostrar uma adesão maior do que a real, retroativamente.
 *
 * O filtro por `colaborador_id` da SESSÃO é o gate de posse: `installationId`
 * vem do cliente e, sem esse escopo, bastaria adivinhar um id para desligar o
 * push de outra pessoa. Sessão válida não é prova de posse do recurso.
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

  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  if (!installationId) {
    return NextResponse.json({ error: 'installationId obrigatório' }, { status: 400 });
  }

  const sb = createSupabaseAdmin();
  const { error } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('colaborador_id', colaboradorId)
    .eq('installation_id', installationId);

  if (error) {
    console.error('[notifications/disable] update falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível desativar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
