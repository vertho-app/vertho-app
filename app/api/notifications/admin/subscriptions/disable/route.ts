/**
 * Desativa push da inbox do admin neste aparelho.
 * Não gateada por flag — sair sempre tem que ser possível.
 */
import { NextResponse } from 'next/server';
import { getAuthenticatedEmail } from '@/lib/auth/request-context';
import { getUserContext } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { csrfCheck } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const csrf = csrfCheck(req);
  if (csrf) return csrf;

  const email = await getAuthenticatedEmail(req);
  if (!email) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return NextResponse.json({ error: 'apenas equipe Vertho' }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'corpo inválido' }, { status: 400 }); }
  const installationId = typeof body?.installationId === 'string' ? body.installationId.trim() : '';
  if (!installationId) return NextResponse.json({ error: 'installationId obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  // Resolve user_id pelo email (mesma lógica da rota de registro).
  let userId: string | null = null;
  try {
    const maybe = (sb.auth as any).admin.getUserByEmail;
    if (typeof maybe === 'function') {
      const r = await maybe(email);
      userId = (r as any)?.data?.user?.id ?? null;
    }
  } catch {}
  if (!userId) {
    try {
      const { data: lst } = await (sb.auth as any).admin.listUsers({ page: 1, perPage: 1000 });
      const u = (lst as any)?.users?.find((x: any) => String(x.email || '').toLowerCase() === email.toLowerCase());
      userId = u?.id ?? null;
    } catch {}
  }
  if (!userId) return NextResponse.json({ error: 'usuário não resolvido' }, { status: 500 });

  const { error } = await sb
    .from('notification_endpoints')
    .update({ enabled: false, disabled_reason: 'usuario', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('installation_id', installationId);

  if (error) {
    console.error('[admin/push/disable] falhou:', error.message);
    return NextResponse.json({ error: 'não foi possível desativar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
