import { requirePermissionAction, requireUserAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';
import { can, type PermissionKey } from '@/lib/permissions';

/**
 * Helper para actions administrativas: autoriza o caller (permissão granular)
 * antes de devolver um client com service_role.
 *
 * Default = 'admin.access' (qualquer admin, master ou sócio — usado em LEITURAS).
 * Para AÇÕES DE ESCRITA/DESTRUTIVAS, passe a permissão específica do domínio
 * (ex.: 'content.manage', 'trash.manage', 'users.manage') — assim o Admin Sócio,
 * que não tem essas permissões, é bloqueado, enquanto o master segue liberado.
 */
export async function requireAdminSupabase(permission: PermissionKey = 'admin.access') {
  await requirePermissionAction(permission);
  return createSupabaseAdmin();
}

/**
 * Gate TENANT-SCOPED: autoriza platform_admin (qualquer empresa, respeitando a
 * permissão) OU o RH da PRÓPRIA empresa. Permite que o admin de um cliente (ex.: a
 * prefeitura, via projetomacae.vertho.ai) opere ações da sua empresa sem acesso ao
 * painel da plataforma.
 *
 * SEGURANÇA: para o RH, exige `ctx.empresaId === empresaId`. Como o empresaId sempre
 * é confrontado com o contexto autenticado, adulterá-lo no cliente não vaza dados de
 * outra empresa (cai em FORBIDDEN). Platform admin ignora o empresaId (vê tudo).
 * Recrutamento é função de RH — o gestor de equipe (role=gestor) NÃO passa.
 */
export async function requireEmpresaSupabase(empresaId: string, permission: PermissionKey = 'admin.access') {
  const ctx = await requireUserAction();
  if (ctx.isPlatformAdmin) {
    if (!(await can(ctx, permission))) throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
    return createSupabaseAdmin();
  }
  if (ctx.role === 'rh' && empresaId && ctx.empresaId === empresaId) return createSupabaseAdmin();
  throw new Error('FORBIDDEN: acesso restrito a esta empresa');
}

/**
 * Gate TENANT-SCOPED **e** com permissão para TODOS os papéis.
 *
 * Diferença para `requireEmpresaSupabase`: lá o parâmetro `permission` só vale para o
 * platform_admin — o RH passa por ser RH da própria empresa, com a permissão IGNORADA
 * (é o comportamento declarado no docstring acima, "respeitando a permissão" está preso
 * ao primeiro ramo). São duas réguas numa assinatura só.
 *
 * Aqui a permissão é conferida ANTES, para qualquer papel, e só então o tenant. Use este
 * quando a action recebe `empresaId` do cliente E a permissão exigida é uma que o papel
 * `rh` possui (`content.manage`, `settings.company.manage`, `exports.run`,
 * `assessments.dispatch`, `users.manage`, …) — senão um RH do tenant A escreve no tenant B.
 *
 * Auditoria 22/08 (A2/A3): 4 escritas em `empresas.sys_config` e o upload de perfil externo
 * estavam com `requireAdminSupabase(perm)`, que confere permissão e NÃO tenant.
 *
 * ⚠️ Não chama `createSupabaseAdmin` — delega, para não alargar a allowlist de service-role.
 */
export async function requireEmpresaSupabaseStrict(empresaId: string, permission: PermissionKey) {
  const ctx = await requireUserAction();
  if (!(await can(ctx, permission))) throw new Error(`FORBIDDEN: permissão necessária ${permission}`);
  return requireEmpresaSupabase(empresaId, permission);
}
