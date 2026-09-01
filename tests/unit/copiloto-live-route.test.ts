import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({
  createRateLimiter: () => ({ check: vi.fn().mockResolvedValue(null) }),
}));
vi.mock('@/lib/copiloto/auth', () => ({
  requireRepresentativeOrAdminRequest: vi.fn().mockResolvedValue({ kind: 'admin', email: 'admin@vertho.ai' }),
}));

import { callAI } from '@/actions/ai-client';
import { POST } from '@/app/api/copiloto/live/route';

function request(extra: Record<string, unknown> = {}) {
  return new Request('https://app.vertho.ai/api/copiloto/live', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterances: [{ channel: 'vendedor', text: 'Quero entender como vocês trabalham hoje.' }],
      phase: 'preparar',
      covered: [],
      plan: { questions: [] },
      ...extra,
    }),
  });
}

describe('rota de apoio ao vivo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.COPILOTO_LIVE_MODEL;
  });

  it('usa o modelo rápido e aceita fala classificada como vendedor', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'analisar',
      sinal: 'abertura',
      objecao: null,
      descobertas_cobertas: [],
      alerta: null,
      foco: 'Entenda o processo atual.',
      perguntas: [{ texto: 'Como isso funciona hoje?', porque: 'Mapear situação' }],
    }));

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.mode).toBe('ai');
    expect(data.reading.questions[0].text).toBe('Como isso funciona hoje?');
    expect(callAI).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('[vertho_local]'),
      { model: 'gpt-5.6-luna' },
      700,
      expect.objectContaining({ timeoutMs: 8000, reasoningEffort: 'none' }),
    );
  });

  it('não chama toda voz remota de cliente quando há outra pessoa da Vertho', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'preparar', sinal: 'neutro', objecao: null, descobertas_cobertas: [],
      alerta: null, foco: 'Continue ouvindo.', perguntas: [],
    }));

    const response = await POST(request({
      sharedAudioRole: 'misto',
      utterances: [{ channel: 'cliente', text: 'Posso complementar esse ponto.' }],
    }));
    const prompt = vi.mocked(callAI).mock.calls[0][1];

    expect(response.status).toBe(200);
    expect(prompt).toContain('[reuniao_compartilhada_papel_nao_confirmado]');
    expect(prompt).not.toContain('[cliente_remoto]');
  });

  it('envia somente a janela recente e as doze perguntas mais relevantes', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'preparar', sinal: 'neutro', objecao: null, descobertas_cobertas: [],
      alerta: null, foco: 'Continue ouvindo.', perguntas: [],
    }));
    const utterances = Array.from({ length: 15 }, (_value, index) => ({
      channel: index % 2 ? 'cliente' : 'vendedor', text: `TRECHO_${String(index).padStart(2, '0')}`,
    }));
    const questions = Array.from({ length: 20 }, (_value, index) => ({
      phase: 'preparar', discovery: null, text: `PERGUNTA_${String(index).padStart(2, '0')}`, why: 'Teste',
    }));

    const response = await POST(request({ utterances, plan: { questions } }));
    const prompt = vi.mocked(callAI).mock.calls[0][1];

    expect(response.status).toBe(200);
    expect(prompt).not.toContain('TRECHO_00');
    expect(prompt).not.toContain('TRECHO_06');
    expect(prompt).toContain('TRECHO_07');
    expect(prompt).toContain('TRECHO_14');
    expect(prompt).toContain('PERGUNTA_11');
    expect(prompt).not.toContain('PERGUNTA_12');
  });

  it('devolve o banco PACE local quando todos os provedores falham', async () => {
    vi.mocked(callAI).mockRejectedValue(new Error('timeout'));

    const response = await POST(request({
      plan: {
        questions: [{
          phase: 'preparar', discovery: 'situacao_atual',
          text: 'Como o processo funciona hoje?', why: 'Abrir diagnóstico',
        }],
      },
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.meta.mode).toBe('local_fallback');
    expect(data.reading.questions[0].text).toBe('Como o processo funciona hoje?');
    expect(data.reading.alert).toContain('banco PACE local');
  });

  it('leva o Play e três fatos citáveis para a leitura ao vivo', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'analisar', sinal: 'neutro', objecao: null, descobertas_cobertas: [],
      alerta: null, foco: 'Teste a pergunta do Play.', perguntas: [],
    }));
    const play = {
      kind: 'retorno', audience: 'Maria, Head de T&D', goalThisHour: 'Marcar a demo até sexta.',
      mustAsk: [
        { text: 'Como funciona hoje?', discovery: 'situacao_atual', green: 'Processo claro', red: 'Sem processo', ifGreen: 'Avançar' },
        { text: 'Qual impacto ainda está aberto?', discovery: 'impacto', green: 'Impacto concreto', red: 'Sem impacto', ifGreen: 'Dimensionar' },
      ],
      doNot: ['Não repetir o diagnóstico.'], closeWith: 'Abrir a agenda e marcar a demo.',
      fallbackGoal: 'Se a demo não fechar, sair com a lista de quem precisa participar.',
      landmine: { objection: 'Já temos plataforma.', ask: 'O que ela ainda não comprova?' },
    };

    const response = await POST(request({
      covered: ['situacao_atual'],
      plan: {
        play,
        gaps: ['impacto'],
        questions: [{ phase: 'analisar', discovery: 'dor_principal', text: 'Pergunta de reserva', why: 'Reserva' }],
        objections: [],
        hypotheses: [
          { hypothesis: 'A régua de avaliação é informal.', basis: 'Nada publicado', howToTest: 'Perguntar como avaliam hoje.' },
          { hypothesis: 'O ciclo roda duas vezes por ano.', basis: 'Site', howToTest: 'Confirmar a periodicidade.' },
          { hypothesis: 'Terceira hipótese.', basis: 'Briefing', howToTest: 'Perguntar.' },
          { hypothesis: 'Quarta hipótese não deve seguir.', basis: 'Briefing', howToTest: 'Perguntar.' },
        ],
        facts: [
          { title: 'Expansão', fact: 'A empresa abriu uma unidade.', relevance: 'Unidade nova precisa de gestor formado.' },
          { title: 'Vagas', fact: 'Há vagas para liderança.', relevance: 'Sinal de time em formação.', publishedAt: '2026-08-20' },
          { title: 'Projeto', fact: 'A empresa lançou um programa interno.', relevance: 'Já investem em desenvolvimento.' },
          { title: 'Excedente', fact: 'Este quarto fato não deve seguir.', relevance: 'Irrelevante.' },
        ],
      },
    }));
    const prompt = vi.mocked(callAI).mock.calls[0][1];

    expect(response.status).toBe(200);
    expect(prompt).toContain('Objetivo desta hora: Marcar a demo até sexta.');
    expect(prompt).toContain('[PLAY/impacto] Qual impacto ainda está aberto?');
    expect(prompt).not.toContain('[PLAY/situacao_atual]');
    expect(prompt).toContain('dor_principal (O que mais incomoda): coberto');
    expect(prompt).toContain('F3: Projeto');
    expect(prompt).not.toContain('Excedente');
    expect(prompt).toContain('Não faça: Não repetir o diagnóstico.');
    // A implicacao e o elo que torna o fato falavel: sem ela o modelo recebe a
    // observacao e nao o motivo de ela importar.
    expect(prompt).toContain('por que importa: Unidade nova precisa de gestor formado.');
    expect(prompt).toContain('(2026-08-20)');
    // Hipotese e o que se testa DURANTE a conversa; era gerada e descartada aqui.
    expect(prompt).toContain('H1: A régua de avaliação é informal. | testar com: Perguntar como avaliam hoje.');
    expect(prompt).toContain('H3: Terceira hipótese.');
    expect(prompt).not.toContain('Quarta hipótese');
    // O objetivo reserva do PACE: o avanco que ainda salva a reuniao.
    expect(prompt).toContain('Se o objetivo não sair: Se a demo não fechar, sair com a lista de quem precisa participar.');
  });

  it('não anuncia hipótese quando o plano não tem nenhuma', async () => {
    vi.mocked(callAI).mockResolvedValue(JSON.stringify({
      fase: 'preparar', sinal: 'neutro', objecao: null, descobertas_cobertas: [],
      alerta: null, foco: 'Ouça.', perguntas: [],
    }));

    await POST(request({ plan: { questions: [], hypotheses: [{ hypothesis: '   ', howToTest: 'x' }] } }));
    const prompt = vi.mocked(callAI).mock.calls[0][1];

    expect(prompt).toContain('nenhuma hipótese preparada');
  });
});
