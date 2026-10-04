import { describe, it, expect } from 'vitest';
import {
  estadoDoFechamento, FINALIZACAO_JANELA_MS, perguntasDoFechamento, respostasDoCenario, resumoDaAvaliacao,
} from '@/lib/season-engine/estado-fechamento';

/**
 * As fixtures reproduzem a FORMA REAL das linhas de `temporada_semana_progresso`
 * medidas em Ibipeba em 16/09/2026 (textos trocados, estrutura igual): é nelas
 * que a tela errava o estado, não num caso inventado.
 */
const AGORA = Date.parse('2026-09-16T15:00:00Z');
const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map(d => ({ dimensao: d, texto: `pergunta ${d}` }));

function transcript(nUser: number) {
  const t: any[] = [{ role: 'assistant', content: '**SITUAÇÃO**', turn: 1 }];
  for (let i = 0; i < nUser; i++) {
    t.push({ role: 'user', content: `resposta ${i + 1}` });
    if (i < 3) t.push({ role: 'assistant', content: `**pergunta ${i + 2}**`, turn: i + 2 });
  }
  return t;
}

const ARGUICAO_CONCLUIDA = { turno: 7, concluida: true, historico: [{ role: 'user', content: 'x' }], extracao: {} };
const ARGUICAO_TURNO_2 = { turno: 2, concluida: false, historico: [{ role: 'user', content: 'x' }] };

describe('estadoDoFechamento: os três casos reais de Ibipeba', () => {
  it('Helmar: 4 respostas + arguição concluída + sem nota → pronto-para-pontuar (não "respondendo")', () => {
    const helmar = {
      status: 'em_andamento',
      feedback: { cenario: '## C', perguntas: PERGUNTAS, cenario_b_id: 'cb', transcript_completo: transcript(4), arguicao: ARGUICAO_CONCLUIDA },
    };
    expect(estadoDoFechamento(helmar, { arguicaoAtiva: true }, AGORA).estado).toBe('pronto-para-pontuar');
  });

  it('Marta: 5 falas (uma duplicada pelo reenvio) + concluída → avaliado', () => {
    const marta = {
      status: 'concluido',
      feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: [...transcript(4), { role: 'user', content: 'resposta 1' }], arguicao: ARGUICAO_CONCLUIDA, nota_media_pos: 2.4 },
    };
    const r = estadoDoFechamento(marta, { arguicaoAtiva: true }, AGORA);
    expect(r.estado).toBe('avaliado');
    expect(r.respostas).toBe(5);
  });

  it('Saturnino no turno 2 da arguição → arguindo', () => {
    const saturnino = {
      status: 'em_andamento',
      feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), arguicao: ARGUICAO_TURNO_2 },
    };
    expect(estadoDoFechamento(saturnino, { arguicaoAtiva: true }, AGORA).estado).toBe('arguindo');
  });
});

describe('estadoDoFechamento: reserva da pontuação', () => {
  const base = (finalizacao?: any) => ({
    status: 'em_andamento',
    feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4), arguicao: ARGUICAO_CONCLUIDA, ...(finalizacao ? { finalizacao } : {}) },
  });

  it('processando dentro da janela → processando', () => {
    const iniciada = new Date(AGORA - 60_000).toISOString();
    expect(estadoDoFechamento(base({ status: 'processando', iniciada_em: iniciada }), { arguicaoAtiva: true }, AGORA).estado).toBe('processando');
  });

  it('processando fora da janela (a função morreu) → erro "expirou"', () => {
    const iniciada = new Date(AGORA - FINALIZACAO_JANELA_MS - 1).toISOString();
    const r = estadoDoFechamento(base({ status: 'processando', iniciada_em: iniciada }), { arguicaoAtiva: true }, AGORA);
    expect(r).toMatchObject({ estado: 'erro', erro: 'expirou' });
  });

  it('processando com carimbo ilegível não fica preso em "processando"', () => {
    const r = estadoDoFechamento(base({ status: 'processando', iniciada_em: 'lixo' }), { arguicaoAtiva: true }, AGORA);
    expect(r.estado).toBe('erro');
  });

  it('erro gravado → erro, com a mensagem', () => {
    const r = estadoDoFechamento(base({ status: 'erro', iniciada_em: new Date(AGORA).toISOString(), erro: 'Request was aborted' }), { arguicaoAtiva: true }, AGORA);
    expect(r).toMatchObject({ estado: 'erro', erro: 'Request was aborted' });
  });
});

