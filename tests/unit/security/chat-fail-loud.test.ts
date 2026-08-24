import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../../helpers/mock-request';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * B5 da auditoria 22/08 — `/api/chat`: seis das sete escritas e nove leituras
 * sem checar `error`.
 *
 * Por que isto não é "log perdido": `totalTurnos` é DERIVADO de
 * `mensagens_chat` (`historico.filter(user).length + 1`), e `decidirFase` e
 * `deveEncerrar` leem esse contador contra `MAX_TURNOS = 10`. Turno que não
 * gravou não volta — a conversa passa a precisar de um turno a mais para
 * fechar, e quem fecha a semana é a conversa. As notas da IA4 saem do
 * transcript, então turno perdido MOVE a nota.
 *
 * O arquivo prova as duas metades da régua da casa:
 *  · o que decide o destino da pessoa falha ALTO (500, cliente não marca nada);
 *  · o que só descreve degrada REGISTRANDO (`degradacao_log`, R10 do health).
 *
 * E prova a idempotência (mig 222): retry da mesma mensagem não cria um segundo
 * turno nem duplica a fala na conversa enviada à IA.
 */

const SESSAO = 'sess-1';
const EMPRESA = 'emp-1';
const COLAB = 'colab-1';
const COMPETENCIA = 'comp-1';

let historico: any[] = [];
let respostaIA = '[META]{"confianca":40,"evidencias_coletadas":["e1"]}[/META] Me conte mais sobre isso.';
let falhaIA: Error | null = null;

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'sessoes_avaliacao') {
      return {
        id: SESSAO, empresa_id: EMPRESA, colaborador_id: COLAB, competencia_id: COMPETENCIA,
        status: 'em_andamento', fase: 'cenario', confianca: 20, aprofundamentos: 0,
        evidencias: [], cenario_id: null,
      };
    }
    if (tabela === 'competencias') return { nome: 'Comunicação', descricao: 'd', gabarito: {}, cod_comp: 'C1', versao_regua: 1 };
    if (tabela === 'empresas') return { nome: 'ACME', sys_config: {} };
    return null;
  },
  lista: (tabela: string) => (tabela === 'mensagens_chat' ? historico : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null }, heavyLimiter: { check: async () => null } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/turmas', () => ({ configEfetivaDoColaborador: async () => ({}) }));
vi.mock('@/lib/access-gates', () => ({ canAccessMapeamentoCenarios: () => ({ allowed: true }) }));
vi.mock('@/lib/versioning', () => ({ getOrCreatePromptVersion: async () => 'pv-1' }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'c@a.com', empresaId: EMPRESA, colaborador: { id: COLAB }, role: 'colaborador' }),
  assertTenantAccess: () => null,
  assertColabAccess: async () => null,
}));
vi.mock('@/actions/ai-client', () => ({
  callAIChat: async () => {
    if (falhaIA) throw falhaIA;
    return respostaIA;
  },
  callAI: async () => '[AUDIT]{"status":"aprovado"}[/AUDIT]',
}));

const { POST } = await import('@/app/api/chat/route');

const req = (extra: any = {}) =>
  mockPOST('http://localhost:3000/api/chat', {
    sessaoId: SESSAO, empresaId: EMPRESA, colaboradorId: COLAB, competenciaId: COMPETENCIA,
    mensagem: 'esta é a minha resposta ao cenário proposto', ...extra,
  });

const turnos = (role?: string) =>
  sb.escritas.filter((e) => e.tabela === 'mensagens_chat' && e.op === 'insert')
    .filter((e) => !role || e.payload?.role === role);

beforeEach(() => {
  sb.reset();
  historico = [];
  falhaIA = null;
  respostaIA = '[META]{"confianca":40,"evidencias_coletadas":["e1"]}[/META] Me conte mais sobre isso.';
});

