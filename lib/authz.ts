import { headers, cookies } from 'next/headers';
import { createSupabaseAdmin } from './supabase';
import { resolveTenant } from './tenant-resolver';
import type { Colaborador, UserContext, Role } from '@/types';

// ── Helper central: busca colaborador por email, respeitando o tenant ──────
// Usado por todas as dashboard actions para evitar .single() quebrando quando
// o mesmo email existe em múltiplas empresas (cenário legítimo em multi-tenant).
export async function findColabByEmail(
  email: string | null | undefined,
  selectCols: string = 'id, nome_completo, email, cargo, area_depto, empresa_id, role, perfil_dominante',
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

  let q = sb.from('colaboradores').select(selectCols).eq('email', normalizedEmail);
  if (tenantEmpresaId) q = q.eq('empresa_id', tenantEmpresaId);
  const { data } = await q.limit(1);
  return (data?.[0] as unknown as Colaborador) || null;
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
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  return {
    colaborador: colab,
    role: (colab?.role as Role) || 'colaborador',
    empresaId: colab?.empresa_id || null,
    isPlatformAdmin: !!admin,
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

export function canAccessAdmin(ctx: UserContext | null | undefined): boolean {
  return ctx?.isPlatformAdmin === true;
}

export function canViewCompanyWideKPIs(ctx: UserContext | null | undefined): boolean {
  return ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

export function canViewAreaTeam(ctx: UserContext | null | undefined): boolean {
  return ctx?.role === 'gestor' || ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

export function canViewOwnJourney(ctx: UserContext | null | undefined): boolean {
  return !!ctx?.colaborador;
}

export type DashboardView = 'rh' | 'gestor' | 'colaborador';

export function getDashboardView(ctx: UserContext | null | undefined): DashboardView {
  if (!ctx) return 'colaborador';
  if (ctx.role === 'rh') return 'rh';
  if (ctx.role === 'gestor') return 'gestor';
  // admin_plataforma sem vínculo de colaborador → visão rh
  if (ctx.isPlatformAdmin && !ctx.colaborador) return 'rh';
  return (ctx.role as DashboardView) || 'colaborador';
}
