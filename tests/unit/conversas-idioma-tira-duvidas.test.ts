import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda E (04/10/2026): o Tira-Dúvidas (`tira_duvidas`, rota `/api/temporada/tira-duvidas`) responde à PESSOA dona
 * da trilha, e o `callAIChat` recebe o idioma dela como opção EXPLÍCITA: `colaboradores.locale`, senão
 * `empresas.default_locale`, senão pt-BR. Sem a opção o wrapper lia o cookie `vertho-locale`, que o login por
 * senha nem sempre grava.
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  locale: { colab: null as string | null, empresa: null as string | null },
  callAIChat: vi.fn(),
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
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({
  resolverDesafiosDaSemana: async () => [{ competencia: 'Planejamento', desafio_texto: 'Conduza a reunião com pauta escrita.' }],
}));
vi.mock('@/lib/season-engine/prompts/tira-duvidas', () => ({
  promptTiraDuvidas: () => ({ system: 'sistema', messages: [{ role: 'user', content: 'pergunta' }] }),
}));

import { POST as tiraDuvidas } from '@/app/api/temporada/tira-duvidas/route';

const COLAB = { nome_completo: 'Ana Souza', cargo: 'Professora', perfil_dominante: 'S' };
const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  temporada_plano: [{
    semana: 1, tipo: 'conteudo', competencia: 'Planejamento', descritor: 'D1',
    conteudos_dia: [
      { label: 'Pílula 1', competencia: 'Planejamento', descritor: 'D1', conteudo: { core_titulo: 'Planejar com a equipe', desafio_texto: 'Aplique D1' } },
    ],
  }],
  data_inicio: '2026-07-01', programa_modo: 'jornada', programa_config: null,
};

const req = () => new Request('http://escola.vertho.ai/api/temporada/tira-duvidas', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ trilhaId: 'tr-1', semana: 1, message: 'Como monto a pauta?' }),
});

const montar = () => {
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { ...COLAB, locale: h.locale.colab };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      if (tabela === 'empresas') return { sys_config: {}, default_locale: h.locale.empresa };
      return null;
    },
    contagem: () => 0,
  });
};

beforeEach(() => {
  h.callAIChat.mockReset();
  h.callAIChat.mockResolvedValue('Comece pela pauta.');
  h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, conteudo_consumido: true, tira_duvidas: { transcript_completo: [] } };
  h.locale = { colab: null, empresa: null };
  montar();
});

describe('/api/temporada/tira-duvidas: a resposta sai no idioma da pessoa', () => {
  it('o `callAIChat` recebe o idioma da pessoa dona da trilha', async () => {
    h.locale.colab = 'en-US';
    h.locale.empresa = 'es-ES';
    montar();
    const res = await tiraDuvidas(req());
    expect(res.status).toBe(200);
    expect(h.callAIChat).toHaveBeenCalledTimes(1);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'tira_duvidas', empresaId: 'emp-1', colaboradorId: 'col-1', locale: 'en-US' });
  });

  it('pessoa sem idioma: o da empresa; sem idioma nenhum, pt-BR explícito', async () => {
    h.locale.empresa = 'pt-PT';
    montar();
    await tiraDuvidas(req());
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-PT');

    h.callAIChat.mockClear();
    h.locale.empresa = null;
    montar();
    await tiraDuvidas(req());
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-BR');
  });
});
