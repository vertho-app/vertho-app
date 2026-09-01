import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/lib/copiloto/auth', () => ({ requireRepresentativeOrAdminRequest: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: vi.fn() }));

import { normalizePlan } from '@/app/api/copiloto/planejamento/route';
import { inferMeetingKind } from '@/lib/copiloto/play';

const execution = {
  siteRequested: true,
  siteCompleted: true,
  newsRequested: true,
  newsCompleted: true,
  socialCompleted: true,
};

describe('avanço escolhido no plano', () => {
  const memoriaVazia = {
    hasConversations: false, covered: [], pending: [],
    nextStep: '', pains: [], objections: [], commitments: [], anchorAnswers: [],
  };
  const pesquisaVazia = {
    empresa_identificada: 'Conta', resumo_empresa: '', fatos_relevantes: [], tendencias_setor: [],
    hipoteses: [], metricas_roi: [], perguntas_estrategicas: [], riscos: [],
  };
  const banco = {
    play: { must_ask: [], openers: [] },
    perguntas: [
      { fase: 'analisar', descoberta: 'situacao_atual', texto: 'Como funciona hoje?', porque: 'Situação' },
      { fase: 'engajar', descoberta: 'decisor', texto: 'Quem decide?', porque: 'Decisão' },
      { fase: 'analisar', descoberta: 'impacto', texto: 'Qual o impacto?', porque: 'Impacto' },
    ],
    objecoes_provaveis: [],
  };

  function planoCom(goal: any) {
    return normalizePlan(pesquisaVazia, banco, [], [], '', execution, {
      meetingKind: 'primeira_conversa', conversationGoal: goal,
      audience: '', goalThisHour: '', memory: { ...memoriaVazia },
    });
  }

  // O teste que prova que a porta nao e so mais um campo: duas portas, mesma empresa,
  // bancos em ordem diferente.
  it('duas portas diferentes produzem ordens diferentes no banco', () => {
    const dor = planoCom('confirmar_dor').questions.map((item) => item.discovery);
    const decisao = planoCom('destravar_decisao').questions.map((item) => item.discovery);

    expect(dor[0]).toBe('impacto');
    expect(decisao[0]).toBe('decisor');
    expect(dor).not.toEqual(decisao);
  });

  it('carimba o avanço no plano, para o apoio ao vivo e o histórico saberem qual era', () => {
    expect(planoCom('construir_valor').goal).toBe('construir_valor');
  });

  it('gera a pergunta-âncora a partir do avanço quando o modelo não devolve uma', () => {
    expect(planoCom('destravar_decisao').play?.anchorQuestion).toContain('impede uma decisão segura');
    expect(planoCom('confirmar_dor').play?.anchorQuestion).toContain('Quanto isso custa');
  });
});

