import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Onda E (04/10/2026): o fechamento fala no idioma da PESSOA dona da trilha
 * (`colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR), como opção
 * EXPLÍCITA do `callAI`/`callAIChat` (e não pelo cookie da request, que o login por
 * senha nem sempre grava). Três chamadas são texto que a pessoa lê:
 *
 *  - `sem13_qualitativa`: a conversa da semana da acumulada (a 1ª chamada e o fechamento forçado);
 *  - `arguicao_turno`: a defesa oral (o `callAIChat` de cada turno);
 *  - `sem14_redacao`: a devolutiva final.
 *
 * Três NÃO recebem idioma: o scorer (`sem14_scorer`), o auditor (`sem14_check`) e as
 * extrações (`temporada_extracao`, `arguicao_avaliacao`). São JSON interno que o código
 * lê por nome de descritor. O mesmo vale para a pontuação por competência do Onboarding.
 *
 * Nomes e contatos sintéticos. Sem IA paga: tudo com mock.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  locale: { colab: null as string | null, empresa: null as string | null },
  afters: [] as Array<() => any>,
  callAI: vi.fn(),
  callAIChat: vi.fn(),
  reservar: vi.fn(),
  finalizar: vi.fn(),
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
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/fechamento-core', () => ({ reservarFinalizacao: h.reservar, finalizarFechamentoCore: h.finalizar }));
vi.mock('@/lib/season-engine/avaliacao-acumulada-core', () => ({ gerarAvaliacaoAcumuladaCore: h.acumulada }));

import { POST } from '@/app/api/temporada/evaluation/route';
import { PROGRAMA_ONBOARDING, PROGRAMA_REGULAR_DUO } from '@/lib/season-engine/programa-config';
import { abrirArguicao, turnoArguicao, extrairEvidenciasArguicao, type ArguicaoContexto } from '@/lib/season-engine/arguicao';
import { pontuarFechamento, redigirDevolutivaFinal } from '@/lib/season-engine/fechamento-scorer';

const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
const DIMENSOES = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'];
const PERGUNTAS = DIMENSOES.map((d) => ({ dimensao: d, texto: `pergunta ${d}` }));
const COLAB = { nome_completo: 'Ana Souza', cargo: 'Professora', perfil_dominante: 'S' };

const TRILHA = (extra: Record<string, unknown> = {}) => ({
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: COMPS[0], competencias_foco: COMPS,
  temporada_plano: [], descritores_selecionados: COMPS.map((c) => ({ competencia: c, descritor: `${c}-d1` })),
  data_inicio: '2026-07-01', programa_modo: 'onboarding', programa_config: {}, ...extra,
});

function transcriptDe(respondidas: number) {
  const t: any[] = [{ role: 'assistant', content: `**${DIMENSOES[0]}**`, turn: 1 }];
  for (let i = 0; i < respondidas; i++) {
    t.push({ role: 'user', content: `resposta ${i + 1}` });
    if (i < 3) t.push({ role: 'assistant', content: `**${DIMENSOES[i + 1]}**`, turn: i + 2 });
  }
  return t;
}
/** `argumentos[i]` é a arguição do cenário i (a de cada competência, como na Jornada); ausente = ainda não aberta. */
const slotOnboarding = (respondidas: number[], argumentos: any[] = []) => ({
  cenarios: COMPS.map((competencia, i) => ({
    competencia, cenario_b_id: `b-${i}`, cenario: `## Caso ${competencia}`, perguntas: PERGUNTAS, transcript_completo: transcriptDe(respondidas[i]),
    ...(argumentos[i] ? { arguicao: argumentos[i] } : {}),
  })),
});
const DEFESA_CONCLUIDA = { turno: 6, concluida: true, historico: [], extracao: null };

const req = (body: any) => new Request('http://escola.vertho.ai/api/temporada/evaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', ...body }),
});

let trilha: any;
const montar = () => {
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return trilha;
      if (tabela === 'colaboradores') return { ...COLAB, locale: h.locale.colab };
      if (tabela === 'empresas') return { default_locale: h.locale.empresa };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
  });
};

beforeEach(() => {
  for (const f of [h.callAI, h.callAIChat, h.reservar, h.finalizar, h.acumulada]) f.mockReset();
  h.afters = [];
  h.locale = { colab: null, empresa: null };
  h.reservar.mockResolvedValue({ ok: true, token: '2026-10-04T15:00:00.000Z' });
  h.finalizar.mockResolvedValue({ ok: true });
  h.callAIChat.mockResolvedValue('Obrigado pela conversa. Leve isso para a sua próxima semana.');
  h.callAI.mockResolvedValue('{}');
  trilha = TRILHA();
  h.config = { ...PROGRAMA_ONBOARDING, arguicao: { ativa: true, maxTurnos: 6 } };
  h.prog = null;
  montar();
});

