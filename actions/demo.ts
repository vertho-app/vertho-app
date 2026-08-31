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
import {
  prepareAcmeProspectExperience,
  removeAcmeProspectAuthUsers,
} from '@/lib/demo/acme-prospect-experience';
import type { AcmeProspectExperienceInput } from '@/lib/demo/acme-prospect-config';

/** Reset sob demanda do tenant demo escolhido, com allowlist tipada e auditoria. */
export async function resetarDemo(slug: DemoTenantSlug = 'acme-demo') {
  const ctx = await requireAdminAction();
  const r = await resetDemoTenant(slug);
  let authGuestsRemoved = 0;
  if (r.ok && slug === DEMO_PRESENTATION_TENANT_SLUG) {
    try {
      authGuestsRemoved = await removeAcmeProspectAuthUsers();
    } catch (error: any) {
      // Os colaboradores já foram apagados pelo reset tenant-scoped; sem eles,
      // os Auth órfãos não resolvem contexto. Esta limpeza é higiene best-effort.
      console.warn('[demo.reset] limpar convidados temporários do Auth:', error?.message);
    }
  }
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.reset',
    alvo: slug,
    detalhes: r.ok ? { counts: r.counts, authGuestsRemoved } : { error: r.error },
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

/**
 * Cria uma entrada individual e temporária no ACME neutro. Não recebe slug nem
 * contato real: o alvo é fixo e o compartilhamento continua sob controle do
 * vendedor, no browser.
 */
export async function prepararExperienciaProspectAcme(input: AcmeProspectExperienceInput) {
  const ctx = await requireAdminAction();
  const r = await prepareAcmeProspectExperience(input);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.prepare_prospect_experience',
    alvo: DEMO_PRESENTATION_TENANT_SLUG,
    detalhes: r.ok === true
      ? {
          sessionId: r.access.sessionId,
          nome: r.access.nome,
          empresa: r.access.empresa,
          cargo: r.access.cargo,
          expiresAt: r.access.expiresAt,
        }
      : { error: r.error },
  });
  if (r.ok === false) return { success: false as const, error: r.error };
  return { success: true as const, acesso: r.access };
}
