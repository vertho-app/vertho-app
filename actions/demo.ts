'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { prepararAcessosDemo, resetAcmeDemo } from '@/lib/demo/reset-acme-demo';

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

/** Rotaciona as credenciais temporárias do prospect sem registrar a senha no audit log. */
export async function prepararAcessosTemporariosDemo() {
  const ctx = await requireAdminAction();
  const r = await prepararAcessosDemo();
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.prepare_access',
    alvo: 'acme-demo',
    detalhes: r.ok ? { contas: r.acessos?.map((a) => a.email) } : { error: r.error },
  });
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, url: r.url!, senha: r.senha!, acessos: r.acessos! };
}
