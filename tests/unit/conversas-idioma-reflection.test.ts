import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { maskColaborador } from '@/lib/pii-masker';

/**
 * Onda E (04/10/2026): a conversa de Evidências da semana (`evidencias_socratic`, `evidencias_analytic`,
 * `missao_feedback`; rota `/api/temporada/reflection`) é com a PESSOA dona da trilha, e o `callAIChat` recebe o
 * idioma dela como opção EXPLÍCITA: `colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR. Vale
 * também para a segunda chamada, a do fechamento forçado.
 *
 * A extração do fim da conversa (`temporada_extracao`) NÃO recebe idioma: é JSON interno que alimenta o
 * fechamento e o relatório, e o código lê os campos por nome.
 *
 * Nomes e contatos sintéticos.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  locale: { colab: null as string | null, empresa: null as string | null },
  afters: [] as Array<() => any>,
  callAI: vi.fn(),
  callAIChat: vi.fn(),
  acumulada: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: (fn: () => any) => { h.afters.push(fn); } }));
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
vi.mock('@/actions/ai-client', () => ({ callAI: h.callAI, callAIChat: h.callAIChat }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/rag', () => ({ retrieveContext: async () => [], formatGroundingBlock: () => '' }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/kit/entrega-semana', () => ({
  resolverDesafiosDaSemana: async () => [{ competencia: 'Planejamento', desafio_texto: 'Planeje a semana com a equipe.' }],
}));
vi.mock('@/lib/season-engine/avaliacao-acumulada-core', () => ({ gerarAvaliacaoAcumuladaCore: h.acumulada }));

import { POST as reflection } from '@/app/api/temporada/reflection/route';
import { PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';

const COLAB = { nome_completo: 'Ana Souza', cargo: 'Professora', perfil_dominante: 'S' };
const ALIAS = maskColaborador(COLAB).masked!.nome;

const TRILHA = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: 'Planejamento',
  competencias_foco: ['Planejamento'], descritores_selecionados: [{ descritor: 'D1', competencia: 'Planejamento' }],
  temporada_plano: [
    { semana: 1, tipo: 'conteudo', competencia: 'Planejamento', descritor: 'D1', descritores_cobertos: ['D1'] },
    { semana: 8, tipo: 'avaliacao' },
    { semana: 9, tipo: 'avaliacao' },
  ],
  data_inicio: '2026-07-01', programa_modo: 'regular', programa_config: {},
};

const req = (body: any) => new Request('http://escola.vertho.ai/api/temporada/reflection', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', ...body }),
});

const EXTRACAO_OK = JSON.stringify({
  desafio_realizado: 'sim', relato_resumo: 'Relatou a reunião.', insight_principal: 'Planejar antes ajuda.',
  compromisso_proxima: 'Enviar a pauta na véspera.', compromisso_origem: 'colaborador', qualidade_reflexao: 'media', citacao_chave: null,
  avaliacao_por_descritor: [{ descritor: 'D1', apareceu: true, forca_evidencia: 'moderada', observacao: 'planejou', trecho_sustentador: '', limite: '' }],
});

/** 5 falas da IA já gravadas: a próxima é a última (o teto socrático é 6 turnos). */
const transcriptAteOPenultimo = () => {
  const t: any[] = [];
  for (let i = 1; i <= 5; i++) {
    t.push({ role: 'assistant', content: `pergunta ${i}?` });
    t.push({ role: 'user', content: `resposta ${i}` });
  }
  t.pop();
  return t;
};

/** A rota grava no objeto que recebe: cada envio precisa de um progresso novo. */
const novoProgresso = () => {
  h.prog = { id: 'p1', empresa_id: 'emp-1', semana: 1, reflexao: { transcript_completo: transcriptAteOPenultimo() } };
};

const montar = () => {
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return TRILHA;
      if (tabela === 'colaboradores') return { ...COLAB, locale: h.locale.colab };
      if (tabela === 'empresas') return { default_locale: h.locale.empresa };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
};

beforeEach(() => {
  for (const f of [h.callAI, h.callAIChat, h.acumulada]) f.mockReset();
  h.afters = [];
  h.locale = { colab: null, empresa: null };
  h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9, turnosQualitativa: 2 };
  h.callAI.mockResolvedValue(EXTRACAO_OK);
  h.callAIChat.mockResolvedValue(`✅ Obrigado, ${ALIAS}. 🎯 Leve isso para a reunião.`);
  novoProgresso();
  montar();
});

const enviar = () => reflection(req({ semana: 1, action: 'send', message: 'Planejei antes.' }));

describe('/api/temporada/reflection: a conversa fala no idioma da pessoa', () => {
  it('o `callAIChat` recebe o idioma da pessoa dona da trilha', async () => {
    h.locale.colab = 'es-ES';
    h.locale.empresa = 'en-US';
    montar();
    const res = await enviar();
    expect(res.status).toBe(200);
    expect(h.callAIChat).toHaveBeenCalledTimes(1);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'evidencias_socratic', empresaId: 'emp-1', colaboradorId: 'col-1', locale: 'es-ES' });
  });

  it('pessoa sem idioma: o da empresa; sem idioma nenhum, pt-BR explícito', async () => {
    h.locale.empresa = 'pt-PT';
    montar();
    await enviar();
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-PT');

    h.callAIChat.mockClear();
    h.locale.empresa = null;
    novoProgresso();
    montar();
    await enviar();
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-BR');
  });

  it('o fechamento forçado (a 2ª chamada, quando a 1ª não fechou) fala no MESMO idioma', async () => {
    h.locale.colab = 'en-US';
    montar();
    h.callAIChat
      .mockResolvedValueOnce('E o que você percebe que ainda falta?') // terminou em pergunta: não fechou
      .mockResolvedValueOnce(`✅ Obrigado, ${ALIAS}. 🎯 Leve isso para a reunião.`);
    const res = await enviar();
    expect(res.status).toBe(200);
    expect(h.callAIChat).toHaveBeenCalledTimes(2);
    for (const chamada of h.callAIChat.mock.calls) expect(chamada[4].locale).toBe('en-US');
  });

  it('a extração (JSON interno) NÃO recebe idioma', async () => {
    h.locale.colab = 'en-US';
    montar();
    await enviar();
    const extracoes = h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'temporada_extracao');
    expect(extracoes.length).toBeGreaterThan(0);
    for (const c of extracoes) expect(c[4]).not.toHaveProperty('locale');
  });
});
