'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { resetAcmeDemo } from '@/lib/demo/reset-acme-demo';

/**
 * Reset sob demanda do tenant ACME Demo (botão no admin). Gated a platform
 * admin. Registra em admin_audit_log. Tenant-safe (só toca `acme-demo`).
 */
export async function resetarDemoAcme() {
  const ctx = await requireAdminAction();
  const r = await resetAcmeDemo();
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.reset',
    alvo: 'acme-demo',
    detalhes: r.ok ? { counts: r.counts } : { error: r.error },
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true, counts: r.counts };
}
