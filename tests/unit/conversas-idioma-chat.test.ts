import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../helpers/mock-request';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda E (04/10/2026): a conversa do mapeamento (`conversa_fase3`, rota `/api/chat`) é com a PESSOA, e o
 * `callAIChat` recebe o idioma dela como opção EXPLÍCITA: `colaboradores.locale`, senão `empresas.default_locale`,
 * senão pt-BR. Sem a opção o wrapper lia o cookie `vertho-locale`, que o login por senha nem sempre grava (a mesma
 * lacuna que o R-68 fechou no Beto).
 *
 * A avaliação final (`chat_fase3_eval`) e a auditoria (`chat_fase3_audit`) NÃO recebem idioma: são JSON de nota
 * que o código consolida por NOME de descritor, e traduzir o nome desfaria o casamento.
 */

const SESSAO = 'sess-1';
const EMPRESA = 'emp-1';
const COLAB = 'colab-1';
const COMPETENCIA = 'comp-1';

const h = vi.hoisted(() => ({
  localePessoa: null as string | null,
  chat: [] as any[],
  ai: [] as any[],
}));

const sb = criarSupabaseMock({
  resolver: (tabela: string, cols: string) => {
    if (tabela === 'sessoes_avaliacao') {
      return {
        id: SESSAO, empresa_id: EMPRESA, colaborador_id: COLAB, competencia_id: COMPETENCIA,
        status: 'em_andamento', fase: 'cenario', confianca: 20, aprofundamentos: 0,
        evidencias: [], cenario_id: null,
      };
    }
    if (tabela === 'competencias') return { nome: 'Comunicação', descricao: 'd', gabarito: {}, cod_comp: 'C1', versao_regua: 1 };
    if (tabela === 'empresas') return { nome: 'ACME', sys_config: {} };
    if (tabela === 'colaboradores' && cols === 'locale') return { locale: h.localePessoa };
    return null;
  },
  lista: () => [],
});

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
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'c@a.com', empresaId: EMPRESA, colaborador: { id: COLAB }, role: 'colaborador' }),
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
}));
vi.mock('@/actions/ai-client', () => ({
  callAIChat: async (_s: string, _m: any[], _c: any, _max: number, opcoes: any) => {
    h.chat.push(opcoes);
    return '[META]{"confianca":40,"evidencias_coletadas":["e1"]}[/META] Me conte mais sobre isso.';
  },
  callAI: async (_s: string, _u: string, _c: any, _max: number, opcoes: any) => {
    h.ai.push(opcoes);
    return '[AUDIT]{"status":"aprovado"}[/AUDIT]';
  },
}));

const { POST } = await import('@/app/api/chat/route');

const req = () => mockPOST('http://localhost:3000/api/chat', {
  sessaoId: SESSAO, empresaId: EMPRESA, colaboradorId: COLAB, competenciaId: COMPETENCIA,
  mensagem: 'esta é a minha resposta ao cenário proposto',
});

beforeEach(() => { sb.reset(); h.chat = []; h.ai = []; h.localePessoa = null; });

describe('/api/chat: a conversa fala no idioma da pessoa', () => {
  it('o `callAIChat` da conversa recebe o idioma da pessoa', async () => {
    h.localePessoa = 'en-US';
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.chat).toHaveLength(1);
    expect(h.chat[0]).toMatchObject({ taskKey: 'conversa_fase3', empresaId: EMPRESA, colaboradorId: COLAB, locale: 'en-US' });
  });

  it('pessoa sem idioma e sem leitura da empresa: pt-BR explícito, nunca o cookie', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(h.chat[0].locale).toBe('pt-BR');
  });
});