const idiomasLidos = () => h.sb.chamadas.filter((c: any) => c.tabela === 'colaboradores' && c.metodo === 'select' && c.args[0] === 'locale').length;

// ── sem13_qualitativa: a conversa da semana da acumulada ─────────────────────
describe('a conversa da acumulada (sem13_qualitativa) sai no idioma da pessoa', () => {
  const QUAL = () => {
    h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanas: 9, semanaAcumulada: 8, semanaCenarioB: 9, turnosQualitativa: 2 };
    trilha = TRILHA({ competencias_foco: ['Comp A'], programa_modo: 'regular_duo' });
    h.prog = { id: 'p8', empresa_id: 'emp-1', semana: 8, reflexao: { transcript_completo: [{ role: 'assistant', content: 'Como foi a jornada?' }] } };
    montar();
  };
  const enviar = () => POST(req({ semana: 8, action: 'send', message: 'Foi bom.' }));

  it('o `callAIChat` recebe o idioma da pessoa; sem o dela, o da empresa; sem nenhum, pt-BR explícito', async () => {
    h.locale = { colab: 'es-ES', empresa: 'en-US' };
    QUAL();
    expect((await enviar()).status).toBe(200);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'sem13_qualitativa', empresaId: 'emp-1', colaboradorId: 'col-1', locale: 'es-ES' });

    h.callAIChat.mockClear();
    h.locale = { colab: null, empresa: 'pt-PT' };
    QUAL();
    await enviar();
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-PT');

    h.callAIChat.mockClear();
    h.locale = { colab: null, empresa: null };
    QUAL();
    await enviar();
    expect(h.callAIChat.mock.calls[0][4].locale).toBe('pt-BR');
  });

  it('o fechamento forçado (a 2ª chamada, quando a 1ª terminou em pergunta) fala no MESMO idioma', async () => {
    h.locale = { colab: 'en-US', empresa: null };
    QUAL();
    h.callAIChat.mockResolvedValueOnce('E o que você percebe que ainda falta?').mockResolvedValueOnce('Obrigado pela conversa. Leve isso para a sua próxima semana.');
    await enviar();
    expect(h.callAIChat).toHaveBeenCalledTimes(2);
    for (const chamada of h.callAIChat.mock.calls) expect(chamada[4]).toMatchObject({ taskKey: 'sem13_qualitativa', locale: 'en-US' });
  });

  it('a extração do fim da conversa (temporada_extracao, JSON interno) NÃO recebe idioma', async () => {
    h.locale = { colab: 'en-US', empresa: null };
    QUAL();
    await enviar();
    const extracoes = h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === 'temporada_extracao');
    expect(extracoes.length).toBeGreaterThan(0);
    for (const c of extracoes) expect(c[4]).not.toHaveProperty('locale');
  });
});

