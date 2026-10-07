import { describe, expect, it } from 'vitest';
import {
  pessoasDaTurma, respostasDaTurma, serializarEscopo, trilhasDaTurma, type EscopoTurmaDeTela,
} from '@/lib/turmas/escopo-tela';
import { trilhaPertence } from '@/lib/turmas/janela';
import { filtrarRespostas, contarStats } from '@/lib/ia4-painel-respostas';
import { selecionarParaReavaliar } from '@/lib/ia4-fila-reavaliacao';

/**
 * Escopo de turma nas telas de cliente (Fase 2, temporadas), 07/10/2026. A tela já tem as
 * listas em memória e recorta com a MESMA régua das telas de servidor: a resposta entra na
 * turma pela janela da participação, a trilha pelo carimbo.
 */

const MARCO = Date.parse('2026-10-07T12:22:33.000Z');
const ANTES = '2026-09-04T16:18:00.000Z';
const DEPOIS = '2026-10-08T10:00:00.000Z';

const antiga: EscopoTurmaDeTela = {
  turmaId: 'T1', turmaNome: 'Turma 1',
  janelas: { ana: { de: null, ate: MARCO }, bia: { de: null, ate: MARCO } },
  participacoes: { ana: 'a-ana', bia: 'a-bia' },
};
const nova: EscopoTurmaDeTela = {
  turmaId: 'T2', turmaNome: 'Temporada 2',
  janelas: { ana: { de: MARCO, ate: null }, bia: { de: MARCO, ate: null } },
  participacoes: { ana: 'n-ana', bia: 'n-bia' },
};

describe('respostasDaTurma', () => {
  const respostas = [
    { id: 'r1', colaborador_id: 'ana', timestamp_resposta: ANTES },
    { id: 'r2', colaborador_id: 'ana', timestamp_resposta: DEPOIS },
    { id: 'r3', colaborador_id: 'bia', timestamp_resposta: null, created_at: ANTES },
    { id: 'r4', colaborador_id: 'caio', timestamp_resposta: ANTES },     // nem é da turma
    { id: 'r5', colaborador_id: null, timestamp_resposta: ANTES },
  ];
  const ids = (l: Array<{ id: string }>) => l.map((r) => r.id);

  it('a turma ANTIGA fica com o que foi respondido antes do marco; a NOVA, com o que veio depois', () => {
    expect(ids(respostasDaTurma(respostas, antiga))).toEqual(['r1', 'r3']);
    expect(ids(respostasDaTurma(respostas, nova))).toEqual(['r2']);
  });

  it('quem não é da turma, ou a linha sem pessoa, nunca entra', () => {
    expect(ids(respostasDaTurma(respostas, antiga))).not.toContain('r4');
    expect(ids(respostasDaTurma(respostas, antiga))).not.toContain('r5');
  });

  it('escopo vazio é NINGUÉM (a tela cai nele enquanto a turma não carrega)', () => {
    const vazio: EscopoTurmaDeTela = { turmaId: '', turmaNome: '', janelas: {}, participacoes: {} };
    expect(respostasDaTurma(respostas, vazio)).toEqual([]);
  });

  it('sem corte (turma sem marco, como Macaé) a pessoa conta inteira, como antes', () => {
    const semMarco: EscopoTurmaDeTela = {
      turmaId: 'T', turmaNome: 'T', janelas: { ana: { de: null, ate: null } }, participacoes: { ana: 'p-ana' },
    };
    expect(ids(respostasDaTurma(respostas, semMarco))).toEqual(['r1', 'r2']);
  });
});

