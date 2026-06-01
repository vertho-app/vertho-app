import { createSupabaseAdmin } from '@/lib/supabase';
import type { Role, UserContext } from '@/types';

export type SystemRole = 'platform_admin' | 'socio' | Role;

export type PermissionKey =
  | 'admin.access'
  | 'permissions.view'
  | 'permissions.manage'
  | 'platform_admins.manage'
  | 'audit.view'
  | 'companies.view'
  | 'companies.manage'
  | 'users.view'
  | 'users.manage'
  | 'settings.company.manage'
  | 'settings.locale.manage'
  | 'assessments.dispatch'
  | 'assessments.answer'
  | 'reports.aggregate.view'
  | 'reports.individual.view'
  | 'journey.own.view'
  | 'journey.team.view'
  | 'content.manage'
  | 'knowledge_base.manage'
  | 'ai.audit.regenerate'
  | 'ai.costs.view'
  | 'radar.admin.access'
  | 'radar_empresas.access'
  | 'exports.run'
  | 'trash.manage';

export type PermissionRisk = 'low' | 'medium' | 'high' | 'critical';

export type PermissionDefinition = {
  key: PermissionKey;
  domain: string;
  label: string;
  description: string;
  risk: PermissionRisk;
};

export const SYSTEM_ROLES: { key: SystemRole; label: string; description: string }[] = [
  { key: 'platform_admin', label: 'Admin Master', description: 'Acesso global Vertho e operações internas.' },
  { key: 'socio', label: 'Admin Sócio', description: 'Admin com visão ampla; sem ações destrutivas ou geradoras.' },
  { key: 'rh', label: 'Admin da empresa', description: 'Admin/RH do tenant, com visão ampla da empresa.' },
  { key: 'gestor', label: 'Gestor', description: 'Liderança com acesso à própria equipe/área.' },
  { key: 'tutor', label: 'Tutor', description: 'Acompanha colaboradores explicitamente tutorados.' },
  { key: 'colaborador', label: 'Usuário', description: 'Acesso individual à própria jornada.' },
];

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'admin.access', domain: 'Admin', label: 'Acessar admin', description: 'Entrar no painel administrativo.', risk: 'critical' },
  { key: 'permissions.view', domain: 'Governança', label: 'Ver papéis e permissões', description: 'Visualizar matriz e diagnóstico de permissões.', risk: 'high' },
  { key: 'permissions.manage', domain: 'Governança', label: 'Editar permissões', description: 'Criar overrides allow/deny para papéis e usuários.', risk: 'critical' },
  { key: 'platform_admins.manage', domain: 'Governança', label: 'Gerenciar admins master', description: 'Adicionar ou remover platform admins.', risk: 'critical' },
  { key: 'audit.view', domain: 'Governança', label: 'Ver auditoria', description: 'Consultar rastros de ações administrativas.', risk: 'high' },
  { key: 'companies.view', domain: 'Empresas', label: 'Ver empresas', description: 'Listar empresas e dados cadastrais.', risk: 'medium' },
  { key: 'companies.manage', domain: 'Empresas', label: 'Gerenciar empresas', description: 'Criar, editar, configurar ou excluir tenants.', risk: 'critical' },
  { key: 'users.view', domain: 'Usuários', label: 'Ver usuários', description: 'Listar colaboradores da empresa.', risk: 'medium' },
  { key: 'users.manage', domain: 'Usuários', label: 'Gerenciar usuários', description: 'Criar, editar, importar, exportar ou excluir colaboradores.', risk: 'high' },
  { key: 'settings.company.manage', domain: 'Configurações', label: 'Configurar empresa', description: 'Editar preferências, branding e ajustes do tenant.', risk: 'high' },
  { key: 'settings.locale.manage', domain: 'Configurações', label: 'Configurar idioma', description: 'Alterar idioma padrão da empresa ou preferência do usuário.', risk: 'medium' },
  { key: 'assessments.dispatch', domain: 'Avaliações', label: 'Disparar avaliações', description: 'Enviar convites, ciclos, pulse e comunicações em lote.', risk: 'high' },
  { key: 'assessments.answer', domain: 'Avaliações', label: 'Responder avaliações', description: 'Responder avaliações e interações da própria jornada.', risk: 'low' },
  { key: 'reports.aggregate.view', domain: 'Relatórios', label: 'Ver relatórios agregados', description: 'Visualizar indicadores de empresa/equipe.', risk: 'medium' },
  { key: 'reports.individual.view', domain: 'Relatórios', label: 'Ver relatórios individuais', description: 'Acessar relatórios e avaliações de colaboradores.', risk: 'high' },
  { key: 'journey.own.view', domain: 'Jornada', label: 'Ver própria jornada', description: 'Acessar dashboard, PDI e trilha próprios.', risk: 'low' },
  { key: 'journey.team.view', domain: 'Jornada', label: 'Ver jornada da equipe', description: 'Acompanhar progresso de equipe ou tutorados.', risk: 'medium' },
  { key: 'content.manage', domain: 'Conteúdo', label: 'Gerenciar conteúdos', description: 'Editar competências, trilhas, vídeos e base de aprendizagem.', risk: 'high' },
  { key: 'knowledge_base.manage', domain: 'Conteúdo', label: 'Gerenciar knowledge base', description: 'Editar base RAG por tenant.', risk: 'high' },
  { key: 'ai.audit.regenerate', domain: 'IA', label: 'Regenerar auditorias IA', description: 'Reprocessar avaliações, checks e scorings com IA.', risk: 'critical' },
  { key: 'ai.costs.view', domain: 'IA', label: 'Ver custos de IA', description: 'Acessar orçamento, simulador de custo e catálogo de chamadas.', risk: 'high' },
  { key: 'radar.admin.access', domain: 'Radar', label: 'Acessar Radar admin', description: 'Gerenciar ingestão, qualidade e dados do Radar.', risk: 'critical' },
  { key: 'radar_empresas.access', domain: 'Radar Empresas', label: 'Acessar Radar Empresas', description: 'Usar inteligência comercial B2B interna.', risk: 'high' },
  { key: 'exports.run', domain: 'Dados', label: 'Exportar dados', description: 'Gerar planilhas, PDFs e saídas em lote.', risk: 'high' },
  { key: 'trash.manage', domain: 'Dados', label: 'Gerenciar lixeira', description: 'Visualizar e restaurar/remover registros excluídos.', risk: 'critical' },
];

