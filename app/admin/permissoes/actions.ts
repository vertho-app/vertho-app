'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { logAdminAction } from '@/lib/audit';
import {
  BASE_ROLE_PERMISSIONS,
  PERMISSIONS,
  SYSTEM_ROLES,
  can,
  getEffectivePermissionKeys,
  getSystemRole,
  loadPermissionOverrides,
  type PermissionKey,
  type PermissionOverride,
  type SystemRole,
} from '@/lib/permissions';
import { requirePermissionAction } from '@/lib/auth/action-context';

const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));
const ROLE_KEYS = new Set(SYSTEM_ROLES.map((r) => r.key));
const CRITICAL_SELF_PERMISSIONS: PermissionKey[] = ['admin.access', 'permissions.view', 'permissions.manage'];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function scopeKey(scopeType: 'role' | 'user', value: string) {
  return scopeType === 'role' ? `role:${value}` : `user:${normalizeEmail(value)}`;
}

export async function loadPermissionsConsole() {
  const ctx = await requirePermissionAction('permissions.view');
  const roleScopeKeys = SYSTEM_ROLES.map((role) => `role:${role.key}`);
  const overrides = await loadPermissionOverrides(roleScopeKeys);

  return {
    currentUser: {
      email: ctx.email,
      role: getSystemRole(ctx),
      canManage: await can(ctx, 'permissions.manage'),
    },
    roles: SYSTEM_ROLES,
    permissions: PERMISSIONS,
    base: BASE_ROLE_PERMISSIONS,
    roleOverrides: overrides,
  };
}

export async function diagnoseUserPermissions(email: string) {
  await requirePermissionAction('permissions.view');
  const clean = normalizeEmail(email || '');
  if (!clean) return { success: false, error: 'Informe um e-mail.' };

  const userCtx = await getUserContext(clean);
  if (!userCtx) return { success: false, error: 'Usuário não encontrado no contexto Vertho.' };

  const effective = await getEffectivePermissionKeys({ ...userCtx, email: clean });
  const role = getSystemRole(userCtx);
  const overrides = await loadPermissionOverrides([`role:${role}`, `user:${clean}`]);

  return {
    success: true,
    user: {
      email: clean,
      role,
      tenantRole: userCtx.role,
      isPlatformAdmin: userCtx.isPlatformAdmin,
      empresaId: userCtx.empresaId,
      nome: userCtx.colaborador?.nome_completo || null,
    },
    allowed: Array.from(effective),
    denied: PERMISSIONS.map((p) => p.key).filter((key) => !effective.has(key)),
    overrides,
  };
}

export async function savePermissionOverride(input: {
  scopeType: 'role' | 'user';
  scopeValue: string;
  permissionKey: PermissionKey;
  effect: 'allow' | 'deny';
  reason: string;
}) {
  const ctx = await requirePermissionAction('permissions.manage');
  const permissionKey = input.permissionKey;
  const reason = (input.reason || '').trim();

  if (!PERMISSION_KEYS.has(permissionKey)) return { success: false, error: 'Permissão inválida.' };
  if (!['allow', 'deny'].includes(input.effect)) return { success: false, error: 'Efeito inválido.' };
  if (reason.length < 5) return { success: false, error: 'Informe um motivo com pelo menos 5 caracteres.' };

  const scopeType = input.scopeType;
  const rawScopeValue = (input.scopeValue || '').trim();
  if (scopeType === 'role' && !ROLE_KEYS.has(rawScopeValue as SystemRole)) {
    return { success: false, error: 'Papel inválido.' };
  }
  if (scopeType === 'user' && !rawScopeValue.includes('@')) {
    return { success: false, error: 'E-mail inválido para override de usuário.' };
  }

  const key = scopeKey(scopeType, rawScopeValue);
  const currentUserKey = ctx.email ? `user:${normalizeEmail(ctx.email)}` : '';

  if (input.effect === 'deny') {
    if (key === currentUserKey && CRITICAL_SELF_PERMISSIONS.includes(permissionKey)) {
      return { success: false, error: 'Você não pode remover sua própria permissão crítica.' };
    }
    if (key === 'role:platform_admin' && CRITICAL_SELF_PERMISSIONS.includes(permissionKey)) {
      return { success: false, error: 'Permissões críticas de Admin Master não podem ser negadas por papel.' };
    }
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('permission_overrides')
    .upsert({
      scope_type: scopeType,
      scope_key: key,
      permission_key: permissionKey,
      effect: input.effect,
      reason,
      created_by_email: ctx.email,
    }, { onConflict: 'scope_type,scope_key,permission_key' })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'permissions.override.save',
    alvo: `${key}:${permissionKey}`,
    detalhes: { effect: input.effect, reason, overrideId: data?.id },
  });

  revalidatePath('/admin/permissoes');
  return { success: true };
}

export async function removePermissionOverride(id: string) {
  const ctx = await requirePermissionAction('permissions.manage');
  if (!id) return { success: false, error: 'ID obrigatório.' };

  const sb = createSupabaseAdmin();
  const { data: existing } = await sb
    .from('permission_overrides')
    .select('id, scope_key, permission_key, effect')
    .eq('id', id)
    .maybeSingle<PermissionOverride>();

  if (!existing) return { success: false, error: 'Override não encontrado.' };

  const { error } = await sb.from('permission_overrides').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'permissions.override.remove',
    alvo: `${existing.scope_key}:${existing.permission_key}`,
    detalhes: { effect: existing.effect, overrideId: id },
  });

  revalidatePath('/admin/permissoes');
  return { success: true };
}
