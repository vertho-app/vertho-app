'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import {
  gerarMagicLinksDemo,
  prepararAcessosDemo,
  prepararAcessosApresentacaoDemo,
  resetDemoTenant,
  type DemoTenantSlug,
} from '@/lib/demo/reset-acme-demo';
import { DEMO_PRESENTATION_TENANT_SLUG } from '@/lib/demo/presentation';

/** Reset sob demanda do tenant demo escolhido, com allowlist tipada e auditoria. */
export async function resetarDemo(slug: DemoTenantSlug = 'acme-demo') {
  const ctx = await requireAdminAction();
  const r = await resetDemoTenant(slug);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.reset',
    alvo: slug,
    detalhes: r.ok ? { counts: r.counts } : { error: r.error },
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true, counts: r.counts };
}

/** Rotaciona as credenciais temporárias do prospect sem registrar a senha no audit log. */
export async function prepararAcessosTemporariosDemo(slug: DemoTenantSlug = 'acme-demo') {
  const ctx = await requireAdminAction();
  const r = await prepararAcessosDemo(slug);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.prepare_access',
    alvo: slug,
    detalhes: r.ok ? { contas: r.acessos?.map((a) => a.email) } : { error: r.error },
  });
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, url: r.url!, senha: r.senha!, acessos: r.acessos! };
}

/** Gera links de uso único; tokens nunca entram no log de auditoria. */
export async function gerarMagicLinksTemporariosDemo(slug: DemoTenantSlug) {
  const ctx = await requireAdminAction();
  const r = await gerarMagicLinksDemo(slug);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.prepare_magic_links',
    alvo: slug,
    detalhes: r.ok ? { contas: r.acessos?.map((a) => a.email) } : { error: r.error },
  });
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, acessos: r.acessos! };
}

/**
 * Prepara as três origens isoladas da sala de apresentação. O tenant é fixo e
 * neutro (`acme-demo`); não aceitamos alvo vindo do client neste fluxo.
 */
export async function prepararSalaApresentacaoDemo() {
  const ctx = await requireAdminAction();
  const r = await prepararAcessosApresentacaoDemo();
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.prepare_presentation',
    alvo: DEMO_PRESENTATION_TENANT_SLUG,
    detalhes: r.ok ? { contas: r.acessos?.map((a) => a.email) } : { error: r.error },
  });
  if (!r.ok) return { success: false as const, error: r.error };
  return { success: true as const, acessos: r.acessos! };
}
