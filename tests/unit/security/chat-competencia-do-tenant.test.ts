import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { mockPOST } from '../../helpers/mock-request';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * Análise de segurança de 05/10/2026 — `/api/chat` lia `competencias` com
 * service-role e SEM filtro de empresa, pelo `competenciaId` que vem do CLIENTE.
 * Um colaborador do tenant A informando o UUID de uma competência do tenant B
 * abria sessão com ela: nome, régua e gabarito de B entravam no prompt do
 * avaliador e o feedback voltava ao cliente.
 *
 * Aqui o cliente "cru" (service-role, sem escopo) ENXERGA a competência de B e o
 * cliente escopado (`tenantDb`, o que injeta `empresa_id`) NÃO. Se a rota ler pelo
 * cru, a sessão abre; lendo pelo escopado, é 404 e nada é criado.
 */

const EMPRESA = 'emp-A';
const COLAB = 'colab-1';
const COMPETENCIA_DE_B = 'comp-de-B';

const cru = criarSupabaseMock({
  resolver: (tabela: string) => (
    tabela === 'competencias'
      ? { nome: 'Competência do tenant B', descricao: 'régua de B', gabarito: { n4: 'segredo de B' }, cod_comp: 'B1' }
      : null
  ),
});
const escopado = criarSupabaseMock({ resolver: () => null });

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => cru.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => escopado.client }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null }, heavyLimiter: { check: async () => null } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: async () => ({}) }));
vi.mock('@/lib/access-gates', () => ({
  canAccessMapeamentoCenarios: () => ({ allowed: true }),
  gateDiagnosticoDaPessoa: async () => ({ allowed: true }),
}));
vi.mock('@/lib/versioning', () => ({ getOrCreatePromptVersion: async () => 'pv-1' }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'c@a.com', empresaId: EMPRESA, colaborador: { id: COLAB }, role: 'colaborador' }),
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
}));
const callAIChat = vi.fn(async () => 'nunca deveria chamar a IA');
vi.mock('@/actions/ai-client', () => ({ callAIChat, callAI: async () => '' }));

const { POST } = await import('@/app/api/chat/route');

beforeEach(() => {
  cru.reset();
  escopado.reset();
  callAIChat.mockClear();
});

describe('/api/chat: a competência pedida pelo cliente tem que ser do tenant da sessão', () => {
  it('🔴 competência de outra empresa: 404, nenhuma sessão criada, a IA não é chamada', async () => {
    const res = await POST(mockPOST('http://localhost:3000/api/chat', {
      empresaId: EMPRESA, colaboradorId: COLAB, competenciaId: COMPETENCIA_DE_B,
      mensagem: 'esta é a minha resposta ao cenário proposto',
    }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Competência não encontrada/);
    const criou = [...cru.escritas, ...escopado.escritas].filter((e) => e.tabela === 'sessoes_avaliacao' && e.op === 'insert');
    expect(criou).toHaveLength(0);
    expect(callAIChat).not.toHaveBeenCalled();
  });

  it('🔴 a leitura de `competencias` vai pelo cliente escopado, nunca pelo service-role cru', async () => {
    await POST(mockPOST('http://localhost:3000/api/chat', {
      empresaId: EMPRESA, colaboradorId: COLAB, competenciaId: COMPETENCIA_DE_B,
      mensagem: 'esta é a minha resposta ao cenário proposto',
    }));
    expect(escopado.chamadas.some((c) => c.tabela === 'competencias')).toBe(true);
    expect(cru.chamadas.some((c) => c.tabela === 'competencias')).toBe(false);
  });

  it('o arquivo não volta a ler `competencias` pelo cliente cru (as duas leituras)', () => {
    const src = readFileSync('app/api/chat/route.ts', 'utf8');
    expect(src).not.toMatch(/\bsb\.from\('competencias'\)/);
    expect(src.match(/tdb\.from\('competencias'\)/g) ?? []).toHaveLength(2);
  });
});
