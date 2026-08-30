/**
 * A cena pede cache do HISTÓRICO — nas duas chamadas do interlocutor.
 *
 * Por que existe (30/08/2026): o histórico cresce a cada turno e era reenviado
 * FRIO. `Medido:` 30 dias de `ia_usage_log` — `cena_turno` tinha 2,9M tokens de
 * input não cacheado, 34% de todo o input frio da conta Anthropic, com gap
 * mediano de 25 s entre turnos (bem dentro do TTL de 5 min do cache). O
 * mecanismo já existia no wrapper desde o piloto de history caching e o único
 * caller que o ligava era o tira-dúvidas, que custa US$ 0,13 em 30 dias.
 *
 * 🔑 A segunda asserção é a que sustenta ter ligado isto sem revalidar
 * qualidade: a cena passa `systemSuffix` e NÃO passa `userSuffix`, e é a
 * relocação do `userSuffix` que mexeria no texto do prompt. Se alguém passar um
 * `userSuffix` aqui, o prompt muda de verdade e este teste fica vermelho antes
 * de a mudança chegar a uma cena real.
 *
 * O par (turno normal + REGENERAÇÃO) existe porque são dois call-sites: a
 * regeneração é o ramo raro, e ramo raro sem ninguém percorrendo é como a flag
 * ficaria só na metade barata.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  chats: [] as Array<{ system: string; options: any }>,
}));

vi.mock('@/actions/ai-client', () => ({
  callAIChat: async (system: string, _msgs: any, _model: any, _max: number, options?: any) => {
    mocks.chats.push({ system, options });
    return 'Não aceito.\n[META]\n{"movimento":"resistir","descritores_tocados":[1]}\n[/META]';
  },
  // Guarda de integridade, juiz de beat e guarda do interlocutor compartilham o
  // `callAI` e leem campos diferentes do mesmo JSON — devolver todos de uma vez
  // deixa o turno andar até a REGENERAÇÃO (`dita_formato: true`).
  callAI: async () =>
    '{"veredito":"ok","motivo":"","cumprido":false,"porque":"","dita_formato":true,"elemento":"o prazo"}',
}));

vi.mock('@/lib/pii-masker', () => ({ maskTextPII: (t: string) => t, unmaskPII: (t: string) => t }));

import { turnoCena, type EstadoCena } from '@/lib/season-engine/cena/core';
import { montarBeatsDaCena, type PerguntaIA3 } from '@/lib/season-engine/cena/beats';

const perguntas: PerguntaIA3[] = [
  { numero: 1, descritores_primarios: [1, 2] },
  { numero: 2, descritores_primarios: [3] },
  { numero: 3, descritores_primarios: [4, 5] },
  { numero: 4, descritores_primarios: [6] },
];

const ctx: any = {
  cargo: 'Gestão Escolar',
  competencia: 'X',
  contextoEmpresa: '',
  cenario: { titulo: 't', contexto: 'c', tradeoffTestado: '', fatorComplicador: '', armadilhaGenerica: '', stakeholders: [] },
  descritores: Array.from({ length: 6 }, (_, i) => ({
    indice: i + 1, nomeCurto: `D${i + 1}`, descritorCompleto: '', n1: '', n2: '', n3: '', n4: '',
    evidenciasEsperadas: '', perguntasAlvo: '',
  })),
  beats: montarBeatsDaCena(perguntas).beats,
};

const persona: any = {
  quem: 'Professora', relacao: 'liderada', objetivo: 'x',
  o_que_nunca_aceita: 'y', o_que_faz_ceder: 'z', tom: 'firme', primeira_fala: 'Olha.',
};

const estadoInicial = (): EstadoCena => ({
  historico: [{ role: 'assistant', content: 'Olha.', turno: 1 }],
  turno: 1, beatsCumpridos: [], descritoresTocados: [], turnosSemAvanco: 0, beatProvocado: 1,
  condicaoSatisfeita: false, concluida: false, motivoParada: null,
  encerramentosNegados: [], bloqueios: [],
  ditados: [], fatosRevelados: [],
});

describe('turnoCena · cache do histórico', () => {
  beforeEach(() => { mocks.chats = []; });

  it('as DUAS chamadas do interlocutor (turno e regeneração) pedem cacheHistory', async () => {
    await turnoCena(ctx, persona, estadoInicial(), 'minha resposta');

    // 2 = turno + regeneração. Se o ramo raro parar de rodar, o número cai e o
    // teste avisa em vez de passar medindo só a metade.
    expect(mocks.chats).toHaveLength(2);
    expect(mocks.chats.map((c) => c.options?.cacheHistory)).toEqual([true, true]);
  });

  it('nenhuma delas passa userSuffix (é o que mantém o prompt idêntico)', async () => {
    await turnoCena(ctx, persona, estadoInicial(), 'minha resposta');

    for (const c of mocks.chats) {
      expect(c.options?.userSuffix).toBeUndefined();
      // O par positivo: a instrução do turno CHEGA, por systemSuffix. Sem isto,
      // um turno que não mandasse instrução nenhuma passaria nesta asserção.
      expect(typeof c.options?.systemSuffix).toBe('string');
      expect(c.options.systemSuffix.length).toBeGreaterThan(0);
    }
  });
});
