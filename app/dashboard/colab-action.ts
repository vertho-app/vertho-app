'use server';

import { findColabByEmail } from '@/lib/authz';

/**
 * Colunas que um componente client pode pedir. Todo export de `'use server'` é
 * um endpoint HTTP e o argumento é do CLIENTE: repassar `select` cru ao PostgREST
 * com service-role deixava qualquer colaborador logado pedir
 * `empresas(colaboradores(*))` e ler a base inteira do tenant, com todas as
 * colunas (análise de 05/10/2026). Só nomes simples desta lista passam; embed,
 * `*`, alias e cast não casam, e o que sobra cai no select padrão do servidor.
 */
const COLUNAS_PERMITIDAS = new Set([
  'id', 'nome_completo', 'email', 'cargo', 'area_depto',
  'empresa_id', 'escola_id', 'role', 'perfil_dominante', 'locale',
]);

function colunasSeguras(select?: string): string | undefined {
  if (typeof select !== 'string') return undefined;
  const ok = select.split(',').map((c) => c.trim()).filter((c) => COLUNAS_PERMITIDAS.has(c));
  return ok.length > 0 ? [...new Set(ok)].join(', ') : undefined;
}

/**
 * Server action thin wrapper para componentes client carregarem o colaborador
 * respeitando o tenant (header x-tenant-slug). Não pode ser chamado diretamente
 * de browser query — precisa passar pelo runtime do Next.
 */
export async function getColabByEmail(select?: string) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return null;
  return await findColabByEmail(email, colunasSeguras(select));
}
