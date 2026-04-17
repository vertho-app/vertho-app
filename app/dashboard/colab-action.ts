'use server';

import { findColabByEmail } from '@/lib/authz';

/**
 * Server action thin wrapper para componentes client carregarem o colaborador
 * respeitando o tenant (header x-tenant-slug). Não pode ser chamado diretamente
 * de browser query — precisa passar pelo runtime do Next.
 */
export async function getColabByEmail(select?: string) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return null;
  return await findColabByEmail(email, select);
}
