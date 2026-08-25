// O interlocutor cobra; não entrega. E quando entrega, a fala é refeita.
//
// Metade das evidências da fase 0c (69 de 134) veio de momentos em que o
// personagem tinha acabado de dizer o que queria ouvir. Isso não aparece como
// defeito: a transcrição fica boa, a cobertura fecha, a nota sobe. O que some é
// a medida — passa a descrever a fala do personagem.
//
// Três garantias aqui: o prompt proíbe, o guarda barra e regenera UMA vez, e o
// que passar da segunda fica registrado em vez de sumir.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  falas: [] as string[],
  sufixos: [] as string[],
  ditaEm: [] as boolean[], // resposta do guarda do interlocutor, na ordem
  iDita: 0,
}));

vi.mock('@/actions/ai-client', () => ({
  callAIChat: async (_sys: string, _msgs: any, _cfg: any, _max: number, opts: any) => {
    mocks.sufixos.push(String(opts?.systemSuffix ?? ''));
    const fala = mocks.falas.shift() ?? 'Não aceito.';
    return `${fala}\n[META]\n{"movimento":"resistir"}\n[/META]`;
  },
  callAI: async (system: string) => {
    if (system.includes('integridade')) return '{"veredito":"ok","motivo":""}';
    if (system.includes('audita a fala de um PERSONAGEM')) {
      const dita = mocks.ditaEm[mocks.iDita++] ?? false;
      return `{"dita_formato":${dita},"elemento":"${dita ? 'nome e prazo' : ''}"}`;
    }
    return '{"cumprido":false,"porque":"ainda não"}';
  },
}));
vi.mock('@/lib/pii-masker', () => ({ maskTextPII: (t: string) => t, unmaskPII: (t: string) => t }));

