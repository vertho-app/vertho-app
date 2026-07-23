import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest } from '../../helpers/mock-request';

/**
 * Regressão (auditoria 23/07, grupo E — achado já coberto pelo fix 51c106a3):
 * GET /api/capacitacao-recomendada NÃO pode devolver micro_conteudos de todos
 * os tenants quando empresa_id é omitido, nem aceitar empresa_id de outro
 * tenant, nem injeção no filtro PostgREST `.or`.
 *
 * O fix: tenant derivado da SESSÃO quando o param é omitido (platform admin
 * sem empresa → só conteúdo global), assertTenantAccess quando presente, e
 * trava de formato UUID antes de interpolar no filtro.
 */

const EMP_A = '11111111-1111-1111-1111-111111111111';
const EMP_B = '22222222-2222-2222-2222-222222222222';

const captured: { or?: string; is?: [string, any] } = {};

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => {
      const b: any = {
        select: () => b, eq: () => b, order: () => b, limit: () => b,
        or: (f: string) => { captured.or = f; return b; },
        is: (c: string, v: any) => { captured.is = [c, v]; return b; },
        then: undefined, // await no builder devolve o próprio objeto (data/error undefined)
      };
      return b;
    },
  }),
}));

let mockAuth: any = null;
vi.mock('@/lib/auth/request-context', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    requireUser: async () => mockAuth,
    // assertTenantAccess REAL — é ele que barra o cross-tenant.
  };
});

describe('GET /api/capacitacao-recomendada — escopo de tenant', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuth = null;
    captured.or = undefined;
    captured.is = undefined;
  });

  async function get(url: string) {
    const { GET } = await import('@/app/api/capacitacao-recomendada/route');
    return GET(mockRequest(url) as any);
  }

  it('401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuth = NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    const res = await get('http://localhost/api/capacitacao-recomendada?competencia=X');
    expect(res.status).toBe(401);
  });

  it('empresa_id de OUTRO tenant → 403', async () => {
    mockAuth = { email: 'a@x.com', empresaId: EMP_A, isPlatformAdmin: false };
    const res = await get(`http://localhost/api/capacitacao-recomendada?competencia=X&empresa_id=${EMP_B}`);
    expect(res.status).toBe(403);
  });

  it('sem empresa_id → escopa pelo tenant da SESSÃO + global (nunca todos os tenants)', async () => {
    mockAuth = { email: 'a@x.com', empresaId: EMP_A, isPlatformAdmin: false };
    const res = await get('http://localhost/api/capacitacao-recomendada?competencia=X');
    expect(res.status).toBe(200);
    expect(captured.or).toBe(`empresa_id.eq.${EMP_A},empresa_id.is.null`);
    expect(captured.is).toBeUndefined();
  });

  it('platform admin sem empresa_id → SÓ conteúdo global (empresa_id IS NULL)', async () => {
    mockAuth = { email: 'admin@vertho.ai', empresaId: null, isPlatformAdmin: true };
    const res = await get('http://localhost/api/capacitacao-recomendada?competencia=X');
    expect(res.status).toBe(200);
    expect(captured.is).toEqual(['empresa_id', null]);
    expect(captured.or).toBeUndefined();
  });

  it('empresa_id com formato inválido → 400 (trava contra injeção no filtro .or)', async () => {
    mockAuth = { email: 'admin@vertho.ai', empresaId: null, isPlatformAdmin: true };
    const res = await get('http://localhost/api/capacitacao-recomendada?competencia=X&empresa_id=x,empresa_id.is.null');
    expect(res.status).toBe(400);
  });
});
