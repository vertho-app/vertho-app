'use server';

import { findColabByEmail } from '@/lib/authz';

/**
 * Server action thin wrapper para componentes client carregarem o colaborador
 * respeitando o tenant (header x-tenant-slug). Não pode ser chamado diretamente
 * de browser query — precisa passar pelo runtime do Next.
 */
export async function getColabByEmail(email, select) {
  return await findColabByEmail(email, select);
}
