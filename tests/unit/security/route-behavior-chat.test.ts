import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../../helpers/mock-request';

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

// Mock rate limiter pra não interferir
vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { check: () => null },
  heavyLimiter: { check: () => null },
}));

// Mock CSRF pra aceitar localhost
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf');
  return actual;
});

// Mock AI client
vi.mock('@/actions/ai-client', () => ({
  callAIChat: async () => 'mock response',
  callAI: async () => 'mock response',
}));

// Mock versioning
vi.mock('@/lib/versioning', () => ({
  getOrCreatePromptVersion: async () => ({ id: 'v1', prompt: 'test' }),
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

describe('POST /api/chat — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/chat/route');
    const req = mockPOST('http://localhost:3000/api/chat', {
      empresaId: 'e1', colaboradorId: 'c1', competenciaId: 'comp1', mensagem: 'teste mensagem longa suficiente'
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem campos obrigatórios quando autenticado', async () => {
    mockAuthResult = {
      email: 'test@test.com',
      colaborador: { id: 'c1', empresa_id: 'e1', area_depto: 'TI' },
      role: 'colaborador',
      empresaId: 'e1',
      isPlatformAdmin: false,
    };

    const { POST } = await import('@/app/api/chat/route');
    const req = mockPOST('http://localhost:3000/api/chat', {});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
