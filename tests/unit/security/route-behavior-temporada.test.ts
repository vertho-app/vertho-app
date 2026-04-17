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
          order: () => ({ data: [], error: null }),
          not: () => ({ data: [], error: null }),
        }),
        order: () => ({ data: [], error: null }),
      }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

// CSRF real
vi.mock('@/lib/csrf', async () => {
  const actual = await vi.importActual('@/lib/csrf');
  return actual;
});

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { check: () => null },
  heavyLimiter: { check: () => null },
}));

// Mock AI client
vi.mock('@/actions/ai-client', () => ({
  callAIChat: async () => 'mock response',
  callAI: async () => 'mock response',
}));

// Mock PII masker
vi.mock('@/lib/pii-masker', () => ({
  maskColaborador: (c: any) => ({ masked: { nome: 'ALIAS_1' }, map: {} }),
  maskTextPII: (t: string) => t,
  unmaskPII: (t: string) => t,
}));

// Mock RAG
vi.mock('@/lib/rag', () => ({
  retrieveContext: async () => [],
  formatGroundingBlock: () => '',
}));

// Mock season engine prompts
vi.mock('@/lib/season-engine/prompts/tira-duvidas', () => ({
  promptTiraDuvidas: () => ({ system: 'sys', messages: [{ role: 'user', content: 'test' }] }),
}));

// Mock week gating
vi.mock('@/lib/season-engine/week-gating', () => ({
  semanaLiberadaPorData: () => true,
  formatarLiberacao: () => '2026-01-01',
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

describe('POST /api/temporada/tira-duvidas — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
  });

  it('retorna 401 sem autenticação', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });

    const { POST } = await import('@/app/api/temporada/tira-duvidas/route');
    const req = mockPOST('http://localhost:3000/api/temporada/tira-duvidas', {
      trilhaId: 't1',
      semana: 1,
      message: 'teste',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('retorna 400 ou 404 (não 401) quando autenticado mas sem trilhaId', async () => {
    mockAuthResult = {
      email: 'test@test.com',
      colaborador: { id: 'c1', empresa_id: 'e1', area_depto: 'TI' },
      role: 'colaborador',
      empresaId: 'e1',
      isPlatformAdmin: false,
    };

    const { POST } = await import('@/app/api/temporada/tira-duvidas/route');
    const req = mockPOST('http://localhost:3000/api/temporada/tira-duvidas', {
      semana: 1,
      message: 'teste',
    });
    const res = await POST(req);
    // Sem trilhaId → 400 (campos obrigatórios) — NÃO deve ser 401
    expect(res.status).not.toBe(401);
    expect([400, 404]).toContain(res.status);
  });
});
