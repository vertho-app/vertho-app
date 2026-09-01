export type CopilotHomeHref = '/admin/dashboard' | '/representante';

/**
 * O contexto comercial e o portal de origem são capacidades independentes.
 * Um platform admin também pode ser representante ativo; nesse caso ele usa
 * os recursos comerciais do Copiloto, mas retorna ao painel administrativo.
 */
export function resolveCopilotHomeHref(
  accessKind: 'admin' | 'representative',
  hasPlatformAdminAccess: boolean,
): CopilotHomeHref {
  return accessKind === 'admin' || hasPlatformAdminAccess
    ? '/admin/dashboard'
    : '/representante';
}
