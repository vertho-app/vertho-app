import { headers } from 'next/headers';
import { createSupabaseAdmin } from './supabase';
import { resolveTenant } from './tenant-resolver';

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

// ── Context loader ──────────────────────────────────────────────────────────

/**
 * Carrega o contexto completo do usuário autenticado.
 * Usado em Server Components e API Routes.
 *
 * @param {string} email - Email do usuário autenticado (via Supabase Auth)
 * @returns {{ colaborador, role, empresaId, isPlatformAdmin }}
 */
export async function getUserContext(email) {
  if (!email) return null;

  const sb = createSupabaseAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  // Resolve o tenant atual a partir do subdomínio (x-tenant-slug injetado no middleware)
  let tenantEmpresaId = null;
  try {
    const h = await headers();
    const slug = h.get('x-tenant-slug');
    if (slug) {
      const tenant = await resolveTenant(slug);
      if (tenant?.id) tenantEmpresaId = tenant.id;
    }
  } catch {
    // headers() fora de contexto de request — cai no fallback sem tenant
  }

  // Buscar colaborador.
  // Com tenant: filtra por empresa_id (o mesmo email pode existir em múltiplas empresas).
  // Sem tenant: pega o primeiro registro encontrado (compatibilidade retroativa).
  let colabQuery = sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, area_depto, empresa_id, role, perfil_dominante')
    .eq('email', normalizedEmail);
  if (tenantEmpresaId) colabQuery = colabQuery.eq('empresa_id', tenantEmpresaId);
  const { data: colabs } = await colabQuery.limit(1);
  const colab = colabs?.[0] || null;

  // Buscar admin de plataforma
  const { data: admin } = await sb.from('platform_admins')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  return {
    colaborador: colab,
    role: colab?.role || 'colaborador',
    empresaId: colab?.empresa_id || null,
    isPlatformAdmin: !!admin,
  };
}

/**
 * Verifica se um email é admin de plataforma.
 * Consulta direta — sem carregar colaborador.
 *
 * @param {string} email
 * @returns {boolean}
 */
export async function isPlatformAdmin(email) {
  if (!email) return false;
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('platform_admins')
    .select('id')
    .eq('email', email.trim().toLowerCase())
    .single();
  return !!data;
}

// ── Role checks (a partir do contexto) ──────────────────────────────────────

export function isColaborador(ctx) { return ctx?.role === 'colaborador'; }
export function isGestor(ctx)      { return ctx?.role === 'gestor'; }
export function isRH(ctx)          { return ctx?.role === 'rh'; }

export function canAccessAdmin(ctx) {
  return ctx?.isPlatformAdmin === true;
}

export function canViewCompanyWideKPIs(ctx) {
  return ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

export function canViewAreaTeam(ctx) {
  return ctx?.role === 'gestor' || ctx?.role === 'rh' || ctx?.isPlatformAdmin === true;
}

export function canViewOwnJourney(ctx) {
  // Todos podem ver sua própria jornada
  return !!ctx?.colaborador;
}

/**
 * Determina qual visão do dashboard renderizar.
 * @returns {'rh' | 'gestor' | 'colaborador'}
 */
export function getDashboardView(ctx) {
  if (!ctx) return 'colaborador';
  if (ctx.role === 'rh') return 'rh';
  if (ctx.role === 'gestor') return 'gestor';
  // admin_plataforma sem vínculo de colaborador → visão rh
  if (ctx.isPlatformAdmin && !ctx.colaborador) return 'rh';
  // admin_plataforma com vínculo → respeita o role do vínculo
  return ctx.role || 'colaborador';
}