export const BASE_ROLE_PERMISSIONS: Record<SystemRole, PermissionKey[]> = {
  platform_admin: PERMISSIONS.map((p) => p.key),
  // Admin Sócio: vê tudo (acesso + *.view + auditoria + custos IA), pode exportar,
  // ver Radar Empresas e configurar idioma — mas NENHUMA ação destrutiva ou
  // geradora (sem *.manage de governança/empresa/usuário/conteúdo, sem disparar
  // avaliações, regenerar IA, admin do Radar ou mexer na lixeira).
  socio: [
    'admin.access',
    'permissions.view',
    'audit.view',
    'companies.view',
    'users.view',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
    'ai.costs.view',
    'exports.run',
    'radar_empresas.access',
    'settings.locale.manage',
  ],
  rh: [
    'users.view',
    'users.manage',
    'settings.company.manage',
    'settings.locale.manage',
    'assessments.dispatch',
    'assessments.answer',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
    'content.manage',
    'knowledge_base.manage',
    'exports.run',
  ],
  gestor: [
    'assessments.answer',
    'reports.aggregate.view',
    'reports.individual.view',
    'journey.own.view',
    'journey.team.view',
  ],
  tutor: [
    'assessments.answer',
    'journey.own.view',
    'journey.team.view',
  ],
  colaborador: [
    'assessments.answer',
    'journey.own.view',
    'settings.locale.manage',
  ],
};

export type PermissionOverride = {
  id?: string;
  scope_type: 'role' | 'user';
  scope_key: string;
  permission_key: PermissionKey;
  effect: 'allow' | 'deny';
  reason?: string | null;
  created_by_email?: string | null;
  created_at?: string | null;
};

export function getSystemRole(ctx: Pick<UserContext, 'role' | 'isPlatformAdmin' | 'platformAdminRole'> | null | undefined): SystemRole {
  if (ctx?.isPlatformAdmin) return ctx?.platformAdminRole === 'socio' ? 'socio' : 'platform_admin';
  return (ctx?.role || 'colaborador') as SystemRole;
}

export function hasBasePermission(role: SystemRole, permission: PermissionKey): boolean {
  return BASE_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canBase(ctx: Pick<UserContext, 'role' | 'isPlatformAdmin'> | null | undefined, permission: PermissionKey): boolean {
  return hasBasePermission(getSystemRole(ctx), permission);
}

export async function loadPermissionOverrides(scopeKeys: string[]): Promise<PermissionOverride[]> {
  const keys = scopeKeys.filter(Boolean);
  if (keys.length === 0) return [];

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('permission_overrides')
    .select('id, scope_type, scope_key, permission_key, effect, reason, created_by_email, created_at')
    .in('scope_key', keys);

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('permission_overrides') || msg.includes('does not exist')) return [];
    throw error;
  }

  return (data || []) as PermissionOverride[];
}

export async function getEffectivePermissionKeys(
  ctx: (Pick<UserContext, 'role' | 'isPlatformAdmin'> & { email?: string | null }) | null | undefined,
): Promise<Set<PermissionKey>> {
  const role = getSystemRole(ctx);
  const allowed = new Set<PermissionKey>(BASE_ROLE_PERMISSIONS[role] || []);
  const overrides = await loadPermissionOverrides([`role:${role}`, ctx?.email ? `user:${ctx.email.toLowerCase()}` : '']);

  for (const override of overrides) {
    if (override.effect === 'allow') allowed.add(override.permission_key);
    if (override.effect === 'deny') allowed.delete(override.permission_key);
  }

  return allowed;
}

export async function can(
  ctx: (Pick<UserContext, 'role' | 'isPlatformAdmin'> & { email?: string | null }) | null | undefined,
  permission: PermissionKey,
): Promise<boolean> {
  return (await getEffectivePermissionKeys(ctx)).has(permission);
}

export function groupPermissionsByDomain() {
  return PERMISSIONS.reduce<Record<string, PermissionDefinition[]>>((acc, permission) => {
    if (!acc[permission.domain]) acc[permission.domain] = [];
    acc[permission.domain].push(permission);
    return acc;
  }, {});
}
