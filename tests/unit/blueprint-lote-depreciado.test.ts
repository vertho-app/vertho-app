import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-E4 (ressalva fechada em 28/07) — `gerarBlueprintsLote`/`auditarBlueprintsLote`
 * rodavam N chamadas de IA em loop serial dentro de UMA server action: estouram o
 * maxDuration de 300s da Vercel e morrem 504 no meio, sem retomada. Viraram stubs
 * gated que RECUSAM e apontam o caminho vigente — que já era o da tela desde antes
 * (`filaBlueprint`/`filaAuditBlueprint` + uma action por colaborador no cliente, com
 * progresso e cancelamento). Nenhum dos dois tinha caller.
 *
 * O que estes testes protegem: que o stub não volte a fazer trabalho. Se alguém
 * reintroduzir IA/banco no corpo, os contadores abaixo saem de zero.
 */
const h = vi.hoisted(() => ({ calls: { gate: 0, adminSb: 0, tenantDb: 0, core: 0 } }));

vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => { h.calls.gate++; return { email: 'admin@test.com' }; },
  getAuthenticatedEmailFromAction: async () => 'admin@test.com',
}));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => { h.calls.adminSb++; return {} as any; },
}));
vi.mock('@/lib/tenant-db', () => ({
  tenantDb: () => { h.calls.tenantDb++; return { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } as any; },
}));
vi.mock('@/lib/blueprint/core', () => ({
  gerarBlueprintCore: async () => { h.calls.core++; return { ok: true }; },
  resolverFilaBlueprint100: async () => { h.calls.core++; return []; },
}));
vi.mock('@/lib/blueprint/audit', () => ({
  auditarBlueprintCore: async () => { h.calls.core++; return { ok: true, relatorio: {} }; },
}));

beforeEach(() => { h.calls = { gate: 0, adminSb: 0, tenantDb: 0, core: 0 }; });

describe('F-E4 · lotes síncronos de blueprint estão depreciados', () => {
  it('gerarBlueprintsLote recusa sem tocar em IA nem banco', async () => {
    const { gerarBlueprintsLote } = await import('@/actions/blueprint');
    const r = await gerarBlueprintsLote('e1');

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/DEPRECIAD[AO]/);
    // 🔑 A saída que a mensagem aponta tem de ser um caminho VIVO.
    //
    // Até 24/08 este teste exigia `filaBlueprint` — e o C1b removeu justamente
    // esse caminho. Uma mensagem de depreciação que manda para outro caminho
    // morto é pior que nenhuma: ensina o errado com autoridade. Por isso a
    // asserção acompanha a saída atual em vez de ser afrouxada.
    expect(r.error).toMatch(/enqueueBlueprintBatch/);
    expect(h.calls.core).toBe(0);                      // nenhuma chamada de IA
    expect(h.calls.adminSb).toBe(0);                   // nenhum service-role
    expect(h.calls.tenantDb).toBe(0);                  // nenhum banco
  });

  it('auditarBlueprintsLote idem', async () => {
    const { auditarBlueprintsLote } = await import('@/actions/blueprint');
    const r = await auditarBlueprintsLote('e1');

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/DEPRECIAD[AO]/);
    expect(h.calls.core).toBe(0);
    expect(h.calls.adminSb).toBe(0);
  });

  /**
   * C1b (24/08): a geração síncrona de UM blueprint também virou stub. A tela
   * chamava isto num laço, um colaborador por vez, presa na aba — e com o
   * deadline real do C1 valendo, 277 s medidos contra 300 s de `maxDuration`
   * não sustentam SLA nenhum.
   */
  it('gerarBlueprint (unitário) recusa e aponta a fila assíncrona', async () => {
    const { gerarBlueprint } = await import('@/actions/blueprint');
    const r: any = await gerarBlueprint({ colaboradorId: 'c1' });

    expect(r.ok).toBeFalsy();
    expect(r.error).toMatch(/enqueueBlueprintBatch/);
    expect(h.calls.core).toBe(0);      // não gerou blueprint nenhum
    expect(h.calls.adminSb).toBe(0);   // nem tocou em service-role
  });

  it('filaBlueprint idem — quem monta a fila agora é o servidor', async () => {
    const { filaBlueprint } = await import('@/actions/blueprint');
    const r: any = await filaBlueprint('e1');

    expect(r.success).toBe(false);
    expect(r.error).toMatch(/enqueueBlueprintBatch/);
    expect(h.calls.tenantDb).toBe(0);
  });

  it('o gate CONTINUA sendo aplicado (stub não é porta aberta)', async () => {
    // `'use server'` publica action id: stub sem gate viraria endpoint sem dono.
    const { gerarBlueprintsLote, auditarBlueprintsLote } = await import('@/actions/blueprint');
    await gerarBlueprintsLote('e1');
    await auditarBlueprintsLote('e1');
    expect(h.calls.gate).toBe(2);
  });
});
