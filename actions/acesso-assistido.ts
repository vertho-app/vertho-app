'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { can } from '@/lib/permissions';
import { abrirAcessoAssistido } from '@/lib/auth/acesso-assistido';

/**
 * "Entrar como esta pessoa" (`/admin/empresas/gerenciar`). Todo export daqui é endpoint HTTP: o
 * gate roda SEMPRE, antes de qualquer leitura, e o núcleo (`lib/auth/acesso-assistido.ts`) faz o
 * resto. Detalhe e motivo: o cabeçalho do núcleo.
 */

/** A tela mostra o botão? Só decide a exibição; quem barra é o gate de `entrarComoPessoa`. */
export async function podeEntrarComoPessoa(): Promise<boolean> {
  try {
    const ctx = await requireAdminAction();
    return await can(ctx, 'users.impersonate');
  } catch {
    return false;
  }
}

export async function entrarComoPessoa(empresaId: string, colaboradorId: string) {
  const ctx = await requireAdminAction('users.impersonate');
  return abrirAcessoAssistido({ adminEmail: ctx.email, empresaId, colaboradorId });
}
