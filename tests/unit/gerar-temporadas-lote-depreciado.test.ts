import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-E4 do docs/FMEA-PIPELINE.md — `gerarTemporadasLote` rodava N gerações de
 * temporada (~6 chamadas de IA cada) em loop serial dentro de UMA server
 * action → 504 no maxDuration da Vercel. O lote síncrono virou um stub gated
 * que RECUSA e aponta o padrão vigente (fila + loop no client:
 * `listarColabsParaTrilha` + `gerarTemporada`, ramo 'temporadas' de
 * app/admin/empresas/[empresaId]/page.tsx — mesmo padrão de filaBlueprint).
 *
 * Validação por mutação: reintroduzir trabalho inline no stub (ex.: chamar
 * `requireAdminSupabase`/`gerarTemporada` no corpo) derruba o 1º teste;
 * remover o `assertTenantAccessAction` derruba o 2º.
 */

const h = vi.hoisted(() => ({
  calls: { tenant: [] as any[], adminSb: 0, ai: 0, audit: 0 },
}));

vi.mock('@/lib/auth/protected-action', () => ({
  DomainError: class DomainError extends Error {
    codigo?: string;
    constructor(m: string, c?: string) { super(m); this.codigo = c; }
  },
  protectedAction: (_perm: any, schema: any, fn: any) => async (raw: any) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Dados inválidos', code: 'VALIDATION' };
    try {
      return { success: true, data: await fn({ email: 'admin@test.com' }, parsed.data) };
    } catch (e: any) {
      return { success: false, error: String(e?.message ?? e) };
    }
  },
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => ({}),
  requireUserAction: async () => ({}),
  getAuthenticatedEmailFromAction: async () => null,
  assertTenantAccessAction: async (_ctx: any, empresaId: string) => { h.calls.tenant.push(empresaId); },
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => { h.calls.adminSb++; throw new Error('não deveria tocar no banco'); },
  requireEmpresaSupabase: async () => { h.calls.adminSb++; throw new Error('não deveria tocar no banco'); },
}));
vi.mock('@/actions/ai-client', () => ({ callAI: async () => { h.calls.ai++; return ''; } }));
vi.mock('@/lib/audit', () => ({ logAdminAction: async () => { h.calls.audit++; } }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: async () => null,
  canViewColabJourney: async () => false,
}));
vi.mock('@/lib/repositories/trilhas-repo', () => ({
  findTrilhaComTenant: async () => null,
  updateTrilhaInTenant: async () => null,
  updateSemanaProgressoInTenant: async () => 0,
}));

describe('gerarTemporadasLote · loop síncrono descontinuado (F-E4)', () => {
  beforeEach(() => { h.calls = { tenant: [], adminSb: 0, ai: 0, audit: 0 }; });

  it('recusa o lote inline: success:false, sem banco, sem IA, sem audit', async () => {
    const { gerarTemporadasLote } = await import('@/actions/temporadas');
    const r: any = await gerarTemporadasLote('e1');
    expect(r.success).toBe(false);
    expect(r.error).toContain('descontinuado');
    expect(r.error).toContain('listarColabsParaTrilha');
    expect(h.calls.adminSb).toBe(0);
    expect(h.calls.ai).toBe(0);
    expect(h.calls.audit).toBe(0); // nada aconteceu → nada a auditar
  });

  it('o gate de tenant continua valendo (defesa em profundidade)', async () => {
    const { gerarTemporadasLote } = await import('@/actions/temporadas');
    await gerarTemporadasLote('e1');
    expect(h.calls.tenant).toEqual(['e1']);
  });

  it('montarTrilhasLote (wrapper depreciado da fase4) também recusa, sem banco', async () => {
    const { montarTrilhasLote } = await import('@/actions/fase4');
    const r: any = await montarTrilhasLote('e1');
    expect(r.success).toBe(false);
    expect(r.error).toContain('descontinuado');
    expect(h.calls.adminSb).toBe(0);
    expect(h.calls.ai).toBe(0);
  });
});
