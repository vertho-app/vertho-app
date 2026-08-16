/**
 * POST /api/notifications/admin/subscriptions
 *
 * Registra a inscrição de push do ADMIN (equipe Vertho).
 * Gate: platform admin (isPlatformAdmin) + flag inbox (fail-closed).
 * Identidade: (user_id, installation_id) — nunca colaborador_id.
 */

import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getAuthenticatedEmail } from '@/lib/auth/request-context';
import { getUserContext } from '@/lib/authz';
import { detectarPlataforma } from '@/lib/notifications/plataforma';
import { validarSubscription } from '@/lib/notifications/validar-subscription';
import { inboxPushHabilitado } from '@/lib/notifications/inbox-flag';
import { csrfCheck } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const email = await getAuthenticatedEmail(req);
  if (!email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return NextResponse.json({ error: 'apenas equipe Vertho' }, { status: 403 });

  if (!(await inboxPushHabilitado())) {
    return NextResponse.json({ error: 'push da inbox desabilitado (flag notificacoes_inbox_push)' }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'corpo inválido' }, { status: 400 }); }

  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  const subscription = body?.subscription;
  if (!installationId || installationId.length > 100) return NextResponse.json({ error: 'installationId inválido' }, { status: 400 });
  const forma = validarSubscription(subscription);
  if (!forma.ok) return NextResponse.json({ error: forma.motivo }, { status: 400 });

  const userAgent = req.headers.get('user-agent') || '';
  const sb = createSupabaseAdmin();

  // Resolve auth.users.id pelo email. Supabase não tem getUserByEmail em todas
  // as versões, então o caminho robusto é listUsers + filtro em código.
  // Volume é baixo (centenas de usuários), custo aceitável.
  let userId: string | null = null;
  try {
    const { data: lst } = await (sb.auth as any).admin.listUsers({ page: 1, perPage: 1000 });
    const users: any[] = (lst as any)?.users ?? (lst as any)?.data?.users ?? [];
    const u = users.find((x: any) => String(x.email || '').toLowerCase() === email.toLowerCase());
    userId = u?.id ?? null;
  } catch (e: any) {
    console.error('[admin/push] listUsers falhou:', e?.message);
  }
  if (!userId) {
    return NextResponse.json({ error: 'não foi possível resolver o usuário admin' }, { status: 500 });
  }

  // Limpeza de duplicados: mesmo aparelho, installation_id diferente.
  const { error: errLimpeza } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, disabled_reason: 'reinstalacao', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('user_agent', userAgent.slice(0, 400))
    .neq('installation_id', installationId);
  if (errLimpeza) console.warn('[admin/push] limpeza duplicados falhou:', errLimpeza.message);

  // Troca de dono: mesma subscription, outro user_id.
  const { error: errDono } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, disabled_reason: 'troca-de-dono', updated_at: new Date().toISOString() })
    .eq('subscription->>endpoint', subscription.endpoint)
    .neq('user_id', userId);
  if (errDono) {
    console.error('[admin/push] reassociação falhou:', errDono.message);
    return NextResponse.json({ error: 'não foi possível registrar neste aparelho' }, { status: 500 });
  }

  const { error: errMesmo } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, disabled_reason: 'reinstalacao', updated_at: new Date().toISOString() })
    .eq('subscription->>endpoint', subscription.endpoint)
    .eq('user_id', userId)
    .neq('installation_id', installationId);
  if (errMesmo) {
    console.error('[admin/push] limpeza mesma pessoa falhou:', errMesmo.message);
    return NextResponse.json({ error: 'não foi possível registrar neste aparelho' }, { status: 500 });
  }

  const { data, error } = await sb
    .from('notification_endpoints')
    .upsert(
      {
        user_id: userId,
        colaborador_id: null,
        empresa_id: null,
        installation_id: installationId,
        platform: detectarPlataforma(userAgent),
        provider: 'webpush',
        subscription,
        enabled: true,
        disabled_reason: null,
        user_agent: userAgent.slice(0, 400),
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,installation_id' }
    )
    .select('id')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'este aparelho já está registrado em outra conta' }, { status: 409 });
    }
    console.error('[admin/push] upsert falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível registrar a inscrição' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, endpointId: (data as { id: string }).id });
}
