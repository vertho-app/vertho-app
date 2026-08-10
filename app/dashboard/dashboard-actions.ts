'use server';

import { getUserContext, findColabByEmail } from '@/lib/authz';
import { carregarDashboardData } from '@/lib/home/loaders';

/**
 * Carrega dados do dashboard usando o papel explícito (coluna `role`).
 * Nunca infere papel por regex em `cargo`.
 * Wrapper fino: auth + delega pra `carregarDashboardData` (lib/home/loaders).
 */
export async function loadDashboardData() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Colaborador nao encontrado para este e-mail' };

  return carregarDashboardData(ctx);
}

export async function loadAvatarData(emailHint?: string) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const emailSessao = await getAuthenticatedEmailFromAction();
    if (!emailSessao) return null;

    let email = emailSessao;
    // Gate de POSSE (auditoria 23/07, grupo C): o hint vinha do client — qualquer
    // autenticado consultava nome/foto/avatar de qualquer pessoa. Fora do self,
    // só com posse (gestor da área, RH/tutor do tenant, platform admin).
    if (emailHint && emailHint.trim().toLowerCase() !== emailSessao) {
      const { canViewColabJourney } = await import('@/lib/authz');
      const ctx = await getUserContext(emailSessao);
      // `gestor_email` é a régua do gate desde 10/08 (F4) — sem a coluna, nega.
      const alvo = await findColabByEmail(emailHint, 'id, empresa_id, area_depto, gestor_email');
      if (!canViewColabJourney(ctx, alvo)) return null;
      email = emailHint.trim().toLowerCase();
    }

    const data = await findColabByEmail(email, 'nome_completo, foto_url, avatar_preset');
    return data || { nome_completo: email, foto_url: null, avatar_preset: null };
  } catch (err) {
    console.error('[loadAvatarData]', err);
    return null;
  }
}
