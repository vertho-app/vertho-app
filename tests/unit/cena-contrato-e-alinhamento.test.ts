// Três garantias que existiam no papel e não no caminho (24/08/2026).
//
// A revisão externa achou as três, e todas tinham a mesma assinatura: o
// documento dizia "corrigido" enquanto o código que roda seguia igual.
//
//   1. `validarContratoDaCena` tinha ZERO chamadores — guard escrito, nunca
//      executado. A cena avaliativa continuava nascendo sem armadilha.
//   2. `recuperou`/`piorou` eram inalcançáveis em runtime: a consolidação
//      esperava várias evidências por descritor e o prompt do extrator mandava
//      emitir "EXATAMENTE UMA". Os testes passavam porque injetavam duas na mão.
//   3. O juiz avaliava `proximoBeat` (o pendente AGORA) enquanto o avaliado
//      respondia à provocação do beat ANTERIOR — quando um beat se cumpria, o
//      seguinte era julgado sem nunca ter sido provocado.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  beatsJulgados: [] as string[],
  instrucoes: [] as string[],
}));

vi.mock('@/actions/ai-client', () => ({
  callAIChat: async (_sys: string, _msgs: any, _cfg: any, _max: number, opts: any) => {
    mocks.instrucoes.push(String(opts?.systemSuffix ?? ''));
    return 'Não aceito.\n[META]\n{"movimento":"resistir"}\n[/META]';
  },
  callAI: async (system: string, user: string) => {
    if (system.includes('integridade')) return '{"veredito":"ok","motivo":""}';
    if (system.includes('sinal específico')) {
      mocks.beatsJulgados.push(user.split('\n')[1] ?? '');
      return '{"cumprido":true,"porque":"ok"}';
    }
    return '{}';
  },
}));
vi.mock('@/lib/pii-masker', () => ({ maskTextPII: (t: string) => t, unmaskPII: (t: string) => t }));