describe('estadoDoFechamento: antes do fim', () => {
  it('sem cenário → nao-iniciado', () => {
    expect(estadoDoFechamento({ status: 'em_andamento', feedback: { transcript_completo: [] } }, { arguicaoAtiva: true }, AGORA).estado).toBe('nao-iniciado');
    expect(estadoDoFechamento(null, { arguicaoAtiva: true }, AGORA).estado).toBe('nao-iniciado');
  });

  it('3 de 4 respostas → respondendo', () => {
    const p = { status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(3) } };
    expect(estadoDoFechamento(p, { arguicaoAtiva: true }, AGORA).estado).toBe('respondendo');
  });

  it('arguição DESLIGADA: 4 respostas sem arguição → pronto-para-pontuar', () => {
    const p = { status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4) } };
    expect(estadoDoFechamento(p, { arguicaoAtiva: false }, AGORA).estado).toBe('pronto-para-pontuar');
  });

  it('arguição LIGADA e ainda não aberta → arguindo (nunca pontua sem a defesa)', () => {
    const p = { status: 'em_andamento', feedback: { cenario: '## C', perguntas: PERGUNTAS, transcript_completo: transcript(4) } };
    expect(estadoDoFechamento(p, { arguicaoAtiva: true }, AGORA).estado).toBe('arguindo');
  });
});

describe('helpers', () => {
  it('respostasDoCenario conta só falas do colaborador', () => {
    expect(respostasDoCenario({ transcript_completo: transcript(2) })).toBe(2);
    expect(respostasDoCenario({})).toBe(0);
  });

  it('resumoDaAvaliacao recorta os campos da tela', () => {
    expect(resumoDaAvaliacao({ nota_media_pre: 2, nota_media_pos: 2.5, delta_medio: 0.5, resumo_avaliacao: { mensagem_geral: 'm' }, spec_version: null, outro: 1 }))
      .toEqual({ nota_media_pre: 2, nota_media_pos: 2.5, delta_medio: 0.5, resumo_avaliacao: { mensagem_geral: 'm' }, spec_version: null });
  });
});

describe('estadoDoFechamento: o fechamento do Onboarding (5 cenários, um por competência)', () => {
  const COMPS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
  const cenarios = (respondidas: number[]) => COMPS.map((competencia, i) => ({
    competencia, cenario_b_id: `b${i}`, cenario: `## ${competencia}`, perguntas: PERGUNTAS,
    transcript_completo: respondidas[i] > 0 || i === respondidas.findIndex((n) => n < 4) ? transcript(respondidas[i]) : [],
  }));
  const onb = (respondidas: number[], extra: Record<string, unknown> = {}, status = 'em_andamento') => ({
    status, feedback: { cenarios: cenarios(respondidas), ...extra },
  });

  it('contagem: 20 perguntas no total e as respostas somadas dos cenários', () => {
    const r = estadoDoFechamento(onb([4, 4, 2, 0, 0]), { arguicaoAtiva: true }, AGORA);
    expect(r).toMatchObject({ estado: 'respondendo', respostas: 10, perguntas: 20 });
  });

  it('slot sem cenários e sem cenário único: nao-iniciado', () => {
    expect(estadoDoFechamento({ status: 'em_andamento', feedback: {} }, { arguicaoAtiva: true }, AGORA).estado).toBe('nao-iniciado');
    expect(estadoDoFechamento({ status: 'em_andamento', feedback: { cenarios: [] } }, { arguicaoAtiva: true }, AGORA).estado).toBe('nao-iniciado');
  });

  it('as 20 respondidas com a arguição ligada e ainda não aberta: arguindo (uma só, sobre o conjunto)', () => {
    expect(estadoDoFechamento(onb([4, 4, 4, 4, 4]), { arguicaoAtiva: true }, AGORA).estado).toBe('arguindo');
  });

  it('as 20 respondidas e a arguição concluída, sem nota: pronto-para-pontuar; com a reserva vigente: processando', () => {
    expect(estadoDoFechamento(onb([4, 4, 4, 4, 4], { arguicao: ARGUICAO_CONCLUIDA }), { arguicaoAtiva: true }, AGORA).estado).toBe('pronto-para-pontuar');
    const reserva = { status: 'processando', iniciada_em: new Date(AGORA - 30_000).toISOString() };
    expect(estadoDoFechamento(onb([4, 4, 4, 4, 4], { arguicao: ARGUICAO_CONCLUIDA, finalizacao: reserva }), { arguicaoAtiva: true }, AGORA).estado).toBe('processando');
  });

  it('arguição desligada: as 20 respondidas já estão prontas para pontuar', () => {
    expect(estadoDoFechamento(onb([4, 4, 4, 4, 4]), { arguicaoAtiva: false }, AGORA).estado).toBe('pronto-para-pontuar');
  });

  it('semana concluída: avaliado', () => {
    expect(estadoDoFechamento(onb([4, 4, 4, 4, 4], {}, 'concluido'), { arguicaoAtiva: true }, AGORA).estado).toBe('avaliado');
  });

  it('respostasDoCenario e perguntasDoFechamento: a soma dos cenários, e o formato de uma competência intacto', () => {
    expect(respostasDoCenario(onb([4, 1, 0, 0, 0]).feedback)).toBe(5);
    expect(perguntasDoFechamento(onb([0, 0, 0, 0, 0]).feedback)).toBe(20);
    // o cenário único: as falas do `transcript_completo` e as perguntas do slot, como sempre
    expect(respostasDoCenario({ transcript_completo: transcript(3) })).toBe(3);
    expect(perguntasDoFechamento({ perguntas: PERGUNTAS })).toBe(4);
    expect(perguntasDoFechamento({})).toBe(0);
  });
});
