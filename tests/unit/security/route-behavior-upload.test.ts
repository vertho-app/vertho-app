import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../../helpers/mock-request';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({ data: null, error: 'mock' }),
      }),
    },
  }),
}));

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { check: () => null },
  heavyLimiter: { check: () => null },
}));

// CSRF real — não mockar
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf');
  return actual;
});

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

describe('POST /api/upload/signed-url — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401/403 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/upload/signed-url/route');
    const req = mockPOST('http://localhost:3000/api/upload/signed-url', {
      formato: 'video',
      filename: 'test.mp4',
    });
    const res = await POST(req);
    expect([401, 403]).toContain(res.status);
  });

  it('retorna 403 quando colaborador sem role rh/admin tenta upload', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'acesso negado' }, { status: 403 });

    const { POST } = await import('@/app/api/upload/signed-url/route');
    const req = mockPOST('http://localhost:3000/api/upload/signed-url', {
      formato: 'video',
      filename: 'test.mp4',
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('passa do gate de auth com admin (400 por body ou 500, mas NÃO 401/403)', async () => {
    mockAuthResult = {
      email: 'admin@vertho.com.br',
      colaborador: { id: 'c1', empresa_id: 'e1', area_depto: 'TI' },
      role: 'admin',
      empresaId: 'e1',
      isPlatformAdmin: true,
    };

    const { POST } = await import('@/app/api/upload/signed-url/route');
    // Envia body válido — deve chegar no storage (que retorna mock error → 500)
    const req = mockPOST('http://localhost:3000/api/upload/signed-url', {
      formato: 'video',
      filename: 'test.mp4',
    });
    const res = await POST(req);
    // Pode dar 500 (storage mock) ou 400 (body inválido), mas nunca 401/403
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
