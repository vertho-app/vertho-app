/**
 * Registra um degrau do funil de adesão ao push (mig 201).
 *
 * Esta rota é o instrumento mais importante do spike: sem ela, um resultado
 * fraco fica ambíguo entre "push não engaja" e "ninguém conseguiu instalar o
 * PWA" — conclusões opostas que levam a decisões opostas (desistir do push vs.
 * partir para o shell nativo).
 *
 * `step` vem do cliente e por isso é validado contra uma lista fechada aqui,
 * além do CHECK no banco: entrada do cliente nunca é decisão do servidor, e um
 * step livre viraria lixo no funil sem nada acusar.
 */
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { detectarPlataforma } from '@/lib/notifications/plataforma';

export const runtime = 'nodejs';

const STEPS = new Set([
  'convite_exibido',
  'instalado_detectado',
  'permissao_solicitada',
  'permissao_concedida',
  'permissao_negada',
  'endpoint_registrado',
]);

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

  const step = typeof body?.step === 'string' ? body.step : '';
  if (!STEPS.has(step)) {
    return NextResponse.json({ error: 'step inválido' }, { status: 400 });
  }

  const userAgent = req.headers.get('user-agent') || '';
  const sb = createSupabaseAdmin();

  const { error } = await sb.from('notification_optin_events').insert({
    empresa_id: auth.empresaId ?? null,
    colaborador_id: colaboradorId,
    step,
    platform: detectarPlataforma(userAgent),
    user_agent: userAgent.slice(0, 400),
    detalhe: body?.detalhe && typeof body.detalhe === 'object' ? body.detalhe : null,
  });

  if (error) {
    console.error('[notifications/optin-event] insert falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível registrar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
