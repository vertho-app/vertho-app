import { headers, cookies } from 'next/headers';
import { createSupabaseAdmin } from './supabase';
import { resolveTenant } from './tenant-resolver';
import type { Colaborador, UserContext, Role } from '@/types';

// ── Helper central: busca colaborador por email, respeitando o tenant ──────
// Usado por todas as dashboard actions para evitar .single() quebrando quando
// o mesmo email existe em múltiplas empresas (cenário legítimo em multi-tenant).
export async function findColabByEmail(
  email: string | null | undefined,
  selectCols: string = 'id, nome_completo, email, cargo, area_depto, empresa_id, role, perfil_dominante, tutorados_ids',
): Promise<Colaborador | null> {
  if (!email) return null;

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  // Resolve o slug do tenant — primeiro do cookie (sempre presente em
  // server actions), depois do header (presente em Server Components).
  let slug: string | null = null;
  try {
    const c = await cookies();
    slug = c.get('vertho-tenant-slug')?.value || null;
  } catch {}
  if (!slug) {
    try {
      const h = await headers();
      slug = h.get('x-tenant-slug') || null;
    } catch {}
  }

  let tenantEmpresaId: string | null = null;
  if (slug) {
    const tenant = await resolveTenant(slug);
    if (tenant?.id) tenantEmpresaId = tenant.id;
  }

  if (tenantEmpresaId) {
    // Tenant resolvido → escopo exato, sem ambiguidade.
    const { data } = await sb.from('colaboradores')
      .select(selectCols)
      .eq('email', normalizedEmail)
      .eq('empresa_id', tenantEmpresaId)
      .limit(1);
    return (data?.[0] as unknown as Colaborador) || null;
  }

  // Sem tenant resolvido (apex, ou slug que não resolve): NÃO escolhemos um
  // colaborador arbitrário. Se o email existe em >1 empresa, é ambíguo —
  // resolver para o tenant errado governaria todos os assertTenantAccess.
  // Fail-closed: só retorna se houver exatamente 1 correspondência.
  const { data } = await sb.from('colaboradores')
    .select(selectCols)
    .eq('email', normalizedEmail)
    .limit(2);
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.warn('[authz] email ambíguo (multi-tenant) sem tenant resolvido — fail-closed:', normalizedEmail);
    return null;
  }
  return data[0] as unknown as Colaborador;
}

/**
 * Camada central de autorização — RBAC explícito.
 *
 * Papéis por tenant (coluna `role` em `colaboradores`):
 *   - colaborador: visão individual (PDI, trilha, assessment)
 *   - gestor: visão da equipe por area_depto
 *   - rh: visão agregada da empresa inteira
 *
 * Papel global (tabela `platform_admins`):
 *   - admin_plataforma: acesso ao painel /admin
 */

export async function getUserContext(email: string | null | undefined): Promise<UserContext | null> {
  if (!email) return null;

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  const colab = await findColabByEmail(email);

  const { data: admin } = await sb.from('platform_admins')
    .select('id, role')
    .eq('email', normalizedEmail)
    .maybeSingle();

  return {
    colaborador: colab,
    role: (colab?.role as Role) || 'colaborador',
    empresaId: colab?.empresa_id || null,
    isPlatformAdmin: !!admin,
    // 'socio' só quando a coluna disser; qualquer outro valor (ou null) = master.
    platformAdminRole: admin ? ((admin as any).role === 'socio' ? 'socio' : 'master') : null,
  };
}

export async function isPlatformAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('platform_admins')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single();
  return !!data;
}

// ── Role checks (a partir do contexto) ──────────────────────────────────────

export function isColaborador(ctx: UserContext | null | undefined): boolean { return ctx?.role === 'colaborador'; }
export function isGestor(ctx: UserContext | null | undefined): boolean      { return ctx?.role === 'gestor'; }
export function isRH(ctx: UserContext | null | undefined): boolean          { return ctx?.role === 'rh'; }
export function isTutor(ctx: UserContext | null | undefined): boolean       { return ctx?.role === 'tutor'; }

/** Tutor escopo = ids dos colaboradores que ele acompanha. Vazio = sem escopo. */
export function getTutorados(ctx: UserContext | null | undefined): string[] {
  return (ctx?.colaborador as any)?.tutorados_ids || [];
}

export function canAccessAdmin(ctx: UserContext | null | undefined): boolean {
  return ctx?.isPlatformAdmin === true;
}

export function canViewCompanyWideKPIs(ctx: UserContext | null | undefined): boolean {
  return ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

export function canViewAreaTeam(ctx: UserContext | null | undefined): boolean {
  // Tutor não vê equipe inteira — apenas seus tutorados (escopo restrito).
  return ctx?.role === 'gestor' || ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

/** Tutor pode acessar dados do colaborador X se X ∈ tutorados_ids do tutor. */
export function canTutorAccess(ctx: UserContext | null | undefined, colaboradorId: string): boolean {
  if (!ctx || ctx.role !== 'tutor') return false;
  return getTutorados(ctx).includes(colaboradorId);
}

export function canViewOwnJourney(ctx: UserContext | null | undefined): boolean {
  return !!ctx?.colaborador;
}

/**
 * Quem pode ver a JORNADA de `colab` (temporada, progresso, transcripts): o
 * PRÓPRIO, o RH do mesmo tenant, o gestor da mesma área, o tutor de quem ele
 * tutora, ou o platform admin. Cross-tenant nunca — exceto platform admin.
 *
 * Existe porque `'use server'` torna todo export um endpoint HTTP e o id do
 * colaborador vem do CLIENTE: um gate que só exige sessão (`requireUserAction`)
 * deixa qualquer autenticado pedir a jornada de qualquer pessoa de qualquer
 * tenant. Ter a regra em UM lugar evita que cada action a reinvente — e divirja.
 *
 * Cuidado ao usar: passe o `colab` LIDO DO BANCO, nunca dados vindos do cliente.
 */
export function canViewColabJourney(
  ctx: UserContext | null | undefined,
  colab: { id: string; empresa_id?: string | null; area_depto?: string | null } | null | undefined,
): boolean {
  if (!ctx || !colab?.id) return false;
  if (ctx.isPlatformAdmin) return true;
  if (ctx.colaborador?.id === colab.id) return true;

  // Daqui pra baixo é dado de OUTRA pessoa: exige mesmo tenant, sempre.
  if (!ctx.empresaId || !colab.empresa_id || ctx.empresaId !== colab.empresa_id) return false;

  if (ctx.role === 'rh') return true;
  if (ctx.role === 'gestor') {
    const areaGestor = ctx.colaborador?.area_depto;
    return !!areaGestor && !!colab.area_depto && colab.area_depto === areaGestor;
  }
  if (ctx.role === 'tutor') return canTutorAccess(ctx, colab.id);
  return false;
}

export type DashboardView = 'rh' | 'gestor' | 'tutor' | 'colaborador';

export function getDashboardView(ctx: UserContext | null | undefined): DashboardView {
  if (!ctx) return 'colaborador';
  if (ctx.role === 'rh') return 'rh';
  if (ctx.role === 'gestor') return 'gestor';
  if (ctx.role === 'tutor') return 'tutor';
  // admin_plataforma sem vínculo de colaborador → visão rh
  if (ctx.isPlatformAdmin && !ctx.colaborador) return 'rh';
  return (ctx.role as DashboardView) || 'colaborador';
}
