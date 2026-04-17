import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest, mockPOST } from '../../helpers/mock-request';

// Mock Supabase ANTES do import
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
        order: () => ({ data: [], error: null }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

// Mock CSRF pra aceitar localhost
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf');
  return actual;
});

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { check: () => null },
  heavyLimiter: { check: () => null },
}));

// Mock auth - controla via variável
let mockAuthResult: any = null;
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => mockAuthResult,
  requireRole: async () => mockAuthResult,
  requireAdmin: async () => mockAuthResult,
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
  assertEmailAccess: async () => null,
}));

describe('GET /api/colaboradores — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { GET } = await import('@/app/api/colaboradores/route');
    const req = mockRequest('http://localhost:3000/api/colaboradores?empresa_id=e1');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('retorna 403 quando colaborador tenta acessar (exige gestor/rh/admin)', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'acesso negado' }, { status: 403 });

    const { GET } = await import('@/app/api/colaboradores/route');
    const req = mockRequest('http://localhost:3000/api/colaboradores?empresa_id=e1');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/colaboradores — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/colaboradores/route');
    const req = mockPOST('http://localhost:3000/api/colaboradores', { empresa_id: 'e1', nome: 'Test' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
