import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest, mockPOST } from '../../helpers/mock-request';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
        order: () => ({ data: [], error: null }),
        not: () => ({ data: [], error: null }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

// CSRF real — queremos testar o comportamento real do csrfCheck
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf');
  return actual;
});

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { check: () => null },
  heavyLimiter: { check: () => null },
}));

// Auth controlável via variável
let mockAuthResult: any = null;
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => mockAuthResult,
  requireRole: async () => mockAuthResult,
  requireAdmin: async () => mockAuthResult,
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
  assertEmailAccess: async () => null,
}));

describe('GET /api/assessment — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { GET } = await import('@/app/api/assessment/route');
    const req = mockRequest('http://localhost:3000/api/assessment');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/assessment — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/assessment/route');
    const req = mockPOST('http://localhost:3000/api/assessment', {
      cenario_id: 'c1',
      competencia_id: 'comp1',
      r1: 'a',
      r2: 'b',
      r3: 'c',
      r4: 'd',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 403 com origin malicioso (CSRF bloqueia antes do auth)', async () => {
    // csrfCheck roda ANTES de requireUser no POST handler
    // Com origin malicioso e sem Bearer, deve bloquear com 403
    const { POST } = await import('@/app/api/assessment/route');
    const req = mockPOST(
      'http://localhost:3000/api/assessment',
      { cenario_id: 'c1', competencia_id: 'comp1', r1: 'a' },
      { origin: 'https://evil.com' },
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('Bearer explícito bypassa CSRF (não bloqueia por origin)', async () => {
    // Com Authorization: Bearer, csrfCheck deve skippar
    // Vai cair no requireUser que retorna 401 (mockado como null → Response 401)
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/assessment/route');
    const req = mockPOST(
      'http://localhost:3000/api/assessment',
      { cenario_id: 'c1', competencia_id: 'comp1', r1: 'a' },
      { authorization: 'Bearer fake-token', origin: '' },
    );
    const res = await POST(req);
    // Deve retornar 401 do requireUser, NÃO 403 do CSRF
    expect(res.status).toBe(401);
  });
});
