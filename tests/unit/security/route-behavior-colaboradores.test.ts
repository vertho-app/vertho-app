import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockRequest, mockPOST } from '../../helpers/mock-request';

const exclusao = vi.hoisted(() => ({
  prever: vi.fn(),
  excluir: vi.fn(),
}));
vi.mock('@/lib/simulador-vendas/exclusao', () => ({
  preverExclusaoPace: exclusao.prever,
  excluirCadastroComBackupPace: exclusao.excluir,
}));

const EMPRESA = '10000000-0000-4000-8000-000000000001';
const COLAB = '20000000-0000-4000-8000-000000000002';
const CONFIRMACAO = 'a'.repeat(64);

// Mock Supabase ANTES do import
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: { empresa_id: EMPRESA }, error: null }),
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
let mockTenantGuard: Response | null = null;
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => mockAuthResult,
  requireRole: async () => mockAuthResult,
  requireAdmin: async () => mockAuthResult,
  assertTenantAccess: () => mockTenantGuard,
  assertColabAccess: async () => null,
  assertEmailAccess: async () => null,
}));

describe('GET /api/colaboradores — comportamento real', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuthResult = null;
    mockTenantGuard = null;
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
    mockTenantGuard = null;
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

describe('DELETE /api/colaboradores — confirmação PACE vinculada ao tenant autenticado', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockTenantGuard = null;
    mockAuthResult = { email: 'rh@empresa.test', role: 'rh', empresaId: EMPRESA, isPlatformAdmin: false };
    exclusao.prever.mockResolvedValue({ confirmacao: CONFIRMACAO, sessoes: 2, tentativas: 5, backupDias: 7 });
    exclusao.excluir.mockResolvedValue({ id: COLAB, nome_completo: 'Pessoa' });
  });

  it('sem autenticação não consulta nem exclui', async () => {
    const { NextResponse } = await import('next/server');
    mockAuthResult = NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    const { DELETE } = await import('@/app/api/colaboradores/route');
    const res = await DELETE(mockRequest(`http://localhost:3000/api/colaboradores?id=${COLAB}`, { method: 'DELETE' }));
    expect(res.status).toBe(401);
    expect(exclusao.prever).not.toHaveBeenCalled();
    expect(exclusao.excluir).not.toHaveBeenCalled();
  });

  it('tenant divergente é barrado antes da prévia', async () => {
    const { NextResponse } = await import('next/server');
    mockTenantGuard = NextResponse.json({ error: 'sem acesso' }, { status: 403 });
    const { DELETE } = await import('@/app/api/colaboradores/route');
    const res = await DELETE(mockRequest(`http://localhost:3000/api/colaboradores?id=${COLAB}`, { method: 'DELETE' }));
    expect(res.status).toBe(403);
    expect(exclusao.prever).not.toHaveBeenCalled();
    expect(exclusao.excluir).not.toHaveBeenCalled();
  });

  it('primeiro pedido devolve apenas a prévia e não muta', async () => {
    const { DELETE } = await import('@/app/api/colaboradores/route');
    const res = await DELETE(mockRequest(`http://localhost:3000/api/colaboradores?id=${COLAB}`, { method: 'DELETE' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ previa: { confirmacao: CONFIRMACAO, sessoes: 2, tentativas: 5, backupDias: 7 } });
    expect(exclusao.prever).toHaveBeenCalledWith(EMPRESA, { tipo: 'colaborador', id: COLAB });
    expect(exclusao.excluir).not.toHaveBeenCalled();
  });

  it('confirmação é executada com tenant e autor derivados no servidor', async () => {
    const { DELETE } = await import('@/app/api/colaboradores/route');
    const res = await DELETE(mockRequest(`http://localhost:3000/api/colaboradores?id=${COLAB}`, {
      method: 'DELETE', headers: { 'x-confirmacao-exclusao-pace': CONFIRMACAO },
    }));
    expect(res.status).toBe(200);
    expect(exclusao.excluir).toHaveBeenCalledWith(
      EMPRESA, { tipo: 'colaborador', id: COLAB }, CONFIRMACAO, 'rh@empresa.test',
    );
  });
});