describe('trilhasDaTurma', () => {
  const trilhas = [
    { id: 't1', colaborador_id: 'ana', turma_membro_id: 'a-ana', criado_em: '2026-07-13T00:00:00Z' },
    { id: 't2', colaborador_id: 'ana', turma_membro_id: 'n-ana', criado_em: '2026-10-12T00:00:00Z' },
    { id: 't0', colaborador_id: 'bia', turma_membro_id: null, criado_em: '2026-07-13T00:00:00Z' },   // legada
    { id: 'tx', colaborador_id: 'caio', turma_membro_id: 'a-caio', criado_em: '2026-07-13T00:00:00Z' },
  ];
  const ids = (l: Array<{ id: string }>) => l.map((t) => t.id);

  it('cada turma lista as trilhas da PRÓPRIA participação', () => {
    expect(ids(trilhasDaTurma(trilhas, antiga))).toEqual(['t1', 't0']);
    expect(ids(trilhasDaTurma(trilhas, nova))).toEqual(['t2']);
  });

  it('trilha legada (sem carimbo) só entra na turma cuja janela a contém', () => {
    expect(ids(trilhasDaTurma(trilhas, antiga))).toContain('t0');
    expect(ids(trilhasDaTurma(trilhas, nova))).not.toContain('t0');
  });

  it('trilha de gente que não é da turma não entra', () => {
    expect(ids(trilhasDaTurma(trilhas, antiga))).not.toContain('tx');
  });

  it('trilhaPertence é o mesmo predicado que escolhe a trilha da participação', () => {
    expect(trilhaPertence('a-ana', antiga.janelas.ana, trilhas[0])).toBe(true);
    expect(trilhaPertence('a-ana', antiga.janelas.ana, trilhas[1])).toBe(false);
  });
});

describe('pessoasDaTurma e serializarEscopo', () => {
  it('só as pessoas da turma (ativas e encerradas)', () => {
    const pessoas = [{ id: 'ana' }, { id: 'bia' }, { id: 'caio' }, { id: null }];
    expect(pessoasDaTurma(pessoas, antiga).map((p) => p.id)).toEqual(['ana', 'bia']);
  });

  it('o escopo do servidor vira objeto simples (Map não atravessa o server action)', () => {
    const e = serializarEscopo({
      turmaId: 'T1', turmaNome: 'Turma 1', turmaStatus: 'x', colaboradorIds: ['ana'],
      participacaoPorColab: new Map([['ana', { id: 'a-ana', ativa: false, janela: { de: null, ate: MARCO } }]]),
    });
    expect(JSON.parse(JSON.stringify(e))).toEqual({
      turmaId: 'T1', turmaNome: 'Turma 1',
      janelas: { ana: { de: null, ate: MARCO } }, participacoes: { ana: 'a-ana' },
    });
  });
});

describe('Fase 2 (IA4): o recorte da turma governa os chips E a fila do lote', () => {
  // A cadeia da tela: respostas -> recorte da turma -> filtros -> (chips | fila de reavaliação).
  const resp = (id: string, colab: string, quando: string, nota: number | null, status: string | null) => ({
    id, colaborador_id: colab, timestamp_resposta: quando, colaborador_nome: colab, colaborador_cargo: 'Gestão',
    avaliacao_ia: nota == null ? null : { x: 1 }, status_ia4: status, payload_ia4: nota == null ? null : { nota }, nivel_ia4: nota == null ? null : 2,
  });
  const respostas = [
    resp('velha1', 'ana', ANTES, 44, 'revisar'),     // a jornada 1 da Ana, reprovada
    resp('velha2', 'bia', ANTES, 50, 'revisar'),
    resp('nova1', 'ana', DEPOIS, 60, 'revisar'),     // a jornada 2 da Ana
  ];

  it('os chips da turma NOVA contam só o que é dela', () => {
    const visiveis = filtrarRespostas(respostasDaTurma(respostas, nova), {});
    expect(contarStats(visiveis).total).toBe(1);
    expect(contarStats(visiveis).revisar).toBe(1);
  });

  it('"Re-avaliar" na turma nova NÃO alcança as respostas reprovadas da jornada 1 (custa IA e reescreve avaliação antiga)', () => {
    const naNova = selecionarParaReavaliar(filtrarRespostas(respostasDaTurma(respostas, nova), {}) as any);
    expect(naNova.elegiveis.map((r: any) => r.id)).toEqual(['nova1']);
    // Sem o recorte, a fila pegaria as três: é exatamente o que o botão fazia.
    const semRecorte = selecionarParaReavaliar(filtrarRespostas(respostas, {}) as any);
    expect(semRecorte.elegiveis.map((r: any) => r.id).sort()).toEqual(['nova1', 'velha1', 'velha2']);
  });
});