describe('normalização do Play da reunião', () => {
  beforeEach(() => vi.clearAllMocks());

  it('infere o tipo pelo estágio e pela existência de conversa anterior', () => {
    expect(inferMeetingKind({ stage: 'lead_identificado', hasConversation: false })).toBe('primeira_conversa');
    expect(inferMeetingKind({ stage: 'contato_iniciado', hasConversation: true })).toBe('retorno');
    expect(inferMeetingKind({ stage: 'diagnostico_reuniao_realizada', hasConversation: true })).toBe('retorno');
    expect(inferMeetingKind({ stage: 'proposta_enviada', hasConversation: true })).toBe('negociacao');
  });

  it('faz o objetivo nascer do Play, valida fatos e não repergunta memória coberta no retorno', () => {
    const plan = normalizePlan({
      empresa_identificada: 'Empresa Exemplo',
      resumo_empresa: 'Empresa em expansão.',
      fatos_relevantes: [
        { titulo: 'Fonte inválida', fato: 'Este fato não pode entrar no plano.', relevancia: 'Nenhuma.', fonte_url: 'https://outra-empresa.example/noticia', publicado_em: '2026-08-19', _research_channel: 'site' },
        { titulo: 'Expansão', fato: 'A empresa abriu uma nova unidade.', relevancia: 'Pode ampliar o público.', fonte_url: 'https://empresa.example/noticia', publicado_em: '2026-08-20', _research_channel: 'site' },
        { titulo: 'Vagas', fato: 'Há vagas públicas para liderança.', relevancia: 'Sinal de crescimento.', fonte_url: 'https://empresa.example/vagas', publicado_em: '2026-08-22', _research_channel: 'site' },
      ],
      tendencias_setor: [], hipoteses: [], objetivos: { principal: 'OBJETIVO PÚBLICO NÃO DEVE VENCER', reserva: 'Reserva pública' },
      metricas_roi: [], perguntas_estrategicas: [], riscos: [],
    }, {
      resumo_valor: 'A conversa pode validar o avanço.',
      hipoteses: [],
      play: {
        kind: 'retorno',
        audience: 'Maria Souza, Head de T&D',
        goal_this_hour: 'Sair com uma demo de 25 minutos marcada até sexta.',
        openers: [
          { say: 'Vi que vocês abriram uma nova unidade.', fact_index: 0 },
          { say: 'Vi um dado sem fonte válida.', fact_index: 99 },
        ],
        must_ask: [
          { text: 'Como funciona hoje?', discovery: 'situacao_atual', green: 'Processo claro', red: 'Sem processo', if_green: 'Avançar' },
          { text: 'Qual impacto essa lacuna ainda causa?', discovery: 'impacto', green: 'Impacto concreto', red: 'Sem impacto', if_green: 'Dimensionar' },
          { text: 'Quem precisa validar a demo?', discovery: 'decisor', green: 'Decisor nomeado', red: 'Decisão difusa', if_green: 'Convidar' },
          { text: 'Até quando precisam decidir?', discovery: 'prazo', green: 'Data clara', red: 'Sem urgência', if_green: 'Agendar' },
        ],
        do_not: ['Não repetir o diagnóstico já concluído.'],
        close_with: 'Abrir a agenda e marcar a demo de 25 minutos.',
        fallback_goal: 'Se a demo não fechar, sair com a lista de quem precisa participar dela.',
        landmine: { objection: 'Já temos uma plataforma.', ask: 'O que ela ainda não consegue comprovar?' },
      },
      perguntas: [
        { fase: 'analisar', descoberta: 'situacao_atual', texto: 'Como funciona hoje?', porque: 'Situação' },
        { fase: 'analisar', descoberta: 'impacto', texto: 'Qual o impacto?', porque: 'Impacto' },
        { fase: 'engajar', descoberta: 'decisor', texto: 'Quem decide?', porque: 'Decisão' },
        { fase: 'engajar', descoberta: 'prazo', texto: 'Qual o prazo?', porque: 'Prazo' },
      ],
      objecoes_provaveis: [],
    }, [], [], 'https://empresa.example', execution, {
      meetingKind: 'retorno',
      audience: 'Maria Souza, Head de T&D',
      goalThisHour: '',
      memory: {
        hasConversations: true,
        covered: ['situacao_atual', 'dor_principal'],
        pending: ['impacto', 'tentativas', 'criterio', 'decisor', 'orcamento', 'prazo'],
        nextStep: 'Retomar na quinta.',
        pains: ['PDI sem acompanhamento.'],
        objections: [],
        commitments: ['Enviar one-pager.'],
        anchorAnswers: [],
      },
    });

    expect(plan.play).toBeDefined();
    expect(plan.play?.kind).toBe('retorno');
    expect(plan.play?.mustAsk).toHaveLength(3);
    expect(plan.play?.mustAsk.map((item) => item.discovery)).toEqual(['impacto', 'decisor', 'prazo']);
    expect(plan.questions.map((item) => item.discovery)).not.toContain('situacao_atual');
    expect(plan.objectives.primary).toBe('Sair com uma demo de 25 minutos marcada até sexta.');
    expect(plan.objectives.primary).not.toContain('OBJETIVO PÚBLICO');
    // O reserva era apelido do `closeWith`: a tela rotulava o fechamento do objetivo
    // principal como alternativa, e o plano B do PACE nao existia.
    expect(plan.objectives.fallback).toBe('Se a demo não fechar, sair com a lista de quem precisa participar dela.');
    expect(plan.objectives.fallback).not.toBe(plan.play?.closeWith);
    expect(plan.facts[0].title).toBe('Expansão');
    expect(plan.play?.openers[0].factIndex).toBe(0);
    expect(plan.play?.openers[1].factIndex).toBeNull();
    expect(plan.play?.openers[1].say).not.toContain('sem fonte válida');
    expect(plan.gaps).toEqual(expect.arrayContaining(['impacto', 'tentativas', 'criterio', 'decisor', 'orcamento', 'prazo']));
    expect(plan.gaps).not.toContain('situacao_atual');
  });

  it('respeita a meta editada e degrada para três perguntas distintas sem reabrir chaves cobertas', () => {
    const covered = ['situacao_atual', 'dor_principal', 'impacto', 'tentativas', 'criterio', 'decisor', 'orcamento', 'prazo'] as const;
    const plan = normalizePlan({
      empresa_identificada: 'Conta conhecida', resumo_empresa: '', fatos_relevantes: [], tendencias_setor: [],
      hipoteses: [], metricas_roi: [], perguntas_estrategicas: [], riscos: [],
    }, {
      play: {
        goal_this_hour: 'Meta sugerida pela IA.',
        audience: 'Participante inventado',
        must_ask: [{ text: 'Como esse processo funciona hoje?', discovery: null }],
        openers: [],
      },
      perguntas: [], objecoes_provaveis: [],
    }, [], [], '', execution, {
      meetingKind: 'retorno',
      audience: 'João e Ana',
      goalThisHour: 'Confirmar a assinatura na sexta-feira.',
      memory: {
        hasConversations: true,
        covered: [...covered],
        pending: [],
        nextStep: 'Retomar contrato.',
        pains: [], objections: [], commitments: [], anchorAnswers: [],
      },
    });

    expect(plan.play?.goalThisHour).toBe('Confirmar a assinatura na sexta-feira.');
    expect(plan.play?.audience).toBe('João e Ana');
    expect(plan.play?.mustAsk).toHaveLength(3);
    expect(new Set(plan.play?.mustAsk.map((item) => item.text)).size).toBe(3);
    expect(plan.play?.mustAsk.every((item) => item.discovery === null)).toBe(true);
    expect(plan.play?.mustAsk.map((item) => item.text)).not.toContain('Como esse processo funciona hoje?');
    expect(plan.play?.doNot).toHaveLength(1);
    // Sem `fallback_goal` do modelo, o reserva ainda nasce com valor proprio e do tipo
    // certo de reuniao, em vez de repetir o fechamento do objetivo principal.
    expect(plan.play?.fallbackGoal).toContain('lista de quem precisa participar');
    expect(plan.objectives.fallback).toBe(plan.play?.fallbackGoal);
    expect(plan.objectives.fallback).not.toBe(plan.play?.closeWith);
  });

  it('na primeira conversa, mostra como lacuna apenas o que não está nas três must-ask', () => {
    const plan = normalizePlan({
      empresa_identificada: 'Nova conta', resumo_empresa: '', fatos_relevantes: [], tendencias_setor: [],
      hipoteses: [], metricas_roi: [], perguntas_estrategicas: [], riscos: [],
    }, {
      play: {
        must_ask: [
          { text: 'Como funciona hoje?', discovery: 'situacao_atual' },
          { text: 'Qual é a dor principal?', discovery: 'dor_principal' },
          { text: 'Que impacto isso provoca?', discovery: 'impacto' },
        ],
      },
      perguntas: [], objecoes_provaveis: [],
    }, [], [], '', execution, {
      meetingKind: 'primeira_conversa', audience: '', goalThisHour: '',
      memory: {
        hasConversations: false, covered: [],
        pending: ['situacao_atual', 'dor_principal', 'impacto', 'tentativas', 'criterio', 'decisor', 'orcamento', 'prazo'],
        nextStep: '', pains: [], objections: [], commitments: [], anchorAnswers: [],
      },
    });

    expect(plan.gaps).not.toContain('situacao_atual');
    expect(plan.gaps).not.toContain('dor_principal');
    expect(plan.gaps).not.toContain('impacto');
    expect(plan.gaps).toEqual(expect.arrayContaining(['tentativas', 'criterio', 'decisor', 'orcamento', 'prazo']));
  });
});
