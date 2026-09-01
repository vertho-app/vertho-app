'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import {
  gerarMagicLinksDemo,
  prepararAcessosDemo,
  prepararAcessosApresentacaoDemo,
  resetDemoTenant,
  DEMO_TENANT_PROFILES,
  type DemoTenantSlug,
} from '@/lib/demo/reset-acme-demo';
import {
  DEMO_PRESENTATION_TENANT_SLUG,
  demoPresentationAuthUrl,
} from '@/lib/demo/presentation';
import { issueDemoPresentationTicket } from '@/lib/demo/presentation-ticket';
import {
  createAcmeProspectLifecycle,
  prepareAcmeProspectExperience,
} from '@/lib/demo/acme-prospect-experience';
import {
  cleanupExpiredDemoProspects,
  listDemoGuestProgress,
} from '@/lib/demo/acme-prospect-tracking';
import {
  ACME_PROSPECT_EXPERIENCE_VIEWS,
  validateAcmeProspectExperienceInput,
  type AcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';

/** Reset sob demanda do tenant demo escolhido, com allowlist tipada e auditoria. */
export async function resetarDemo(slug: DemoTenantSlug = 'acme-demo') {
  const ctx = await requireAdminAction();
  try {
    // O preflight é do ambiente que está sendo resetado. Ele valia só para o
    // ACME e, pior, lia sempre o ACME: o botão de outro ambiente recompunha
    // sem olhar convidado nenhum, e um convidado ativo no ACME travaria o
    // reset do vizinho. Ambiente sem degustação simplesmente não tem sessão
    // para achar, então a checagem é inofensiva onde não se aplica.
    const lifecycle = await cleanupExpiredDemoProspects(slug);
    if (lifecycle.activeCount > 0) {
      await logAdminAction({
        adminEmail: ctx.email,
        acao: 'demo.reset',
        alvo: slug,
        detalhes: { skipped: true, ...lifecycle },
        resultado: 'parcial',
      });
      return {
        success: true as const,
        skipped: true as const,
        activeGuests: lifecycle.activeCount,
        nextExpiry: lifecycle.nextExpiry,
      };
    }
  } catch (error: any) {
    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'demo.reset',
      alvo: slug,
      detalhes: { error: error?.message },
      resultado: 'erro',
    });
    return { success: false as const, error: error?.message || 'falha ao conferir convidados ativos' };
  }
  const r = await resetDemoTenant(slug);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'demo.reset',
    alvo: slug,
    detalhes: r.ok ? { counts: r.counts } : { error: r.error },
  });
  if (!r.ok) return { success: false, error: r.error };
  return { success: true as const, skipped: false as const, counts: r.counts };
}

/**
 * Acompanhamento dos convidados de um tenant de demonstração; leitura exclusiva
 * de platform admin. O slug vem do cliente, então passa pela MESMA allowlist
 * tipada do reset (`DEMO_TENANT_PROFILES`) antes de virar consulta.
 */
export async function listarConvidadosDemo(slug: DemoTenantSlug = 'acme-demo') {
  await requireAdminAction();
  if (!Object.prototype.hasOwnProperty.call(DEMO_TENANT_PROFILES, slug)) {
    return { success: false as const, error: 'Tenant de demonstração inválido.' };
  }
  try {
    return { success: true as const, convidados: await listDemoGuestProgress(slug) };
  } catch (error: any) {
    return { success: false as const, error: error?.message || 'falha ao carregar convidados' };
  }
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
  const parsed = validateAcmeProspectExperienceInput(input);
  if (parsed.ok === false) {
    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'demo.prepare_prospect_experience',
      alvo: DEMO_PRESENTATION_TENANT_SLUG,
      detalhes: { error: parsed.error },
    });
    return { success: false as const, error: parsed.error };
  }

  const lifecycle = createAcmeProspectLifecycle();
  const presentation = await prepararAcessosApresentacaoDemo();
  const rawPresentationViews = presentation.acessos || [];
  const missingViews = ACME_PROSPECT_EXPERIENCE_VIEWS
    .filter((required) => !rawPresentationViews.some((view) => view.roleKey === required.roleKey))
    .map((view) => view.roleKey);
  if (!presentation.ok || missingViews.length > 0) {
    const error = presentation.error
      || `As três visões da experiência não foram preparadas: ${missingViews.join(', ')}.`;
    await logAdminAction({
      adminEmail: ctx.email,
      acao: 'demo.prepare_prospect_experience',
      alvo: DEMO_PRESENTATION_TENANT_SLUG,
      detalhes: { error },
    });
    return { success: false as const, error };
  }

  const issuedAt = Math.floor(Date.now() / 1_000);
  const trackedTicket = issueDemoPresentationTicket(issuedAt, {
    prospectSessionId: lifecycle.sessionId,
    expiresAtSeconds: Math.floor(Date.parse(lifecycle.expiresAt) / 1_000),
  });
  const presentationViews = rawPresentationViews.map((view) => ({
    ...view,
    url: demoPresentationAuthUrl(view.roleKey, trackedTicket),
  }));
  const r = await prepareAcmeProspectExperience(parsed.value, lifecycle, ctx.email);
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
          visoes: presentationViews.map((view) => view.roleKey),
        }
      : { error: r.error },
  });
  if (r.ok === false) return { success: false as const, error: r.error };
  return { success: true as const, acesso: r.access, visoes: presentationViews };
}