// ── arguição: o idioma chega ao ctx, e o ctx ao callAIChat ───────────────────
describe('a arguição (arguicao_turno) fala no idioma da pessoa', () => {
  it('a rota põe o idioma da pessoa no contexto que abre a arguição do cenário (uma por competência)', async () => {
    h.locale = { colab: 'es-ES', empresa: 'en-US' };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotOnboarding([4, 4, 4, 4, 3], Array(4).fill(DEFESA_CONCLUIDA)) };
    montar();
    // `arguicao` real: o contexto chega ao `callAIChat` do turno
    h.callAIChat.mockResolvedValue('Vamos conversar sobre a sua resposta.\n[META]{"turno":1,"encerrar":false}[/META]');
    const res = await POST(req({ semana: 12, action: 'send', message: 'resposta 20' }));
    expect((await res.json()).arguindo).toBe(true);
    expect(h.callAIChat).toHaveBeenCalledTimes(1);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'arguicao_turno', locale: 'es-ES' });
  });

  it('cada turno seguinte (arguir) leva o mesmo idioma; a extração das evidências, não', async () => {
    h.locale = { colab: 'en-US', empresa: null };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotOnboarding([4, 4, 4, 4, 4], [...Array(4).fill(DEFESA_CONCLUIDA), { turno: 5, concluida: false, historico: [{ role: 'user', content: '═══ CENÁRIO' }] }]) };
    montar();
    h.callAIChat.mockResolvedValue('Obrigado, era isso.\n[META]{"turno":6,"encerrar":true}[/META]');
    h.callAI.mockResolvedValue(JSON.stringify({ resumo: { leitura_geral: '', sustentacao_mais_forte: '', fragilidade_mais_relevante: '' }, evidencias_por_descritor: [] }));
    const body = await (await POST(req({ semana: 12, action: 'arguir', message: 'minha defesa' }))).json();
    expect(body.arguicaoConcluida).toBe(true);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'arguicao_turno', locale: 'en-US' });
    const extracao = h.callAI.mock.calls.find((c: any[]) => c[4]?.taskKey === 'arguicao_avaliacao');
    expect(extracao).toBeTruthy();
    expect(extracao![4]).not.toHaveProperty('locale');
  });

  it('no cenário único (Jornada) a arguição também leva o idioma da pessoa', async () => {
    h.locale = { colab: 'pt-PT', empresa: null };
    h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanaAcumulada: 8, semanaCenarioB: 9, arguicao: { ativa: true, maxTurnos: 6 } };
    trilha = TRILHA({ competencias_foco: ['Comp A'], programa_modo: 'regular_duo' });
    h.prog = { id: 'p9', status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcriptDe(3) } };
    montar();
    h.callAIChat.mockResolvedValue('Vamos conversar.\n[META]{"turno":1,"encerrar":false}[/META]');
    const res = await POST(req({ semana: 9, action: 'send', message: 'resposta 4' }));
    expect((await res.json()).arguindo).toBe(true);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'arguicao_turno', locale: 'pt-PT' });
  });

  it('o módulo da arguição repassa `ctx.locale` ao callAIChat; sem ele, a chamada não ganha a chave (cai no cookie, como antes)', async () => {
    const ctx: ArguicaoContexto = {
      nomeColab: 'Ana', competencia: 'Comp A', cenario: '## C', respostaCenario: 'r', descritores: [{ descritor: 'D1' }], isPiloto: false,
    };
    h.callAIChat.mockResolvedValue('Pergunta.\n[META]{"turno":1,"encerrar":false}[/META]');
    await abrirArguicao({ ...ctx, locale: 'en-US' }, 6);
    const { estado } = await abrirArguicao(ctx, 6);
    expect(h.callAIChat.mock.calls[0][4]).toMatchObject({ taskKey: 'arguicao_turno', locale: 'en-US' });
    expect(h.callAIChat.mock.calls[1][4]).not.toHaveProperty('locale');
    await turnoArguicao({ ...ctx, locale: 'es-ES' }, estado, 'minha resposta', 6);
    expect(h.callAIChat.mock.calls[2][4]).toMatchObject({ taskKey: 'arguicao_turno', locale: 'es-ES' });
    h.callAI.mockResolvedValue('{"resumo":{},"evidencias_por_descritor":[]}');
    await extrairEvidenciasArguicao({ ...ctx, locale: 'es-ES' }, estado);
    expect(h.callAI.mock.calls[0][4]).toMatchObject({ taskKey: 'arguicao_avaliacao' });
    expect(h.callAI.mock.calls[0][4]).not.toHaveProperty('locale');
  });
});

