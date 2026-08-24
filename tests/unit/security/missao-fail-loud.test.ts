import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPOST } from '../../helpers/mock-request';
import { criarSupabaseMock } from '../../helpers/supabase-mock';

/**
 * B4 da auditoria 22/08 — `/api/temporada/missao` respondia `ok: true` sem ter
 * gravado.
 *
 * 🔴 É a TERCEIRA IRMÃ. A rodada de 09-11/08 (F10) corrigiu exatamente esta
 * forma em `/evaluation` e `/reflection` — as duas rotas de maior churn do repo
 * — extraindo `gravarProgressoSemana`, que LANÇA quando a escrita falha. A rota
 * de missão fazia o mesmo em outro formato e ficou de fora: quando há três
 * caminhos, corrigir dois é indistinguível de corrigir todos, até alguém cair no
 * terceiro.
 *
 * O que a pessoa sente: escreve o compromisso da semana de aplicação, a tela
 * confirma, e o slot fica VAZIO. Como o gate sequencial exige a semana N−1
 * concluída, ela fica presa numa semana que o sistema disse ter salvo — o mesmo
 * padrão dos 19 de 36 travados em Ibipeba.
 *
 * Os três casos abaixo foram validados por mutação: revertendo o fix da rota,
 * cada um deles fica vermelho pelo motivo que descreve.
 */

const TRILHA = 'tr-1';
const EMPRESA = 'emp-1';
const COLAB = 'colab-1';

const PLANO = [{ semana: 4, tipo: 'aplicacao' }];

const sb = criarSupabaseMock({
  resolver: (tabela: string) => {
    if (tabela === 'trilhas') {
      return { id: TRILHA, empresa_id: EMPRESA, colaborador_id: COLAB, temporada_plano: PLANO, data_inicio: '2026-01-01' };
    }
    if (tabela === 'temporada_semana_progresso') {
      return { id: 'prog-1', trilha_id: TRILHA, semana: 4, iniciado_em: '2026-01-02', feedback: {} };
    }
    return null;
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null }, heavyLimiter: { check: async () => null } }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({ checarGatesSemana: async () => null }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'c@a.com', empresaId: EMPRESA, colaborador: { id: COLAB }, role: 'colaborador' }),
  assertColabAccess: async () => null,
}));

const { POST } = await import('@/app/api/temporada/missao/route');

const req = (body: any = {}) =>
  mockPOST('http://localhost:3000/api/temporada/missao', {
    trilhaId: TRILHA, semana: 4, modo: 'pratica', compromisso: 'vou aplicar na reunião de segunda', ...body,
  });

const gravacoes = () => sb.escritas.filter((e) => e.tabela === 'temporada_semana_progresso');

beforeEach(() => sb.reset());

describe('B4 — a rota de missão não pode dizer ok sem ter gravado', () => {
  it('caminho feliz: grava e confirma', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(gravacoes()).toHaveLength(1);
    expect(gravacoes()[0].op).toBe('update'); // já existia progresso
  });

  it('🔴 escrita falha → 500, e o cliente NÃO recebe ok', async () => {
    sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout no pool' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBeUndefined();
    expect(json.error).toMatch(/progresso da semana 4/);
  });

  /**
   * O modo de falha mais sutil dos três: `error` ignorado numa LEITURA vira
   * `prog = null`, o fluxo conclui "não existe progresso" e vai para o ramo de
   * INSERT — criando uma segunda linha para (trilha, semana) em vez de atualizar
   * a que está lá. Ninguém vê erro; o dado é que fica duplicado.
   */
  it('🔴 leitura do progresso falha → 500, e NÃO cai no ramo de insert', async () => {
    sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'conexão perdida' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(gravacoes().filter((e) => e.op === 'insert')).toHaveLength(0);
  });

  /**
   * Falha de leitura da trilha não é "trilha não encontrada": 404 manda o
   * cliente desistir de um dado que existe, e a tela some com a semana.
   */
  it('🔴 leitura da trilha falha → 500 acionável, não 404', async () => {
    sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'pool esgotado' });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(gravacoes()).toHaveLength(0);
  });
});
