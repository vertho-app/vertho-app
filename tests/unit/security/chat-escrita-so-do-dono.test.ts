import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../../helpers/mock-request';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Análise de segurança de 05/10/2026 — `/api/chat` escreve (mensagens, sessão,
 * fechamento da avaliação) mas só conferia `assertColabAccess`, a régua de LEITURA:
 * gestor e RH do tenant passam. Gestão conduzia o diagnóstico do liderado e o fechava
 * no lugar dele. Decisão de 16/07: gestão e RH acompanham, mas não escrevem na
 * jornada. O R-72 cobriu só as rotas `temporada/*`.
 */

const EMPRESA = 'emp-1';
const LIDERADO = 'colab-liderado';
const GESTOR = 'colab-gestor';

const sb = criarSupabaseMock({ resolver: () => null });
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null }, heavyLimiter: { check: async () => null } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: async () => ({}) }));
vi.mock('@/lib/access-gates', () => ({
  canAccessMapeamentoCenarios: () => ({ allowed: true }),
  gateDiagnosticoDaPessoa: async () => ({ allowed: true }),
}));
vi.mock('@/lib/versioning', () => ({ getOrCreatePromptVersion: async () => 'pv-1' }));
let auth: any;
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => auth,
  assertTenantAccess: () => null,
  assertColabAccess: async () => null, // a régua de LEITURA deixa passar: é o que o teste exerce
}));
const callAIChat = vi.fn(async () => 'resposta');
vi.mock('@/actions/ai-client', () => ({ callAIChat, callAI: async () => '' }));

const { POST } = await import('@/app/api/chat/route');

const pedir = () => POST(mockPOST('http://localhost:3000/api/chat', {
  empresaId: EMPRESA, colaboradorId: LIDERADO, competenciaId: 'comp-1',
  mensagem: 'esta é a minha resposta ao cenário proposto',
}));
const escritas = () => sb.escritas.filter((e) => e.op !== 'select');

beforeEach(() => {
  sb.reset();
  callAIChat.mockClear();
});

describe('/api/chat: escrita na jornada é só do dono', () => {
  it.each(['gestor', 'rh'])('🔴 %s do tenant conduzindo a conversa do liderado: 403, nada gravado, IA não chamada', async (role) => {
    auth = { email: 'g@a.com', empresaId: EMPRESA, colaborador: { id: GESTOR }, role, isPlatformAdmin: false };
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/Só a própria pessoa/);
    expect(escritas()).toHaveLength(0);
    expect(callAIChat).not.toHaveBeenCalled();
  });

  it('o dono passa pela trava (segue para as demais validações, que aqui devolvem 404 de competência)', async () => {
    auth = { email: 'l@a.com', empresaId: EMPRESA, colaborador: { id: LIDERADO }, role: 'colaborador', isPlatformAdmin: false };
    const r = await pedir();
    expect(r.status).not.toBe(403);
  });

  it('platform admin segue como exceção (a mesma de assertColabAccess)', async () => {
    auth = { email: 'adm@vertho.ai', empresaId: EMPRESA, colaborador: { id: 'x' }, role: 'rh', isPlatformAdmin: true };
    const r = await pedir();
    expect(r.status).not.toBe(403);
  });
});