// ── a pontuação: o idioma da pessoa só chega à redação ───────────────────────
describe('a devolutiva final (sem14_redacao) sai no idioma da pessoa; o scorer e o auditor não recebem idioma', () => {
  const descritoresDe = (c: string) => [1, 2].map((n) => ({ competencia: c, descritor: `${c}-d${n}`, nota_atual: 2, n3_meta: 'meta' }));
  const saida = (c: string) => JSON.stringify({
    avaliacao_por_descritor: descritoresDe(c).map((d) => ({ descritor: d.descritor, nota_pre: 2, nota_cenario: 3, nota_pos: 3, justificativa: 'j' })),
    resumo_avaliacao: { mensagem_geral: `texto ${c}`, principal_avanco: 'a', principal_ponto_de_atencao: 'p', mensagem_final: 'f' },
  });
  const REDACAO = JSON.stringify({ resumo_avaliacao: { mensagem_geral: 'Ana, uma devolutiva só.', evidencias_citadas: [], principal_avanco: 'a', principal_ponto_de_atencao: 'p', mensagem_final: 'Fecho em segunda pessoa.', proximos_passos: [] } });
  const CHECK = JSON.stringify({ nota_auditoria: 90, status: 'aprovado', resumo_auditoria: 'ok' });
  const ai = () => h.callAI.mockImplementation(async (_s: any, user: any, _c: any, _m: any, o: any) => {
    if (o.taskKey === 'sem14_scorer') return saida(/COMPETÊNCIA: (.*)\n/.exec(user)![1]);
    if (o.taskKey === 'sem14_redacao') return REDACAO;
    return CHECK;
  });
  const porTask = (k: string) => h.callAI.mock.calls.filter((c: any[]) => c[4]?.taskKey === k);

  const base = (extra: Record<string, unknown> = {}) => ({
    competencia: 'Comp A', descritores: descritoresDe('Comp A'), cenario: '## C', resposta: 'r', nomeColab: 'Alias',
    evidenciasAcumuladas: 'e', acumuladoPrimaria: null, config: { ...PROGRAMA_ONBOARDING }, ...extra,
  });
  const entradas = () => COMPS.map((c) => ({ competencia: c, descritores: descritoresDe(c), cenario: `## ${c}`, resposta: 'r', evidenciasAcumuladas: 'e', acumuladoPrimaria: null }));
  const conjunto = () => ({ ...base({ competencia: COMPS.join(' + '), descritores: COMPS.flatMap(descritoresDe), porCompetencia: entradas() }) });

  it('Onboarding (5 scorers por competência): o idioma vai SÓ à redação', async () => {
    ai();
    const r: any = await pontuarFechamento({ ...conjunto(), locale: 'en-US' } as any);
    expect(r.ok).toBe(true);
    expect(porTask('sem14_scorer')).toHaveLength(5);
    for (const c of porTask('sem14_scorer')) expect(c[4]).not.toHaveProperty('locale');
    expect(porTask('sem14_redacao')).toHaveLength(1);
    expect(porTask('sem14_redacao')[0][4]).toMatchObject({ taskKey: 'sem14_redacao', locale: 'en-US' });
    expect(porTask('sem14_check')).toHaveLength(1);
    expect(porTask('sem14_check')[0][4]).not.toHaveProperty('locale');
  });

  it('o fechamento de uma competência (redação por nota alterada pela arguição): idem', async () => {
    ai();
    const evidenciasArguicao = {
      resumo: { leitura_geral: 'l', sustentacao_mais_forte: 's', fragilidade_mais_relevante: 'f' },
      evidencias_por_descritor: [{ descritor: 'Comp A-d1', sustentou: 'aprofundou', forca: 'forte', citacao: 'c' }],
    };
    await pontuarFechamento({ ...base({ evidenciasArguicao }), locale: 'es-ES' } as any);
    expect(porTask('sem14_scorer')).toHaveLength(1);
    expect(porTask('sem14_scorer')[0][4]).not.toHaveProperty('locale');
    expect(porTask('sem14_redacao')[0][4]).toMatchObject({ locale: 'es-ES' });
    expect(porTask('sem14_check')[0][4]).not.toHaveProperty('locale');
  });

  it('sem idioma no argumento, a redação não ganha a chave (cai no cookie, como antes)', async () => {
    ai();
    await pontuarFechamento(conjunto() as any);
    expect(porTask('sem14_redacao')[0][4]).not.toHaveProperty('locale');
  });

  it('`redigirDevolutivaFinal` (também a da recuperação) leva o idioma ao callAI', async () => {
    h.callAI.mockResolvedValue(REDACAO);
    const args = {
      competencia: 'Comp A', nomeColab: 'Alias', config: { ...PROGRAMA_ONBOARDING },
      descritores: [{ descritor: 'D1', nota_pre: 2, nota_rascunho: 2.5, nota_final: 3 }], rascunho: { mensagem_geral: 'r' },
    } as any;
    await redigirDevolutivaFinal({ ...args, locale: 'pt-PT' });
    expect(h.callAI.mock.calls[0][4]).toMatchObject({ taskKey: 'sem14_redacao', locale: 'pt-PT' });
    await redigirDevolutivaFinal(args);
    expect(h.callAI.mock.calls[1][4]).not.toHaveProperty('locale');
  });

  it('a rota entrega o idioma da pessoa ao núcleo da pontuação (que o repassa só à redação)', async () => {
    h.locale = { colab: 'es-ES', empresa: 'en-US' };
    h.config = { ...PROGRAMA_ONBOARDING, arguicao: { ativa: false, maxTurnos: 0 } };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotOnboarding([4, 4, 4, 4, 3]) };
    montar();
    const body = await (await POST(req({ semana: 12, action: 'send', message: 'resposta 20' }))).json();
    expect(body.finalizando).toBe(true);
    await h.afters[0]();
    expect(h.finalizar.mock.calls[0][1]).toMatchObject({ empresaId: 'emp-1', locale: 'es-ES' });
  });
});

describe('o polling da tela (ações de leitura) não paga a leitura do idioma', () => {
  it('fechamento_status não consulta o idioma; uma ação que escreve consulta', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotOnboarding([4, 4, 2, 0, 0], [DEFESA_CONCLUIDA, DEFESA_CONCLUIDA]) };
    montar();
    await POST(req({ semana: 12, action: 'fechamento_status' }));
    expect(idiomasLidos()).toBe(0);
    await POST(req({ semana: 12, action: 'send', message: 'resposta' }));
    expect(idiomasLidos()).toBeGreaterThan(0);
  });
});
