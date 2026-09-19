/**
 * Redação final do fechamento (18/09/2026).
 *
 * 🔴 O defeito: o scorer escreve a devolutiva para a nota DELE, e o código muda
 * a nota depois (ajuste da arguição, piso do piloto). `Medido:` no ensaio da
 * Jornada, o "principal avanço" era o 1º de 6 aspectos antes do ajuste e o
 * último depois; em Ibipeba, 11 de 11 fechamentos saíram com erro grave do
 * auditor, que lia o ajuste como contradição.
 *
 * O que se prova aqui:
 *   · a redação só roda quando alguma nota mudou depois do texto;
 *   · roda entre o scorer e o auditor, com as notas finais e a defesa oral;
 *   · o auditor recebe o texto novo, a regra do ajuste e nunca o rascunho;
 *   · falha ou falta de tempo mantêm o rascunho, sem derrubar a nota;
 *   · no piloto, o texto novo passa pela mesma trava de duração.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import { pontuarFechamento, timeoutDaRedacao } from '@/lib/season-engine/fechamento-scorer';
import { PROGRAMA_JORNADA, PROGRAMA_PILOTO } from '@/lib/season-engine/programa-config';
import { callAI } from '@/actions/ai-client';

const mockAI = vi.mocked(callAI);

// Forma real do scorer em produção (ensaio de 18/09): justificativa que cita a
// própria nota e um principal avanço que o ajuste da arguição inverte.
const SCORE = JSON.stringify({
  avaliacao_por_descritor: [
    { descritor: 'Foco em valor', nota_pre: 2.6, nota_pos: 3.3, justificativa: 'Dores antes do preço. Nota_pos em 3.3, o mais alto do conjunto.' },
    { descritor: 'Adaptação', nota_pre: 2.6, nota_pos: 3.2, justificativa: 'Leu o comprador. Nota_pos em 3.2.' },
    { descritor: 'Clareza', nota_pre: 2.6, nota_pos: 3.2, justificativa: 'Direto ao ponto.' },
  ],
  nota_media_pre: 2.6,
  nota_media_pos: 3.2,
  resumo_avaliacao: {
    mensagem_geral: 'COLAB_A1B2, RASCUNHO: seu maior avanço foi o foco em valor.',
    evidencias_citadas: ['preço sem contexto parece caro'],
    principal_avanco: 'RASCUNHO foco em valor',
    principal_ponto_de_atencao: 'RASCUNHO clareza',
    mensagem_final: 'Você leva o foco em valor.',
    proximos_passos: ['Escreva o e-mail real'],
  },
});

const REDIGIDO = {
  mensagem_geral: 'COLAB_A1B2, NOVO: quando você explicou a leitura do comprador, isso ficou claro.',
  evidencias_citadas: ['o Henrique é o filtro'],
  principal_avanco: 'NOVO adaptação ao comprador',
  principal_ponto_de_atencao: 'NOVO foco em valor',
  mensagem_final: 'Você leva um jeito próprio de ler quem decide.',
  proximos_passos: ['Mapeie quem decide antes da próxima proposta'],
};

const CHECK = JSON.stringify({ nota_auditoria: 88, status: 'aprovado_com_ajustes', resumo_auditoria: 'ok' });

// Mascarada, como o caller passa (`mascararExtracaoArguicao`).
const EXTRACAO = {
  resumo: {
    leitura_geral: 'Defesa consistente.',
    sustentacao_mais_forte: 'Adaptar o argumento ao ceticismo do comprador.',
    fragilidade_mais_relevante: 'Não previu dados incompletos.',
  },
  evidencias_por_descritor: [
    { descritor: 'Foco em valor', sustentou: 'fragilizou', forca: 'forte', citacao: 'não tinha pensado nos dados' },
    { descritor: 'Adaptação', sustentou: 'aprofundou', forca: 'forte', citacao: 'eu mudaria a ordem dos recursos' },
    { descritor: 'Clareza', sustentou: 'confirmou', forca: 'forte', citacao: 'resumo de uma página' },
  ],
};

type Filas = Partial<Record<'sem14_scorer' | 'sem14_redacao' | 'sem14_check', string[]>>;
function responder(filas: Filas, aoChamar?: (task: string) => void) {
  mockAI.mockImplementation((async (_s: string, _u: string, _c: unknown, _m: unknown, opts: any) => {
    aoChamar?.(opts?.taskKey);
    const fila = filas[opts?.taskKey as keyof Filas];
    if (!fila || fila.length === 0) throw new Error(`sem resposta preparada para ${opts?.taskKey}`);
    return fila.shift()!;
  }) as any);
}
const chamadas = (task: string) => mockAI.mock.calls.filter((c) => (c[4] as any)?.taskKey === task);

const ARGS = {
  competencia: 'Comunicação de valor',
  descritores: [
    { descritor: 'Foco em valor', nota_atual: 2.6 },
    { descritor: 'Adaptação', nota_atual: 2.6 },
    { descritor: 'Clareza', nota_atual: 2.6 },
  ],
  cenario: '## A proposta',
  resposta: 'resposta',
  nomeColab: 'COLAB_A1B2',
  evidenciasAcumuladas: '',
  acumuladoPrimaria: null,
  config: PROGRAMA_JORNADA,
  evidenciasArguicao: EXTRACAO,
  ledger: { empresaId: 'emp-1', colaboradorId: 'col-1' },
};

// Corpo em bloco: `mockReset()` devolve o próprio mock, e o Vitest chama o que
// o beforeEach devolve como limpeza, ou seja, chamaria a "IA" sem argumentos.
beforeEach(() => { mockAI.mockReset(); });

describe('redação final: a nota mudou depois do texto', () => {
  it('reescreve a devolutiva entre o scorer e o auditor, com as notas finais', async () => {
    const ordem: string[] = [];
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] }, (t) => ordem.push(t));
    const r = await pontuarFechamento(ARGS as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;

    expect(ordem).toEqual(['sem14_scorer', 'sem14_redacao', 'sem14_check']);
    expect(r.meta.redacao).toBe('reescrita');
    expect(r.parsed.resumo_avaliacao).toEqual(REDIGIDO);
    expect(r.parsed.resumo_avaliacao_rascunho.principal_avanco).toBe('RASCUNHO foco em valor');
    expect(r.parsed.redacao_final).toEqual({ status: 'reescrita', descritores_com_nota_alterada: 2 });

    // A redação recebe o que o rascunho não sabia: nota final, nota do rascunho e a defesa.
    const [sistema, usuario] = chamadas('sem14_redacao')[0] as any[];
    expect(sistema).toContain('REGRAS DA REESCRITA');
    expect(usuario).toContain('Foco em valor: início 2,6, final 2,8 (avanço final +0,2).');
    expect(usuario).toContain('O rascunho foi escrito com 3,3.');
    expect(usuario).toContain('Na defesa oral, fragilizou, força forte: "não tinha pensado nos dados".');
    expect(usuario).toContain('RASCUNHO foco em valor');
    // Maior avanço final primeiro: Adaptação (+1,1), Clareza (+0,6), Foco em valor (+0,3).
    expect(usuario.indexOf('1. Adaptação: início')).toBeGreaterThan(-1);
    expect(usuario.indexOf('Clareza: início')).toBeLessThan(usuario.indexOf('Foco em valor: início'));
  });

  it('o auditor lê o texto novo e a regra do ajuste, nunca o rascunho', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    await pontuarFechamento(ARGS as any);
    const [sistema, usuario] = chamadas('sem14_check')[0] as any[];
    expect(sistema).toContain('AJUSTE DA DEFESA ORAL');
    expect(sistema).toContain('A diferença até a nota_pos é o ajuste: não é contradição nem erro grave.');
    expect(usuario).toContain('- Adaptação: aprofundou (forte): "eu mudaria a ordem dos recursos"');
    expect(usuario).toContain('NOVO adaptação ao comprador');
    expect(usuario).not.toContain('RASCUNHO');
    expect(usuario).not.toContain('resumo_avaliacao_rascunho');
    expect(usuario).not.toContain('redacao_final');
  });

  it('a justificativa ganha a linha do ajuste; sem ajuste, fica como veio', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    const r = await pontuarFechamento(ARGS as any);
    if (r.ok !== true) throw new Error('esperava ok');
    const porNome = (n: string) => r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === n);
    expect(porNome('Foco em valor').justificativa).toContain(
      'Defesa oral: fragilizou (forte). Ajuste de -0,5 sobre a nota antes da defesa (3,3 → 2,8); o texto acima trata da nota antes da defesa.',
    );
    expect(porNome('Adaptação').justificativa).toContain('Ajuste de +0,5 sobre a nota antes da defesa (3,2 → 3,7);');
    expect(porNome('Clareza').justificativa).toBe('Direto ao ponto.');
    // A classificação acompanha o delta FINAL: o scorer dizia "evoluiu" (+0,7);
    // depois do ajuste o delta é +0,2, que pela régua é "manteve".
    expect(porNome('Foco em valor').classificacao).toBe('manteve');
    expect(porNome('Adaptação').classificacao).toBe('evoluiu');
    // O nível também, pela régua oficial (N3 vai até 3,50): 2,8 é N2 e 3,7 é N4.
    expect(porNome('Foco em valor').nivel_rubrica).toBe('em_desenvolvimento');
    expect(porNome('Adaptação').nivel_rubrica).toBe('referencia');
  });

  it('a redação vê as MESMAS evidências das semanas que o scorer viu', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    await pontuarFechamento({ ...ARGS, evidenciasAcumuladas: 'Sem 3: renegociou o prazo com o cliente.' } as any);
    const usuario = String(chamadas('sem14_redacao')[0][1]);
    expect(usuario).toContain('EVIDÊNCIAS DAS 6 SEMANAS');
    expect(usuario).toContain('Sem 3: renegociou o prazo com o cliente.');
  });

  it('sem evidências das semanas, a redação é avisada disso (não inventa trajetória)', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    await pontuarFechamento(ARGS as any);
    const [sistema, usuario] = chamadas('sem14_redacao')[0] as any[];
    expect(usuario).toContain('(sem evidências registradas nas semanas)');
    expect(sistema).toContain('Se elas vierem vazias, fale só do que apareceu no cenário e na defesa oral');
    expect(sistema).toContain('Não compare COLAB_A1B2 com outras pessoas nem use superlativo sem base');
  });

  it('atribuição de ledger e taskKey próprio na chamada da redação', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    await pontuarFechamento(ARGS as any);
    expect(chamadas('sem14_redacao')[0][4]).toMatchObject({ taskKey: 'sem14_redacao', empresaId: 'emp-1', colaboradorId: 'col-1' });
  });
});

describe('redação final: quando NÃO roda ou falha', () => {
  it('arguição que só confirma: nenhuma nota muda, sem chamada de redação', async () => {
    responder({ sem14_scorer: [SCORE], sem14_check: [CHECK] });
    const r = await pontuarFechamento({
      ...ARGS,
      evidenciasArguicao: { ...EXTRACAO, evidencias_por_descritor: EXTRACAO.evidencias_por_descritor.map((e) => ({ ...e, sustentou: 'confirmou' })) },
    } as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(chamadas('sem14_redacao')).toHaveLength(0);
    expect(r.meta.redacao).toBe('desnecessaria');
    expect(r.parsed.resumo_avaliacao.principal_avanco).toBe('RASCUNHO foco em valor');
    expect(r.parsed.resumo_avaliacao_rascunho).toBeNull();
    expect(r.parsed.redacao_final).toEqual({ status: 'desnecessaria', descritores_com_nota_alterada: 0 });
  });

  it('resposta sem um dos quatro textos: mantém o rascunho INTEIRO e avisa', async () => {
    const semFecho = { ...REDIGIDO, mensagem_final: '' };
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: semFecho })], sem14_check: [CHECK] });
    const r = await pontuarFechamento(ARGS as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.redacao).toBe('falhou');
    expect(r.parsed.resumo_avaliacao.principal_avanco).toBe('RASCUNHO foco em valor');
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('RASCUNHO');
    expect(r.parsed.resumo_avaliacao_rascunho).toBeNull();
    expect(r.meta.warnings.some((w) => w.startsWith('redação final falhou'))).toBe(true);
    expect(r.auditoria?.nota_auditoria).toBe(88); // o auditor roda mesmo assim
  });

  it('IA da redação quebra: a nota sai do mesmo jeito', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: ['isto não é json'], sem14_check: [CHECK] });
    const r = await pontuarFechamento(ARGS as any);
    expect(r.ok).toBe(true);
    if (r.ok !== true) return;
    expect(r.meta.redacao).toBe('falhou');
    expect(r.parsed.avaliacao_por_descritor.find((d: any) => d.descritor === 'Adaptação').nota_pos).toBe(3.7);
  });
});

describe('redação final: prazo', () => {
  const AGORA = Date.parse('2026-09-18T15:00:00Z');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(AGORA); });
  afterEach(() => vi.useRealTimers());

  it('timeoutDaRedacao: teto de 60 s, reserva para gravar e null quando não cabe', () => {
    expect(timeoutDaRedacao(undefined, AGORA)).toBeUndefined();
    expect(timeoutDaRedacao(AGORA + 285_000, AGORA)).toBe(60_000);
    expect(timeoutDaRedacao(AGORA + 40_000, AGORA)).toBe(30_000);
    expect(timeoutDaRedacao(AGORA + 20_000, AGORA)).toBeNull();
  });

  it('sem tempo depois do scorer: pula a redação e registra o motivo', async () => {
    mockAI.mockImplementation((async (_s: string, _u: string, _c: unknown, _m: unknown, opts: any) => {
      if (opts?.taskKey === 'sem14_scorer') { vi.setSystemTime(AGORA + 262_000); return SCORE; }
      throw new Error(`não deveria chamar ${opts?.taskKey}`);
    }) as any);
    const r = await pontuarFechamento({ ...ARGS, prazoMs: AGORA + 285_000 } as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.redacao).toBe('pulada-sem-tempo');
    expect(chamadas('sem14_redacao')).toHaveLength(0);
    expect(r.parsed.redacao_final.status).toBe('pulada-sem-tempo');
  });

  it('com prazo: a redação recebe o que sobra, até 60 s', async () => {
    responder({ sem14_scorer: [SCORE], sem14_redacao: [JSON.stringify({ resumo_avaliacao: REDIGIDO })], sem14_check: [CHECK] });
    await pontuarFechamento({ ...ARGS, prazoMs: AGORA + 285_000 } as any);
    expect((chamadas('sem14_redacao')[0][4] as any).timeoutMs).toBe(60_000);
  });
});

describe('redação final no piloto: a mesma trava de duração', () => {
  const SCORE_PILOTO = JSON.stringify({
    avaliacao_por_descritor: [{ descritor: 'D1', nota_pre: 2.0, nota_pos: 1.5, justificativa: 'j1' }], // abaixo do piso
    resumo_avaliacao: { mensagem_geral: 'COLAB_A1B2, na degustação de 2 semanas você mostrou o método.' },
  });
  const argsPiloto = {
    ...ARGS,
    descritores: [{ descritor: 'D1', nota_atual: 2.0 }],
    config: PROGRAMA_PILOTO,
    evidenciasArguicao: null,
  };
  const redigido = (mensagem_geral: string) => JSON.stringify({ resumo_avaliacao: { ...REDIGIDO, mensagem_geral } });

  it('frase de duração corrigível no texto novo é corrigida', async () => {
    responder({ sem14_scorer: [SCORE_PILOTO], sem14_redacao: [redigido('COLAB_A1B2, ao final de 14 semanas você mostrou o método.')], sem14_check: [CHECK] });
    const r = await pontuarFechamento(argsPiloto as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.redacao).toBe('reescrita');
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toContain('ao final de 2 semanas');
    expect(r.meta.sanitizacaoAplicada).toBe(true);
  });

  it('duração errada incorrigível: descarta o texto novo e fica o rascunho', async () => {
    responder({ sem14_scorer: [SCORE_PILOTO], sem14_redacao: [redigido('COLAB_A1B2, em 11 das 13 semanas não houve registro.')], sem14_check: [CHECK] });
    const r = await pontuarFechamento(argsPiloto as any);
    if (r.ok !== true) throw new Error('esperava ok');
    expect(r.meta.redacao).toBe('falhou');
    expect(r.parsed.resumo_avaliacao.mensagem_geral).toBe('COLAB_A1B2, na degustação de 2 semanas você mostrou o método.');
  });
});
