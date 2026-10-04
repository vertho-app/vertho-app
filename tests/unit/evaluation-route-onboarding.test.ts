import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * `/api/temporada/evaluation` no fechamento do ONBOARDING: 5 cenários em sequência,
 * um por competência, com 4 perguntas cada (20 respostas), na ordem das competências
 * da trilha. O B de cada competência é o que o lote da Fase 5 gera por célula. O
 * integrador da Onda D (um caso, uma pergunta por competência) saiu a pedido do dono
 * (04/10/2026).
 *
 * A ARGUIÇÃO segue o padrão da Jornada, repetido por cenário: depois das 4 respostas de
 * cada cenário abre a arguição DAQUELA competência (mesmas regras do modo, sondando os
 * descritores dela), e só depois vem o cenário seguinte. Ao fim do 5º, a pontuação.
 *
 * O formato de UMA competência (Jornada, Personalizado, DUO de Ibipeba, piloto) não
 * pode mudar: o último bloco prova a forma exata do slot que ele grava.
 */

const h = vi.hoisted(() => ({
  sb: null as any,
  prog: null as any,
  config: null as any,
  trilha: null as any,
  after: vi.fn(),
  reservar: vi.fn(),
  finalizar: vi.fn(),
  turno: vi.fn(),
  extrair: vi.fn(),
  abrir: vi.fn(),
}));

vi.mock('next/server', async (orig) => ({ ...(await orig<any>()), after: h.after }));
vi.mock('@/lib/csrf', () => ({ csrfCheck: () => null }));
vi.mock('@/lib/rate-limit', () => ({ aiLimiter: { check: async () => null } }));
vi.mock('@/lib/auth/request-context', () => ({
  requireUser: async () => ({ email: 'ana@empresa.br', empresaId: 'emp-1', role: 'colaborador', isPlatformAdmin: false, colaborador: { id: 'col-1' } }),
  assertColabAccess: async () => null,
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.sb.client }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(), callAIChat: vi.fn() }));
vi.mock('@/lib/execucao-contexto', () => ({ comContexto: (_c: any, fn: any) => fn() }));
vi.mock('@/lib/season-engine/trilha-runtime', () => ({
  resolverConfigDaTrilha: async () => h.config,
  checarGatesSemana: async () => null,
  gateAcumuladaPiloto: () => ({ pronto: true, redisparar: false }),
  qualitativaDoPlano: () => null,
}));
vi.mock('@/lib/season-engine/fechamento-core', () => ({
  reservarFinalizacao: h.reservar,
  finalizarFechamentoCore: h.finalizar,
}));
vi.mock('@/lib/season-engine/arguicao', () => ({
  abrirArguicao: h.abrir,
  turnoArguicao: h.turno,
  extrairEvidenciasArguicao: h.extrair,
}));

import { POST } from '@/app/api/temporada/evaluation/route';
import { PROGRAMA_ONBOARDING, PROGRAMA_REGULAR_DUO, PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';

const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
const DIMENSOES = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'];
const PERGUNTAS = DIMENSOES.map((d) => ({ dimensao: d, texto: `pergunta ${d}` }));

/** O B por célula de cada competência, como o lote da Fase 5 grava. */
const bDe = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `b-${i}`, titulo: `Caso ${COMPS[i]}`, descricao: `texto do caso ${COMPS[i]}`, cargo: 'Professor', competencia_id: `c${i}`,
  created_at: '2026-09-10T12:00:00Z',
  alternativas: { p1: `${COMPS[i]} p1`, p2: `${COMPS[i]} p2`, p3: `${COMPS[i]} p3`, p4: `${COMPS[i]} p4`, ...extra },
});
const TODOS_OS_B = () => COMPS.map((_, i) => bDe(i));