import { gerarPersona, turnoCena, abrirCena, type EstadoCena } from '@/lib/season-engine/cena/core';
import { consolidarCena, montarBeatsDaCena, type EvidenciaDescritor, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';
import { promptExtracao } from '@/lib/season-engine/cena/prompts';

const perguntas: PerguntaIA3[] = [
  { numero: 1, descritores_primarios: [1, 2] },
  { numero: 2, descritores_primarios: [3] },
  { numero: 3, descritores_primarios: [4, 5] },
  { numero: 4, descritores_primarios: [6] },
];

const descritores = Array.from({ length: 6 }, (_, i) => ({
  indice: i + 1, nomeCurto: `D${i + 1}`, descritorCompleto: 'x',
  n1: 'a', n2: 'b', n3: 'c', n4: 'd', evidenciasEsperadas: 'e', perguntasAlvo: 'p',
}));

const ctxCheio: any = {
  cargo: 'Gestão Escolar',
  competencia: 'X',
  contextoEmpresa: '',
  cenario: {
    titulo: 't', contexto: 'c',
    tradeoffTestado: 'escolher A ou B',
    fatorComplicador: 'prazo curto',
    armadilhaGenerica: 'alinhar com todos não resolve',
    stakeholders: ['Ana'],
  },
  descritores,
  beats: montarBeatsDaCena(perguntas).beats,
};

const persona: any = {
  quem: 'Professora', relacao: 'liderada', objetivo: 'x',
  o_que_nunca_aceita: 'y', o_que_faz_ceder: 'z', tom: 'firme', primeira_fala: 'Olha.',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('1 · o contrato de entrada é EXECUTADO, não só declarado', () => {
  const semCampo = (campo: string) => ({
    ...ctxCheio,
    cenario: { ...ctxCheio.cenario, [campo]: '' },
  });

  it('aborta a cena sem armadilha — era o estado das 20 cenas da fase 0', async () => {
    await expect(gerarPersona(semCampo('armadilhaGenerica'))).rejects.toThrow(/armadilhaGenerica/);
  });

  it('aborta sem trade-off e sem fator complicador', async () => {
    await expect(gerarPersona(semCampo('tradeoffTestado'))).rejects.toThrow(/tradeoffTestado/);
    await expect(gerarPersona(semCampo('fatorComplicador'))).rejects.toThrow(/fatorComplicador/);
  });

  it('aborta com descritor sem nível-meta', async () => {
    const ctx = { ...ctxCheio, descritores: [{ ...descritores[0], n3: '' }, ...descritores.slice(1)] };
    await expect(gerarPersona(ctx)).rejects.toThrow(/nível-meta/);
  });

  it('a validação é do NÚCLEO — quem chamar de outro lugar herda a garantia', async () => {
    // Se a checagem morasse no script, uma rota futura repetiria o furo. Este
    // teste chama o núcleo direto, sem passar por script nenhum.
    await expect(gerarPersona(semCampo('armadilhaGenerica'))).rejects.toThrow(/contrato de entrada/);
  });
});

describe('2 · o extrator PODE emitir várias evidências por descritor', () => {
  it('o prompt não proíbe mais a segunda entrada — senão recuperou/piorou é código morto', () => {
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(
      system,
      'com "exatamente uma entrada por descritor", a trajetória nunca acende em runtime',
    ).not.toContain('EXATAMENTE UMA entrada por descritor');
    expect(system).toContain('UMA entrada por MOMENTO');
  });

  it('o schema pede o TURNO — é ele que ordena a trajetória', () => {
    const { system } = promptExtracao(ctxCheio, 'transcrição');
    expect(system).toContain('"turno"');
  });

  it('a trajetória ordena por turno, não por beat', () => {
    // Duas evidências no MESMO beat: só o turno as separa. Ordenar por beat
    // empataria, e a recuperação sairia como piora ou sumiria.
    const evs: EvidenciaDescritor[] = [
      { indice: 1, veredito: 'falhou', forca: 'moderada', citacao: 'a', beat: 1, turno: 2 },
      { indice: 1, veredito: 'demonstrou', forca: 'forte', citacao: 'b', beat: 1, turno: 5 },
    ];
    const c = consolidarCena(evs);
    expect(c.notas[0]).toBe(3.2);
    expect(c.recuperou).toEqual([1]);
  });
});

describe('3 · o juiz avalia o beat PROVOCADO, não o próximo pendente', () => {
  beforeEach(() => { mocks.beatsJulgados = []; mocks.instrucoes = []; });

  const estado = (over: Partial<EstadoCena> = {}): EstadoCena => ({
    historico: [{ role: 'assistant', content: 'Olha.', turno: 1 }],
    turno: 1, beatsCumpridos: [], descritoresTocados: [], turnosSemAvanco: 0,
    beatProvocado: 1, condicaoSatisfeita: false, concluida: false, motivoFim: null,
    encerramentosNegados: [], bloqueios: [], ...over,
  });

  it('julga o beat 1 mesmo quando o próximo pendente já é o 2', async () => {
    // Cenário do bug: beat 1 acabou de ser cumprido, então `proximoBeat` é 2.
    // Mas a última fala do interlocutor provocou o 1, e é a ela que o avaliado
    // está respondendo. Julgar contra o 2 marcaria um momento nunca criado.
    const r = await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [], beatProvocado: 1 }), 'resposta');
    expect(mocks.beatsJulgados[0]).toContain(ctxCheio.beats[0].sinalDeCumprido.slice(0, 30));
    expect(r.estado.beatsCumpridos).toEqual([1]);
  });

  it('o personagem é instruído a provocar o PRÓXIMO, não o julgado', async () => {
    await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [1], beatProvocado: 1 }), 'resposta');
    // julgou o 1 (o que foi provocado)…
    expect(mocks.beatsJulgados[0]).toContain(ctxCheio.beats[0].sinalDeCumprido.slice(0, 30));
    // …e mandou o personagem criar o 2.
    expect(mocks.instrucoes[0]).toContain('"beat_atual" = 2');
  });

  it('o estado registra qual beat foi provocado, para o turno seguinte julgar certo', async () => {
    const r = await turnoCena(ctxCheio, persona, estado({ beatsCumpridos: [1, 2], beatProvocado: 2 }), 'resposta');
    expect(r.estado.beatProvocado).toBe(3);
  });

  it('abrirCena registra o beat de abertura', () => {
    const { estado: e } = abrirCena(persona, ctxCheio.beats[0].numero);
    expect(e.beatProvocado).toBe(1);
  });
});