import { turnoCena, type EstadoCena } from '@/lib/season-engine/cena/core';
import { montarBeatsDaCena, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';
import { promptGuardaDoInterlocutor, buildInterlocutorSystemEstavel } from '@/lib/season-engine/cena/prompts';

const perguntas: PerguntaIA3[] = [
  { numero: 1, descritores_primarios: [1, 2] },
  { numero: 2, descritores_primarios: [3] },
  { numero: 3, descritores_primarios: [4, 5] },
  { numero: 4, descritores_primarios: [6] },
];

const ctxBase: any = {
  cargo: 'Gestão Escolar',
  competencia: 'X',
  contextoEmpresa: '',
  cenario: {
    titulo: 't', contexto: 'c', tradeoffTestado: 'A ou B',
    fatorComplicador: 'prazo', armadilhaGenerica: 'alinhar com todos', stakeholders: ['Ana'],
  },
  descritores: Array.from({ length: 6 }, (_, i) => ({
    indice: i + 1, nomeCurto: `D${i + 1}`, descritorCompleto: 'x',
    n1: 'a', n2: 'b', n3: 'c', n4: 'd', evidenciasEsperadas: 'e', perguntasAlvo: 'p',
  })),
  beats: montarBeatsDaCena(perguntas).beats,
};

const persona: any = {
  quem: 'Professora', relacao: 'liderada', objetivo: 'x',
  o_que_nunca_aceita: 'y', o_que_faz_ceder: 'z', tom: 'firme', primeira_fala: 'Olha.',
};

const estado = (): EstadoCena => ({
  historico: [{ role: 'assistant', content: 'Olha.', turno: 1 }],
  turno: 1, beatsCumpridos: [], descritoresTocados: [], turnosSemAvanco: 0,
  beatProvocado: 1, condicaoSatisfeita: false, concluida: false, motivoFim: null,
  encerramentosNegados: [], bloqueios: [], ditados: [],
});

beforeEach(() => { mocks.falas = []; mocks.sufixos = []; mocks.ditaEm = []; mocks.iDita = 0; });

describe('o prompt proíbe entregar o elemento', () => {
  it('cena de MEDIÇÃO carrega a proibição; cena de ENSAIO não', () => {
    const medicao = buildInterlocutorSystemEstavel(ctxBase, persona, 14);
    expect(medicao).toContain('VOCÊ COBRA, MAS NÃO ENTREGA');
    expect(medicao, 'a fronteira tem de estar escrita, não subentendida')
      .toContain('nomear a pessoa, o dia, o prazo, o número');

    const ensaio = buildInterlocutorSystemEstavel({ ...ctxBase, modo: 'ensaio' }, persona, 14);
    expect(ensaio, 'no ensaio, mostrar a forma é o produto').not.toContain('VOCÊ COBRA, MAS NÃO ENTREGA');
  });

  it('o default é MEDIÇÃO — esquecer a flag não solta o interlocutor', () => {
    // Esquecer num ensaio custa uma conversa mais dura; esquecer numa medição
    // custa a medida. O default fica do lado que erra barato.
    expect(buildInterlocutorSystemEstavel(ctxBase, persona, 14)).toContain('NÃO ENTREGA');
  });

  it('o guarda recebe o que o momento pede, para julgar contra ele', () => {
    const { system, user } = promptGuardaDoInterlocutor('Põe a Roseli nisso.', ctxBase.beats[0]);
    expect(system).toContain('dita_formato');
    expect(system, 'perguntar é o trabalho dele; dizer é responder no lugar')
      .toContain('PERGUNTAR pelo elemento é o trabalho dele');
    expect(user).toContain(ctxBase.beats[0].comoOInterlocutorCria.slice(0, 30));
  });
});

describe('a fala que dita é refeita UMA vez', () => {
  it('regenera e entrega a segunda fala, sem registrar ditação', async () => {
    mocks.falas = ['Põe a Roseli e me entrega sexta.', 'Isso não me resolve. E quando falhar?'];
    mocks.ditaEm = [true, false];
    const r = await turnoCena(ctxBase, persona, estado(), 'resposta');
    expect(r.fala).toBe('Isso não me resolve. E quando falhar?');
    expect(mocks.sufixos.length, 'duas chamadas ao personagem').toBe(2);
    expect(mocks.sufixos[1], 'a segunda diz o que corrigir').toContain('ENTREGOU o que você devia só cobrar');
    expect(r.estado.ditados, 'refez e obedeceu — nada a registrar').toEqual([]);
  });

  it('se a segunda também dita, o turno segue e FICA REGISTRADO', async () => {
    // Um laço até acertar travaria a cena numa fala que o leitor insiste em
    // reprovar. O teto é uma tentativa; o que passa vira dado, não silêncio.
    mocks.falas = ['Põe a Roseli.', 'Então põe a Roseli mesmo, na sexta.'];
    mocks.ditaEm = [true, true];
    const r = await turnoCena(ctxBase, persona, estado(), 'resposta');
    expect(mocks.sufixos.length).toBe(2);
    expect(r.estado.ditados).toEqual([{ turno: 2, elemento: 'nome e prazo' }]);
  });

  it('fala limpa não paga regeneração', async () => {
    mocks.falas = ['Isso não me resolve.'];
    mocks.ditaEm = [false];
    const r = await turnoCena(ctxBase, persona, estado(), 'resposta');
    expect(mocks.sufixos.length).toBe(1);
    expect(r.estado.ditados).toEqual([]);
  });

  it('em ENSAIO o guarda nem roda — nenhuma chamada extra', async () => {
    mocks.falas = ['Põe a Roseli e me entrega sexta.'];
    mocks.ditaEm = [true];
    const r = await turnoCena({ ...ctxBase, modo: 'ensaio' }, persona, estado(), 'resposta');
    expect(mocks.sufixos.length).toBe(1);
    expect(mocks.iDita, 'o guarda do interlocutor não foi consultado').toBe(0);
    expect(r.fala).toBe('Põe a Roseli e me entrega sexta.');
  });
});

describe('a proibição não pode engolir o momento que força a escolha', () => {
  // 🔴 Medido na fase 0d: as DUAS únicas falas que o guarda barrou numa rodada
  // inteira eram do mesmo tipo e do mesmo momento — "se ela repetir amanhã,
  // quem responde? Você ou eu?". Nenhuma entrega nome, prazo ou número; as
  // duas fecham saída fácil, que é literalmente o que aquele momento pede.
  // A regra antiga ("listar as opções entre as quais ela deve escolher")
  // colidia com o mandato do beat, e o custo foi uma regeneração em 2 de 3
  // cenas — paga para trocar uma fala boa por outra.
  it('o guarda é instruído a NÃO barrar o dilema posto na mesa', () => {
    const { system } = promptGuardaDoInterlocutor('se ela repetir amanhã, quem responde? Você ou eu?', ctxBase.beats[0]);
    expect(system).toContain('força uma ESCOLHA entre coisas que já estão na mesa');
    expect(system, 'a fronteira é o CONTEÚDO da resposta, não a forma do dilema')
      .toContain('Ditar é entregar o CONTEÚDO da resposta');
  });

  it('e o interlocutor recebe a mesma licença, para não se autocensurar', () => {
    const sys = buildInterlocutorSystemEstavel(ctxBase, persona, 14);
    expect(sys).toContain('não é entregar — é fechar saída fácil');
    expect(sys, 'o que continua proibido é o caminho de ação pronto')
      .toContain('oferecer os caminhos de ação entre os quais ela deve escolher');
  });
});