/** O transcript de um cenário com `n` respostas, com a próxima pergunta já aberta. */
function transcript(n: number, aberta = true) {
  const t: any[] = [{ role: 'assistant', content: `**${DIMENSOES[0]}**\n\npergunta ${DIMENSOES[0]}`, turn: 1 }];
  for (let i = 0; i < n; i++) {
    t.push({ role: 'user', content: `resposta ${i + 1}` });
    if (i < 3 && (aberta || i < n - 1)) t.push({ role: 'assistant', content: `**${DIMENSOES[i + 1]}**\n\npergunta ${DIMENSOES[i + 1]}`, turn: i + 2 });
  }
  return t;
}
/**
 * O slot do fechamento: `respondidas[i]` respostas no cenário `i` e `argumentos[i]` a arguição dele (ausente =
 * ainda não aberta). Um cenário já vem com a 1ª pergunta aberta quando o anterior terminou (as respostas e,
 * com a arguição ligada, a defesa); os de depois ficam vazios, como o servidor os deixa.
 */
function slotComCenarios(respondidas: number[], argumentos: any[] = [], { arguicaoLigada = true, ...extra }: Record<string, any> = {}) {
  return {
    cenarios: COMPS.map((competencia, i) => {
      const anteriorTerminou = i === 0 || (respondidas[i - 1] >= 4 && (!arguicaoLigada || !!argumentos[i - 1]?.concluida));
      return {
        competencia, cenario_b_id: `b-${i}`, cenario: `## Caso ${competencia}\n\ntexto do caso ${competencia}`, perguntas: PERGUNTAS,
        transcript_completo: respondidas[i] > 0 || anteriorTerminou ? transcript(respondidas[i]) : [],
        ...(argumentos[i] ? { arguicao: argumentos[i] } : {}),
      };
    }),
    ...extra,
  };
}
/** A arguição de um cenário: em andamento, ou concluída (com a extração dele). */
const ARG = (concluida: boolean, competencia = 'Comp A') => ({
  turno: concluida ? 6 : 2, concluida, historico: [{ role: 'assistant', content: `pergunta de ${competencia}` }],
  ...(concluida ? { extracao: { resumo: { leitura_geral: `leitura de ${competencia}` }, evidencias_por_descritor: [] } } : {}),
});

const TRILHA_ONB = {
  id: 'tr-1', colaborador_id: 'col-1', empresa_id: 'emp-1', competencia_foco: COMPS[0], competencias_foco: COMPS,
  temporada_plano: [], descritores_selecionados: COMPS.flatMap((c) => [1, 2, 3, 4].map((n) => ({ competencia: c, descritor: `${c}-d${n}` }))),
  data_inicio: '2026-07-01', programa_modo: 'onboarding', programa_config: {},
};

const req = (body: any) => new Request('http://escola.vertho.ai/api/temporada/evaluation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trilhaId: 'tr-1', semana: 12, ...body }),
});
const escritasProgresso = () => h.sb.escritas.filter((e: any) => e.tabela === 'temporada_semana_progresso');
const ultimoSlot = () => escritasProgresso().at(-1)!.payload.feedback;

/** O mapeamento (Cenário A) de cada competência: os 6 descritores que a arguição sonda e o scorer pontua. */
const MAPEAMENTO = COMPS.flatMap((c) => [1, 2, 3, 4, 5, 6].map((n) => ({ competencia: c, descritor: `${c}-d${n}`, nota: 1 + n / 4 })));
let bancoB: any[] = [];
function montar() {
  h.sb = criarSupabaseMock({
    resolver: (tabela) => {
      if (tabela === 'trilhas') return h.trilha;
      if (tabela === 'colaboradores') return { nome_completo: 'Ana Souza', cargo: 'Professor', perfil_dominante: 'S' };
      if (tabela === 'temporada_semana_progresso') return h.prog;
      return null;
    },
    lista: (tabela) => (tabela === 'banco_cenarios' ? bancoB
      : tabela === 'competencias' ? COMPS.map((nome, i) => ({ id: `c${i}`, nome }))
        : tabela === 'descriptor_assessments' ? MAPEAMENTO : []),
  });
}

beforeEach(() => {
  for (const f of [h.after, h.reservar, h.finalizar, h.turno, h.extrair, h.abrir]) f.mockReset();
  h.reservar.mockResolvedValue({ ok: true, token: '2026-10-04T15:00:00.000Z' });
  h.finalizar.mockResolvedValue({ ok: true });
  h.config = { ...PROGRAMA_ONBOARDING, arguicao: { ativa: true, maxTurnos: 6 } };
  h.trilha = TRILHA_ONB;
  h.prog = null;
  bancoB = TODOS_OS_B();
  montar();
});

