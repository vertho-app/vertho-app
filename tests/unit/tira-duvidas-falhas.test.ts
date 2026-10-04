import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-140 e R-124 (04/10/2026): o Tira-Dúvidas quando algo falha, e o que o tutor lê.
 *
 *  - Duas gravações não checavam o `{ error }`: o histórico da conversa e a linha de
 *    `ia_usage_log` que o teto diário conta. A pessoa recebia a resposta e o registro
 *    podia não ficar.
 *  - O contexto do tutor usava o desafio gravado no plano (placeholder do build) e
 *    não o do kit; o 403 mandava "marcar o conteúdo como realizado", botão que não
 *    existe; o modelo era uma constante no código.
 *  - Falha de LEITURA virava "trilha não encontrada" (404) ou "0 perguntas hoje".
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  empresaCfg: null as any,
  uso: 0,
  callAIChat: vi.fn(),
  prompt: vi.fn(),
  desafios: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({
    email: 'ana@escola.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false,
    colaborador: { id: 'col-1', empresa_id: 'emp-1' },
  }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: h.callAIChat }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/rag', () => ({ retrieveContext: async () => [], formatGroundingBlock: () => '' }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => ({ desafioUnicoPorCompetencia: true }),
  checarGatesSemana: async () => null,
}));
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({ resolverDesafiosDaSemana: h.desafios }));
vi.mock('@/lib/season-engine/prompts/tira-duvidas', () => ({
  promptTiraDuvidas: (args: any) => { h.prompt(args); return { system: 'sistema', messages: [{ role: 'user', content: 'pergunta' }] }; },
}));

import { POST as tiraDuvidas } from '@/app/api/temporada/tira-duvidas/route';

const COLAB = { nome_completo: 'Ana Souza', cargo: 'Professora', perfil_dominante: 'S' };
const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  temporada_plano: [{
    semana: 1, tipo: 'conteudo', competencia: 'Planejamento', descritor: 'D1',
    conteudos_dia: [
      { label: 'Pílula 1', competencia: 'Planejamento', descritor: 'D1', conteudo: { core_titulo: 'Planejar com a equipe', desafio_texto: 'Aplique D1 no seu dia a dia' } },
    ],
  }],
  data_inicio: '2026-07-01', programa_modo: 'jornada', programa_config: null,
};

const req = (body: any = {}) => new Request('http://escola.vertho.ai/api/temporada/tira-duvidas', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ trilhaId: 'tr-1', semana: 1, message: 'Como monto a pauta?', ...body }),
});

const degradacoes = () => h.sb.escritas.filter((e: any) => e.tabela === 'degradacao_log').map((e: any) => e.payload);

beforeEach(() => {
  for (const f of [h.callAIChat, h.prompt, h.desafios]) f.mockReset();
  h.callAIChat.mockResolvedValue('Comece pela pauta.');
  h.desafios.mockResolvedValue([{ competencia: 'Planejamento', desafio_texto: 'Conduza a reunião de pais com pauta escrita.', acao_observavel: 'Pauta enviada antes' }]);
  h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, conteudo_consumido: true, tira_duvidas: { transcript_completo: [] } };
  h.empresaCfg = {};
  h.uso = 0;
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return COLAB;
      if (tabela === 'temporada_semana_progresso') return h.prog;
      if (tabela === 'empresas') return { sys_config: h.empresaCfg };
      return null;
    },
    contagem: (tabela) => (tabela === 'ia_usage_log' ? h.uso : null),
  });
});

describe('R-140: as duas gravações do turno', () => {
  it('🔴 histórico que não gravou: a pessoa recebe a resposta, `salvo: false`, a IA roda UMA vez e a falha é registrada', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'update', mensagem: 'timeout no pool' });
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.message).toBe('Comece pela pauta.');
    expect(corpo.salvo).toBe(false);
    // O estado real vai à tela, mas NÃO se paga uma segunda resposta.
    expect(h.callAIChat).toHaveBeenCalledTimes(1);
    expect(degradacoes()).toHaveLength(1);
    expect(degradacoes()[0]).toMatchObject({
      fluxo: 'chat', tipo: 'tira-duvidas-nao-gravado', chave: 'col-1:tr-1:1', empresa_id: 'emp-1', colaborador_id: 'col-1', severidade: 'aviso',
    });
    expect(degradacoes()[0].detalhe).toMatchObject({ o_que: 'historico', semana: 1 });
    expect(degradacoes()[0].detalhe.motivo).toContain('timeout no pool');
  });

  it('🔴 a linha do teto diário que não gravou também é registrada (a pergunta não pesaria no limite)', async () => {
    h.sb.falharEm({ tabela: 'ia_usage_log', op: 'insert', mensagem: 'violação de constraint' });
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(200);
    expect((await res.json()).salvo).toBe(true);
    expect(degradacoes()[0].detalhe).toMatchObject({ o_que: 'contagem' });
  });

  it('tudo gravado: `salvo: true` e nada registrado', async () => {
    const res = await tiraDuvidas(req());
    expect((await res.json()).salvo).toBe(true);
    expect(degradacoes()).toHaveLength(0);
    const log = h.sb.escritas.find((e: any) => e.tabela === 'ia_usage_log');
    expect(log.payload).toMatchObject({ feature: 'tira_duvidas', model: 'claude-sonnet-4-6' });
  });
});