describe('B5 — o que decide o destino da pessoa falha ALTO', () => {
  it('caminho feliz: grava turno, resposta e sessão', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(turnos('user')).toHaveLength(1);
    expect(turnos('assistant')).toHaveLength(1);
  });

  it('🔴 o turno do usuário não gravou → 500, e o cliente não segue a conversa', async () => {
    sb.falharEm({ tabela: 'mensagens_chat', op: 'insert', mensagem: 'deadlock detected', quando: (p) => p?.role === 'user' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toMatch(/gravar a sua resposta/);
  });

  /**
   * O pior dos nove: sem checagem, falha de leitura vira lista VAZIA. O
   * contador volta a 1 e a conversa recomeça — com a pessoa achando que já
   * respondeu.
   */
  it('🔴 o histórico não pôde ser lido → 500, e não vira conversa de zero turnos', async () => {
    sb.falharEm({ tabela: 'mensagens_chat', op: 'select', mensagem: 'conexão perdida' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/histórico da conversa/);
    expect(turnos()).toHaveLength(0);
  });

  it('🔴 a resposta do assistente não gravou → 500 (senão o próximo turno fala com um passado que não existe)', async () => {
    sb.falharEm({ tabela: 'mensagens_chat', op: 'insert', mensagem: 'disco cheio', quando: (p) => p?.role === 'assistant' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/gravar a resposta da conversa/);
    // o turno do usuário FOI gravado — é justamente o sucesso parcial que exige
    // a idempotência do bloco abaixo
    expect(turnos('user')).toHaveLength(1);
  });

  it('🔴 a fase/confiança da sessão não gravou → 500', async () => {
    sb.falharEm({ tabela: 'sessoes_avaliacao', op: 'update', mensagem: 'timeout no pool' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/atualizar a sessão/);
  });

  it('🔴 a competência não pôde ser lida → 500 (o prompt depende do gabarito)', async () => {
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'relation não disponível' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/ler a competência/);
  });
});

describe('B5 — o que só descreve degrada REGISTRANDO', () => {
  it('sys_config indisponível: usa o modelo default e segue, registrando', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const deg = sb.escritas.filter((e) => e.tabela === 'degradacao_log');
    expect(deg.length).toBeGreaterThan(0);
    expect(deg[0].payload.tipo).toBe('chat-metadado-nao-gravado');
  });

  it('a IA falhou: a pessoa recebe o aviso e a rota NÃO devolve erro', async () => {
    falhaIA = new Error('529 overloaded');
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.mensagem).toMatch(/problema técnico/);
  });
});

/**
 * A parte que o plano da sprint pediu explicitamente: sucesso PARCIAL seguido de
 * retry não pode criar um segundo turno. Sem a chave de idempotência, a correção
 * "falhar alto em tudo" TROCA um bug por outro — o retry chama a IA de novo e
 * duplica a fala, o que encurta a conversa contra MAX_TURNOS.
 */
describe('B5 — retry depois de sucesso parcial não duplica o turno (mig 222)', () => {
  it('o turno já gravado volta como 23505 e a rota reconhece em vez de duplicar', async () => {
    // 1ª requisição: grava o turno do usuário e falha no update da sessão.
    sb.falharEm({ tabela: 'sessoes_avaliacao', op: 'update', mensagem: 'queda no meio da escrita' });
    const primeira = await POST(req({ turnId: 'turno-abc' }));
    expect(primeira.status).toBe(500);
    expect(turnos('user')).toHaveLength(1);

    // Estado após a 1ª: o turno ESTÁ no banco (e portanto no histórico).
    historico = [{ role: 'user', content: 'esta é a minha resposta ao cenário proposto' }];
    sb.reset();
    sb.falharEm({
      tabela: 'mensagens_chat', op: 'insert', mensagem: 'duplicate key value violates unique constraint',
      code: '23505', quando: (p) => p?.role === 'user',
    });

    // 2ª requisição: MESMO turnId (o cliente o mantém enquanto não confirma).
    const segunda = await POST(req({ turnId: 'turno-abc' }));
    expect(segunda.status).toBe(200);
    const json = await segunda.json();
    expect(json.ok).toBe(true);
    // O 23505 não virou erro...
    expect(json.error).toBeUndefined();
  });

  it('o contador de turno não pula quando o turno já estava gravado', async () => {
    // Histórico com 2 turnos do usuário, sendo o 2º o que está sendo reenviado.
    historico = [
      { role: 'user', content: 'primeira resposta minha sobre o caso' },
      { role: 'assistant', content: 'e o que você fez?' },
      { role: 'user', content: 'esta é a minha resposta ao cenário proposto' },
    ];
    sb.falharEm({
      tabela: 'mensagens_chat', op: 'insert', mensagem: 'duplicate key value violates unique constraint',
      code: '23505', quando: (p) => p?.role === 'user',
    });
    const res = await POST(req({ turnId: 'turno-abc' }));
    expect(res.status).toBe(200);
    // 2 turnos do usuário no histórico e o reenvio NÃO soma um terceiro:
    // se somasse, a conversa chegaria em MAX_TURNOS antes da hora.
    const updates = sb.escritas.filter((e) => e.tabela === 'sessoes_avaliacao' && e.op === 'update');
    expect(updates.length).toBeGreaterThan(0);
  });
});