describe('init: os 5 cenários, um por competência', () => {
  it('serve o B de cada competência, na ordem da trilha, com 4 perguntas cada, e abre só a 1ª pergunta do 1º cenário', async () => {
    const res = await POST(req({ action: 'init' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cenarios.map((c: any) => c.competencia)).toEqual(COMPS);
    expect(body.cenarios.map((c: any) => c.cenario_b_id)).toEqual(['b-0', 'b-1', 'b-2', 'b-3', 'b-4']);
    expect(body.cenarios[2].cenario).toBe('## Caso Comp C\n\ntexto do caso Comp C');
    for (const c of body.cenarios) expect(c.perguntas.map((p: any) => p.dimensao)).toEqual(DIMENSOES);
    expect(body.cenarios[0].transcript_completo).toEqual([
      expect.objectContaining({ role: 'assistant', turn: 1, dimensao: 'SITUAÇÃO', content: '**SITUAÇÃO**\n\nComp A p1' }),
    ]);
    for (const c of body.cenarios.slice(1)) expect(c.transcript_completo).toEqual([]);
  });

  it('o slot guarda a LISTA (cada cenário com id do B, texto, perguntas e a conversa), sem o formato de uma competência por cima', async () => {
    await POST(req({ action: 'init' }));
    const slot = ultimoSlot();
    expect(Object.keys(slot)).toEqual(['cenarios']);
    expect(Object.keys(slot.cenarios[0]).sort()).toEqual(['cenario', 'cenario_b_id', 'competencia', 'perguntas', 'transcript_completo']);
    expect(escritasProgresso()[0].payload).toMatchObject({ semana: 12, tipo: 'avaliacao', status: 'em_andamento' });
  });

  it('falta o B de duas competências: 424 com o NOME delas, e nada é gravado', async () => {
    bancoB = [bDe(0), bDe(2), bDe(3)];
    montar();
    const res = await POST(req({ action: 'init' }));
    expect(res.status).toBe(424);
    expect((await res.json()).error).toBe('Cenário B não cadastrado para Comp B + Comp E + cargo Professor.');
    expect(escritasProgresso()).toHaveLength(0);
  });

  it('B de uma competência sem perguntas: 424 diz qual', async () => {
    bancoB = TODOS_OS_B();
    bancoB[1] = { ...bDe(1), alternativas: { p1: '', p2: '  ' } };
    montar();
    const res = await POST(req({ action: 'init' }));
    // sem nenhuma pergunta o B nem é elegível (cenarioBUsavel): cai no "não cadastrado" da competência
    expect(res.status).toBe(424);
    expect((await res.json()).error).toContain('Comp B');
  });

  it('retomada: slot que já tem os cenários é servido como está, sem reler o banco nem reabrir pergunta', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 2, 0, 0]) };
    montar();
    const res = await POST(req({ action: 'init' }));
    const body = await res.json();
    expect(body.cenarios).toHaveLength(5);
    expect(body.cenarios[2].transcript_completo).toEqual(transcript(2));
    expect(h.sb.usou('banco_cenarios', 'eq', 'empresa_id')).toBe(false);
    expect(ultimoSlot().cenarios[2].transcript_completo).toEqual(transcript(2));
  });

  it('retomada no meio da defesa oral do cenário 1: o cenário 2 continua FECHADO (só abre depois da defesa)', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0], [ARG(false)]) };
    montar();
    const body = await (await POST(req({ action: 'init' }))).json();
    expect(body.cenarios[1].transcript_completo).toEqual([]);
    expect(body.cenarios[0].arguicao).toMatchObject({ turno: 2, concluida: false });
    expect(ultimoSlot().cenarios[1].transcript_completo).toEqual([]);
  });
});