describe('falha de LEITURA não é "não encontrado" nem "0 perguntas"', () => {
  it('a trilha que não leu vira 503 com código, não 404', async () => {
    h.sb.falharEm({ tabela: 'trilhas', op: 'select', mensagem: 'timeout no pool' });
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe('indisponivel');
    expect(h.callAIChat).not.toHaveBeenCalled();
  });

  it('🔴 a contagem do dia que não leu NÃO abre o teto: 503 e a IA não roda', async () => {
    h.sb.falharEm({ tabela: 'ia_usage_log', op: 'select', mensagem: 'timeout no pool' });
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(503);
    expect(h.callAIChat).not.toHaveBeenCalled();
  });

  it('o progresso que não leu também é 503 (não vira "marque o conteúdo")', async () => {
    h.sb.falharEm({ tabela: 'temporada_semana_progresso', op: 'select', mensagem: 'timeout no pool' });
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(503);
  });
});

describe('R-124: as mensagens que a tela traduz', () => {
  it('🔴 conteúdo não aberto: 403 com código, sem mandar marcar um botão que não existe', async () => {
    h.prog = { ...h.prog, conteudo_consumido: false };
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(403);
    const corpo = await res.json();
    expect(corpo.codigo).toBe('conteudo-nao-aberto');
    expect(corpo.error).not.toMatch(/marque|marcar|realizado/i);
    expect(corpo.error).toMatch(/abra/i);
  });

  it('limite diário: 429 com código e o número, para a tela dizer no idioma da pessoa', async () => {
    h.uso = 10;
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ codigo: 'limite-diario', limite: 10 });
    expect(h.callAIChat).not.toHaveBeenCalled();
  });
});

describe('R-124: o que o tutor lê da semana', () => {
  const resumo = () => String(h.prompt.mock.calls[0][0].conteudoResumo);

  it('🔴 o desafio é o do KIT (fonte única), não o placeholder gravado no plano', async () => {
    await tiraDuvidas(req());
    expect(resumo()).toContain('Desafio: Conduza a reunião de pais com pauta escrita.');
    expect(resumo()).toContain('Ação observável: Pauta enviada antes');
    expect(resumo()).not.toContain('Aplique D1');
    expect(resumo()).toContain('Planejar com a equipe');
    // Os mesmos argumentos que a conversa de Evidências passa: DISC, cargo e o flag da Jornada.
    expect(h.desafios.mock.calls[0][2]).toMatchObject({
      empresaId: 'emp-1', disc: 'S', cargo: 'Professora', desafioUnicoPorCompetencia: true, colaboradorId: 'col-1',
    });
  });

  it('o kit que não respondeu degrada para o desafio do plano, como os outros blocos de contexto', async () => {
    h.desafios.mockRejectedValue(new Error('kit indisponível'));
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(200);
    expect(resumo()).toContain('Aplique D1 no seu dia a dia');
  });
});

describe('R-124: o modelo é o da tarefa', () => {
  const modeloDaChamada = () => h.callAIChat.mock.calls[0][2].model;

  it('sem configuração: o incumbente (Sonnet 4.6)', async () => {
    await tiraDuvidas(req());
    expect(modeloDaChamada()).toBe('claude-sonnet-4-6');
  });

  it('🔴 o seletor da empresa vale (ai.modelos.tira_duvidas), e o ledger grava o modelo que RODOU', async () => {
    h.empresaCfg = { ai: { modelos: { tira_duvidas: 'claude-sonnet-5-5' } } };
    await tiraDuvidas(req());
    expect(modeloDaChamada()).toBe('claude-sonnet-5-5');
    expect(h.sb.escritas.find((e: any) => e.tabela === 'ia_usage_log').payload.model).toBe('claude-sonnet-5-5');
  });

  it('o `modelo_padrao` genérico do tenant não troca o tutor (a task é pinada)', async () => {
    h.empresaCfg = { ai: { modelo_padrao: 'claude-sonnet-5-5' } };
    await tiraDuvidas(req());
    expect(modeloDaChamada()).toBe('claude-sonnet-4-6');
  });
});