describe('send: cada resposta entra no cenário em que a pessoa está', () => {
  it('1ª resposta do cenário 1: grava nele e abre a pergunta 2 (AÇÃO), com a posição na resposta', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([0, 0, 0, 0, 0]) };
    montar();
    const res = await POST(req({ action: 'send', message: 'minha resposta 1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ finished: false, dimensao: 'AÇÃO', cenarioIndex: 0, perguntaIndex: 1 });
    expect(body.message).toBe('**AÇÃO**\n\npergunta AÇÃO');
    const c0 = ultimoSlot().cenarios[0].transcript_completo;
    expect(c0.filter((m: any) => m.role === 'user').map((m: any) => m.content)).toEqual(['minha resposta 1']);
    expect(c0.at(-1)).toMatchObject({ role: 'assistant', turn: 2, dimensao: 'AÇÃO' });
    expect(h.reservar).not.toHaveBeenCalled();
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it('4ª resposta do cenário 1 com a arguição ligada: abre a arguição DAQUELA competência, e o cenário 2 continua fechado', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([3, 0, 0, 0, 0]) };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar sobre o caso A.' });
    montar();
    const body = await (await POST(req({ action: 'send', message: 'resposta 4' }))).json();
    expect(body).toMatchObject({ arguindo: true, arguicaoConcluida: false, message: 'Vamos conversar sobre o caso A.', turno: 1, finished: false, cenarioIndex: 0 });
    expect(body).not.toHaveProperty('proximoCenario');
    // o contexto é o da Jornada, sobre UM cenário: a competência, o caso e as 4 respostas dele
    expect(h.abrir).toHaveBeenCalledTimes(1);
    const ctx = h.abrir.mock.calls[0][0];
    expect(ctx.competencia).toBe('Comp A');
    expect(ctx.cenario).toBe('## Caso Comp A\n\ntexto do caso Comp A');
    expect((ctx.respostaCenario.match(/→ /g) || []).length).toBe(4);
    expect(ctx.respostaCenario).toContain('→ resposta 4');
    expect(ctx).not.toHaveProperty('cenarios');
    // sonda os 6 descritores DELA (os do Cenário A), e só os dela
    expect(ctx.descritores.map((d: any) => d.descritor)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Comp A-d${n}`));
    expect(h.abrir.mock.calls[0][1]).toBe(6); // maxTurnos do modo
    const slot = ultimoSlot();
    expect(slot.cenarios[0].arguicao).toMatchObject({ turno: 1, concluida: false });
    expect(slot.cenarios[0].transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(slot.cenarios[1].transcript_completo).toEqual([]);
    expect(slot).not.toHaveProperty('arguicao');
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('4ª resposta do cenário 1 com a arguição DESLIGADA: fecha o cenário e abre a 1ª pergunta do cenário 2', async () => {
    h.config = { ...h.config, arguicao: { ativa: false, maxTurnos: 0 } };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([3, 0, 0, 0, 0], [], { arguicaoLigada: false }) };
    montar();
    const body = await (await POST(req({ action: 'send', message: 'resposta 4' }))).json();
    expect(body).toMatchObject({ finished: false, proximoCenario: true, cenarioConcluido: 0, cenarioIndex: 1, dimensao: 'SITUAÇÃO' });
    expect(body.history).toEqual([expect.objectContaining({ role: 'assistant', turn: 1, dimensao: 'SITUAÇÃO' })]);
    const slot = ultimoSlot();
    expect(slot.cenarios[0].transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(slot.cenarios[1].transcript_completo).toEqual([expect.objectContaining({ role: 'assistant', turn: 1, dimensao: 'SITUAÇÃO' })]);
    expect(h.abrir).not.toHaveBeenCalled();
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('retomada no meio do 3º cenário (as defesas dos dois primeiros concluídas): a resposta entra nele', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 2, 0, 0], [ARG(true), ARG(true, 'Comp B')]) };
    montar();
    const body = await (await POST(req({ action: 'send', message: 'resposta 3 do cenário 3' }))).json();
    expect(body).toMatchObject({ cenarioIndex: 2, perguntaIndex: 3, dimensao: 'AUTOSSENSIBILIDADE' });
    const slot = ultimoSlot();
    expect(slot.cenarios[2].transcript_completo.filter((m: any) => m.role === 'user').map((m: any) => m.content)).toEqual(['resposta 1', 'resposta 2', 'resposta 3 do cenário 3']);
    expect(slot.cenarios[0].transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(4);
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it('20ª resposta (cenário 5) com a arguição ligada: abre a arguição de Comp E, sem pontuar', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 4, 3], [ARG(true), ARG(true, 'Comp B'), ARG(true, 'Comp C'), ARG(true, 'Comp D')]) };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar.' });
    montar();
    const body = await (await POST(req({ action: 'send', message: 'resposta 20' }))).json();
    expect(body).toMatchObject({ arguindo: true, arguicaoConcluida: false, message: 'Vamos conversar.', turno: 1, cenarioIndex: 4 });
    expect(h.abrir.mock.calls[0][0].competencia).toBe('Comp E');
    expect(h.abrir.mock.calls[0][0].respostaCenario).toContain('→ resposta 20');
    expect(ultimoSlot().cenarios[4].arguicao).toMatchObject({ turno: 1, concluida: false });
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('20ª resposta com a arguição DESLIGADA: grava e dispara a pontuação pelo mesmo caminho (reserva + after)', async () => {
    h.config = { ...h.config, arguicao: { ativa: false, maxTurnos: 0 } };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 4, 3], [], { arguicaoLigada: false }) };
    montar();
    const body = await (await POST(req({ action: 'send', message: 'resposta 20' }))).json();
    expect(body).toMatchObject({ finalizando: true, fechamento: 'processando', finished: false });
    expect(h.reservar).toHaveBeenCalledWith('tr-1', { empresaId: 'emp-1' });
    expect(h.after).toHaveBeenCalledTimes(1);
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it('cenário respondido e a defesa dele ainda não aberta (a abertura falhou): `send` SEM mensagem a abre, sem empurrar fala', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 0, 0, 0], [ARG(true)]) };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar sobre B.' });
    montar();
    const res = await POST(req({ action: 'send' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ arguindo: true, turno: 1, cenarioIndex: 1 });
    expect(h.abrir.mock.calls[0][0].competencia).toBe('Comp B');
    const slot = ultimoSlot();
    expect(slot.cenarios.flatMap((c: any) => c.transcript_completo).filter((m: any) => m.role === 'user')).toHaveLength(8);
  });

  it('o mesmo caso com uma mensagem (reenvio): abre a defesa e a fala NÃO entra no cenário', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0]) };
    h.abrir.mockResolvedValue({ estado: { turno: 1, concluida: false, historico: [] }, reply: 'Vamos conversar.' });
    montar();
    const res = await POST(req({ action: 'send', message: 'reenvio' }));
    expect((await res.json()).arguindo).toBe(true);
    expect(JSON.stringify(ultimoSlot())).not.toContain('reenvio');
  });

  it('cenário respondido com a defesa EM ANDAMENTO: 409 (quem a conduz é `arguir`), sem fala nova', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0], [ARG(false)]) };
    montar();
    const res = await POST(req({ action: 'send', message: 'mais uma' }));
    expect(res.status).toBe(409);
    expect((await res.json()).fechamento).toBe('arguindo');
    expect(escritasProgresso()).toHaveLength(0);
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it('as 20 respondidas e as 5 defesas concluídas, sem nota: 409, sem fala nova, sem pontuação', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 4, 4], COMPS.map((c) => ARG(true, c))) };
    montar();
    const res = await POST(req({ action: 'send', message: 'mais uma' }));
    expect(res.status).toBe(409);
    expect((await res.json()).fechamento).toBe('pronto-para-pontuar');
    expect(escritasProgresso()).toHaveLength(0);
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('sem mensagem (fora da retomada da defesa): 400', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([1, 0, 0, 0, 0]) };
    montar();
    expect((await POST(req({ action: 'send' }))).status).toBe(400);
  });

  it('o mapeamento não pode ser lido ao abrir a defesa: 500 com o motivo, e a IA NÃO é chamada', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([3, 0, 0, 0, 0]) };
    montar();
    h.sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'pool esgotado' });
    const res = await POST(req({ action: 'send', message: 'resposta 4' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('pool esgotado');
    expect(h.abrir).not.toHaveBeenCalled();
  });

  it('sem init antes: o slot sem cenários cai no "cenário não iniciado" de sempre (400)', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: {} };
    montar();
    const res = await POST(req({ action: 'send', message: 'x' }));
    expect(res.status).toBe(400);
  });
});

describe('arguir: a defesa oral de cada cenário, uma de cada vez', () => {
  const TURNO_CONCLUIDO = { estado: { turno: 6, concluida: true, historico: [] }, reply: 'Obrigado.', concluida: true };

  it('um turno: o contexto é o do cenário em que a pessoa está (a competência, o caso e as respostas dele), e a defesa fica nele', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 0, 0], [ARG(true), ARG(true, 'Comp B'), ARG(false, 'Comp C')]) };
    h.turno.mockResolvedValue({ estado: { turno: 3, concluida: false, historico: [] }, reply: 'E se o prazo caísse pela metade?', concluida: false });
    montar();
    const body = await (await POST(req({ action: 'arguir', message: 'minha defesa' }))).json();
    expect(body).toMatchObject({ arguindo: true, arguicaoConcluida: false, message: 'E se o prazo caísse pela metade?', turno: 3, finished: false, cenarioIndex: 2 });
    const [ctx, estado, mensagem, maxTurnos] = h.turno.mock.calls[0];
    expect(ctx.competencia).toBe('Comp C');
    expect(ctx.cenario).toBe('## Caso Comp C\n\ntexto do caso Comp C');
    expect((ctx.respostaCenario.match(/→ /g) || []).length).toBe(4);
    expect(ctx.respostaCenario).not.toContain('Comp A');
    expect(ctx.descritores.map((d: any) => d.descritor)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `Comp C-d${n}`));
    expect(estado).toMatchObject({ turno: 2, concluida: false });
    expect(mensagem).toBe('minha defesa');
    expect(maxTurnos).toBe(6);
    expect(ultimoSlot().cenarios[2].arguicao).toMatchObject({ turno: 3, concluida: false });
    expect(ultimoSlot().cenarios[0].arguicao).toMatchObject({ concluida: true });
    expect(h.extrair).not.toHaveBeenCalled();
    expect(h.reservar).not.toHaveBeenCalled();
  });

  it('a defesa do cenário 3 conclui: a extração é DELE, fica no cenário, e o cenário 4 abre (a pontuação ainda não)', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 0, 0], [ARG(true), ARG(true, 'Comp B'), ARG(false, 'Comp C')]) };
    h.turno.mockResolvedValue(TURNO_CONCLUIDO);
    h.extrair.mockResolvedValue({ evidencias_por_descritor: [], resumo: { leitura_geral: 'leu C' } });
    montar();
    const body = await (await POST(req({ action: 'arguir', message: 'minha defesa' }))).json();
    expect(body).toMatchObject({ arguicaoConcluida: true, message: 'Obrigado.', turno: 6, proximoCenario: true, cenarioConcluido: 2, cenarioIndex: 3, dimensao: 'SITUAÇÃO', finished: false });
    expect(body.history).toEqual([expect.objectContaining({ role: 'assistant', turn: 1, dimensao: 'SITUAÇÃO' })]);
    expect(body).not.toHaveProperty('finalizando');
    // a extração é do cenário 3 (o contexto dele), e fica gravada nele
    expect(h.extrair.mock.calls[0][0].competencia).toBe('Comp C');
    const slot = ultimoSlot();
    expect(slot.cenarios[2].arguicao).toMatchObject({ concluida: true, extracao: { resumo: { leitura_geral: 'leu C' } } });
    expect(slot.cenarios[3].transcript_completo).toEqual([expect.objectContaining({ role: 'assistant', turn: 1 })]);
    expect(slot).not.toHaveProperty('arguicao');
    expect(h.reservar).not.toHaveBeenCalled();
    expect(h.after).not.toHaveBeenCalled();
  });

  it('a defesa do ÚLTIMO cenário conclui: a pontuação é disparada (reserva + after), com a fusão por competência', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 4, 4], [...COMPS.slice(0, 4).map((c) => ARG(true, c)), ARG(false, 'Comp E')]) };
    h.turno.mockResolvedValue(TURNO_CONCLUIDO);
    h.extrair.mockResolvedValue({ evidencias_por_descritor: [] });
    montar();
    const body = await (await POST(req({ action: 'arguir', message: 'fecho' }))).json();
    expect(body).toMatchObject({ arguicaoConcluida: true, finalizando: true, fechamento: 'processando' });
    expect(body).not.toHaveProperty('proximoCenario');
    expect(h.extrair.mock.calls[0][0].competencia).toBe('Comp E');
    expect(ultimoSlot().cenarios[4].arguicao.extracao).toEqual({ evidencias_por_descritor: [] });
    expect(ultimoSlot().cenarios.map((c: any) => c.arguicao?.concluida)).toEqual([true, true, true, true, true]);
    expect(h.reservar).toHaveBeenCalledTimes(1);
    expect(h.after).toHaveBeenCalledTimes(1);
  });

  it('sem defesa aberta no cenário atual (ainda respondendo, ou respondido sem a abertura): 400, e a IA não é chamada', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([2, 0, 0, 0, 0]) };
    montar();
    expect((await POST(req({ action: 'arguir', message: 'x' }))).status).toBe(400);
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0]) };
    montar();
    expect((await POST(req({ action: 'arguir', message: 'x' }))).status).toBe(400);
    expect(h.turno).not.toHaveBeenCalled();
  });

  it('todas as defesas já concluídas: 400 (não há o que arguir)', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 4, 4, 4], COMPS.map((c) => ARG(true, c))) };
    montar();
    expect((await POST(req({ action: 'arguir', message: 'x' }))).status).toBe(400);
    expect(h.turno).not.toHaveBeenCalled();
  });

  it('arguição desligada: `arguir` é recusado como na Jornada (400)', async () => {
    h.config = { ...h.config, arguicao: { ativa: false, maxTurnos: 0 } };
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0], [ARG(false)]) };
    montar();
    expect((await POST(req({ action: 'arguir', message: 'x' }))).status).toBe(400);
  });

  it('o mapeamento não pode ser lido: 500 com o motivo, e o turno NÃO é pago', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 0, 0, 0, 0], [ARG(false)]) };
    montar();
    h.sb.falharEm({ tabela: 'descriptor_assessments', op: 'select', mensagem: 'pool esgotado' });
    const res = await POST(req({ action: 'arguir', message: 'x' }));
    expect(res.status).toBe(500);
    expect(h.turno).not.toHaveBeenCalled();
  });
});

describe('fechamento_status com os 5 cenários: o cenário e a etapa em que a pessoa está', () => {
  it('respondendo: 20 perguntas, as respostas somadas, e o cenário e a etapa para a tela retomar', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 2, 0, 0], [ARG(true), ARG(true, 'Comp B')]) };
    montar();
    expect(await (await POST(req({ action: 'fechamento_status' }))).json()).toMatchObject({
      estado: 'respondendo', respostas: 10, perguntas: 20, cenarioAtual: 2, etapa: 'respondendo',
    });
  });

  it('arguindo: a defesa do cenário 2 em andamento', async () => {
    h.prog = { id: 'p12', status: 'em_andamento', feedback: slotComCenarios([4, 4, 0, 0, 0], [ARG(true), ARG(false, 'Comp B')]) };
    montar();
    expect(await (await POST(req({ action: 'fechamento_status' }))).json()).toMatchObject({
      estado: 'arguindo', respostas: 8, cenarioAtual: 1, etapa: 'arguindo',
    });
  });

  it('as 5 defesas concluídas sem nota: pronto-para-pontuar; avaliado quando a semana concluiu', async () => {
    const feedback = slotComCenarios([4, 4, 4, 4, 4], COMPS.map((c) => ARG(true, c)));
    h.prog = { id: 'p12', status: 'em_andamento', feedback };
    montar();
    expect(await (await POST(req({ action: 'fechamento_status' }))).json()).toMatchObject({ estado: 'pronto-para-pontuar', cenarioAtual: null, etapa: null });
    h.prog = { id: 'p12', status: 'concluido', concluido_em: new Date().toISOString(), feedback: { ...feedback, nota_media_pos: 2.5 } };
    montar();
    expect((await (await POST(req({ action: 'fechamento_status' }))).json()).estado).toBe('avaliado');
  });
});

describe('o formato de UMA competência não muda (Jornada, Personalizado, DUO de Ibipeba, legado)', () => {
  const ENTREGA = (competencias: string[], modo: string) => ({
    ...TRILHA_ONB, competencia_foco: competencias[0], competencias_foco: competencias, programa_modo: modo,
    descritores_selecionados: [{ competencia: competencias[0], descritor: 'D1' }],
  });

  it('Jornada: serve o B da competência com as 4 perguntas, e o slot tem EXATAMENTE cenario, cenario_b_id, perguntas e transcript_completo', async () => {
    h.config = { ...PROGRAMA_JORNADA, semanaCenarioB: 7, semanaAcumulada: 6 };
    h.trilha = ENTREGA(['Comp A'], 'jornada');
    montar();
    const res = await POST(req({ action: 'init', semana: 7 }));
    const body = await res.json();
    expect(body.cenario).toBe('## Caso Comp A\n\ntexto do caso Comp A');
    expect(body.cenario_b_id).toBe('b-0');
    expect(body.perguntas).toEqual([
      { dimensao: 'SITUAÇÃO', texto: 'Comp A p1' }, { dimensao: 'AÇÃO', texto: 'Comp A p2' },
      { dimensao: 'RACIOCÍNIO', texto: 'Comp A p3' }, { dimensao: 'AUTOSSENSIBILIDADE', texto: 'Comp A p4' },
    ]);
    expect(body).not.toHaveProperty('cenarios');
    expect(Object.keys(ultimoSlot()).sort()).toEqual(['cenario', 'cenario_b_id', 'perguntas', 'transcript_completo']);
    expect(ultimoSlot().transcript_completo).toEqual([expect.objectContaining({ role: 'assistant', turn: 1, dimensao: 'SITUAÇÃO' })]);
  });

  it('Jornada: send grava na conversa de sempre (transcript_completo), abre a próxima pergunta e NÃO cria cenarios', async () => {
    h.config = { ...PROGRAMA_JORNADA, semanaCenarioB: 7, semanaAcumulada: 6 };
    h.trilha = ENTREGA(['Comp A'], 'jornada');
    h.prog = { id: 'p7', status: 'em_andamento', feedback: { cenario: '## C', cenario_b_id: 'b-0', perguntas: PERGUNTAS, transcript_completo: transcript(0) } };
    montar();
    const body = await (await POST(req({ action: 'send', semana: 7, message: 'r1' }))).json();
    expect(body).toMatchObject({ finished: false, dimensao: 'AÇÃO' });
    expect(body).not.toHaveProperty('cenarioIndex');
    expect(ultimoSlot()).not.toHaveProperty('cenarios');
    expect(ultimoSlot().transcript_completo.filter((m: any) => m.role === 'user')).toHaveLength(1);
  });

  it('DUO de Ibipeba (2 competências, integrador cadastrado à mão): continua UM cenário, o integrador, e não vira 2', async () => {
    h.config = { ...PROGRAMA_REGULAR_DUO, modo: 'regular', semanaCenarioB: 9, semanaAcumulada: 8 };
    h.trilha = ENTREGA(['Comp A', 'Comp B'], 'regular_duo');
    bancoB = [bDe(0, { competencias_integradas: ['Comp A', 'Comp B'] })];
    montar();
    const body = await (await POST(req({ action: 'init', semana: 9 }))).json();
    expect(body).not.toHaveProperty('cenarios');
    expect(body.cenario_b_id).toBe('b-0');
    expect(body.perguntas).toHaveLength(4);
    expect(Object.keys(ultimoSlot()).sort()).toEqual(['cenario', 'cenario_b_id', 'perguntas', 'transcript_completo']);
  });

  it('um Onboarding com UMA competência só também segue o formato de sempre', async () => {
    h.trilha = ENTREGA(['Comp A'], 'onboarding');
    montar();
    const body = await (await POST(req({ action: 'init' }))).json();
    expect(body).not.toHaveProperty('cenarios');
    expect(body.perguntas).toHaveLength(4);
  });

  it('B de uma competência com só 2 perguntas: a tela recebe 2 (a contagem real, nunca um 4 fixo)', async () => {
    h.config = { ...PROGRAMA_JORNADA, semanaCenarioB: 7, semanaAcumulada: 6 };
    h.trilha = ENTREGA(['Comp A'], 'jornada');
    bancoB = [bDe(0, { p3: '', p4: '' })];
    montar();
    const body = await (await POST(req({ action: 'init', semana: 7 }))).json();
    expect(body.perguntas.map((p: any) => p.dimensao)).toEqual(['SITUAÇÃO', 'AÇÃO']);
  });
});
