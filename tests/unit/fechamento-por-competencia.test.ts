import { describe, it, expect } from 'vitest';
import {
  acumuladoDaCompetencia, cenariosDoSlot, descritoresDoFechamento, descritoresHomonimos, descritoresPorCompetencia, mesclarPontuacoes,
  posicaoNoFechamento, respostaDoCenario, respostasDosCenarios, rotuloDasCompetencias, textoDosCenarios,
  type CenarioDoFechamento,
} from '@/lib/season-engine/fechamento-por-competencia';
import { validateEvolutionScenarioScore } from '@/lib/season-engine/prompts/evolution-scenario';

/**
 * O fechamento do Onboarding: 5 cenários (um por competência) no slot, e as 5
 * pontuações juntadas no formato de UMA competência (decisão do dono, 04/10/2026).
 */

const PERGUNTAS = ['SITUAÇÃO', 'AÇÃO', 'RACIOCÍNIO', 'AUTOSSENSIBILIDADE'].map((d) => ({ dimensao: d, texto: `pergunta ${d}` }));
const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];

/** O transcript de um cenário com `n` respostas (a pergunta é aberta antes de cada resposta). */
function transcript(n: number, prefixo = 'r') {
  const t: any[] = [{ role: 'assistant', content: '**SITUAÇÃO**' }];
  for (let i = 0; i < n; i++) {
    t.push({ role: 'user', content: `${prefixo}${i + 1}` });
    if (i < 3) t.push({ role: 'assistant', content: `**p${i + 2}**` });
  }
  return t;
}
const cenario = (competencia: string, respostas: number): CenarioDoFechamento => ({
  competencia, cenario_b_id: `b-${competencia}`, cenario: `## ${competencia}\n\ntexto do caso`,
  perguntas: PERGUNTAS, transcript_completo: transcript(respostas, competencia.slice(-1).toLowerCase()),
});
const SLOT = (respondidas: number[]) => ({ cenarios: COMPETENCIAS.map((c, i) => cenario(c, respondidas[i])) });

describe('cenariosDoSlot: o formato do slot decide, não o modo', () => {
  it('slot de uma competência (cenario/perguntas/transcript_completo): null, nada muda', () => {
    expect(cenariosDoSlot({ cenario: '## C', perguntas: PERGUNTAS, transcript_completo: [] })).toBeNull();
    expect(cenariosDoSlot(null)).toBeNull();
    expect(cenariosDoSlot({ cenarios: [] })).toBeNull();
    expect(cenariosDoSlot({ cenarios: 'x' })).toBeNull();
  });

  it('lista de cenários: normaliza e preserva o id do B e a conversa de cada um', () => {
    const lista = cenariosDoSlot(SLOT([4, 0, 0, 0, 0]))!;
    expect(lista).toHaveLength(5);
    expect(lista[0]).toMatchObject({ competencia: 'Comp A', cenario_b_id: 'b-Comp A' });
    expect(lista[1].transcript_completo).toEqual(transcript(0, 'b'));
    expect(cenariosDoSlot({ cenarios: [{ competencia: 'X' }] })![0]).toEqual({
      competencia: 'X', cenario_b_id: null, cenario: '', perguntas: [], transcript_completo: [],
    });
  });
});

describe('posicaoNoFechamento: retomar volta ao cenário e à pergunta em que a pessoa parou', () => {
  it('nada respondido: cenário 1, pergunta 1', () => {
    expect(posicaoNoFechamento(cenariosDoSlot(SLOT([0, 0, 0, 0, 0]))!)).toMatchObject({
      totalCenarios: 5, totalPerguntas: 20, totalRespostas: 0, cenarioAtual: 0, perguntaAtual: 0,
    });
  });

  it('no meio do 3º cenário: ele e a próxima pergunta (a 3ª), com as 10 respostas anteriores contadas', () => {
    expect(posicaoNoFechamento(cenariosDoSlot(SLOT([4, 4, 2, 0, 0]))!)).toMatchObject({
      totalRespostas: 10, cenarioAtual: 2, perguntaAtual: 2,
    });
  });

  it('cenário fechado: a próxima é a 1ª pergunta do seguinte', () => {
    expect(posicaoNoFechamento(cenariosDoSlot(SLOT([4, 0, 0, 0, 0]))!)).toMatchObject({ cenarioAtual: 1, perguntaAtual: 0 });
  });

  it('as 20 respondidas: sem posição (só falta a arguição ou a nota)', () => {
    expect(posicaoNoFechamento(cenariosDoSlot(SLOT([4, 4, 4, 4, 4]))!)).toMatchObject({
      totalRespostas: 20, cenarioAtual: null, perguntaAtual: null,
    });
  });

  it('fala duplicada além das perguntas não passa o cenário nem a conta (limitada às perguntas dele)', () => {
    const lista = cenariosDoSlot(SLOT([4, 0, 0, 0, 0]))!;
    lista[0].transcript_completo.push({ role: 'user', content: 'fala a mais' });
    expect(posicaoNoFechamento(lista)).toMatchObject({ totalRespostas: 4, cenarioAtual: 1 });
  });

  it('a contagem de perguntas é a REAL de cada cenário (um B com 3 perguntas não vira 4)', () => {
    const lista = cenariosDoSlot(SLOT([0, 0, 0, 0, 0]))!;
    lista[2] = { ...lista[2], perguntas: PERGUNTAS.slice(0, 3) };
    expect(posicaoNoFechamento(lista).totalPerguntas).toBe(19);
  });
});

describe('os textos dos 5 cenários e das 20 respostas', () => {
  const lista = cenariosDoSlot(SLOT([4, 4, 4, 4, 4]))!;

  it('respostaDoCenario: [DIMENSÃO] pergunta e a resposta, no formato do cenário único', () => {
    expect(respostaDoCenario(lista[0])).toBe(
      '[SITUAÇÃO] pergunta SITUAÇÃO\n→ a1\n\n[AÇÃO] pergunta AÇÃO\n→ a2\n\n[RACIOCÍNIO] pergunta RACIOCÍNIO\n→ a3\n\n[AUTOSSENSIBILIDADE] pergunta AUTOSSENSIBILIDADE\n→ a4',
    );
  });

  it('as N PRIMEIRAS falas respondem as perguntas (uma 5ª, duplicada, não entra) e a que falta é dita', () => {
    const c = cenariosDoSlot(SLOT([4, 0, 0, 0, 0]))![0];
    c.transcript_completo.push({ role: 'user', content: 'duplicada 5' });
    const texto = respostaDoCenario(c);
    expect(texto).not.toContain('duplicada 5');
    expect((texto.match(/→ /g) || []).length).toBe(4);
    expect(respostaDoCenario(cenariosDoSlot(SLOT([1, 0, 0, 0, 0]))![0])).toContain('→ (sem resposta)');
  });

  it('as 20 respostas em blocos, com o nome da competência de cada bloco', () => {
    const texto = respostasDosCenarios(lista);
    expect(texto.split('### ').length - 1).toBe(5);
    expect(texto.indexOf('### Comp A')).toBeLessThan(texto.indexOf('### Comp B'));
    expect((texto.match(/→ /g) || []).length).toBe(20);
  });

  it('os 5 cenários num texto só, na ordem, e o rótulo da trilha', () => {
    const texto = textoDosCenarios(lista);
    expect(texto.split('### Competência: ').length - 1).toBe(5);
    expect(texto).toContain('## Comp C\n\ntexto do caso');
    expect(rotuloDasCompetencias(lista)).toBe('Comp A + Comp B + Comp C + Comp D + Comp E');
  });
});

describe('descritoresPorCompetencia', () => {
  const D = (competencia: string | undefined, descritor: string) => ({ competencia, descritor });

  it('separa por competência, na ordem dos cenários, casando o nome sem caixa nem espaços', () => {
    const { grupos, semCenario } = descritoresPorCompetencia(
      [D('comp b', 'b1'), D('Comp A', 'a1'), D(' COMP A ', 'a2'), D('Comp B', 'b2')],
      ['Comp A', 'Comp B'],
    );
    expect(grupos.map((g) => [g.competencia, g.descritores.map((d) => d.descritor)])).toEqual([
      ['Comp A', ['a1', 'a2']], ['Comp B', ['b1', 'b2']],
    ]);
    expect(semCenario).toEqual([]);
  });

  it('descritor sem competência, ou de uma que não tem cenário, volta em semCenario (quem chama recusa)', () => {
    const { semCenario } = descritoresPorCompetencia([D(undefined, 'x'), D('Outra', 'y'), D('Comp A', 'a')], ['Comp A']);
    expect(semCenario.map((d) => d.descritor)).toEqual(['x', 'y']);
  });

  it('descritores homônimos entre competências são acusados', () => {
    const { grupos } = descritoresPorCompetencia(
      [D('Comp A', 'Escuta ativa'), D('Comp B', ' escuta ATIVA'), D('Comp B', 'Outro')], ['Comp A', 'Comp B'],
    );
    expect(descritoresHomonimos(grupos)).toEqual(['escuta ativa']);
    expect(descritoresHomonimos(descritoresPorCompetencia([D('Comp A', 'x'), D('Comp B', 'y')], ['Comp A', 'Comp B']).grupos)).toEqual([]);
  });
});

describe('acumuladoDaCompetencia', () => {
  it('só as avaliações dos descritores da competência (e da competência, quando o item a traz); o resumo fica inteiro', () => {
    const acum = {
      multi: true, resumo_geral: 'resumo',
      avaliacao_acumulada: [
        { descritor: 'a1', competencia: 'Comp A', nota_acumulada: 2 },
        { descritor: 'b1', competencia: 'Comp B', nota_acumulada: 3 },
        { descritor: 'a1', competencia: 'Comp B', nota_acumulada: 4 },
      ],
    };
    const r = acumuladoDaCompetencia(acum, [{ descritor: 'a1' }], 'Comp A');
    expect(r.avaliacao_acumulada).toEqual([{ descritor: 'a1', competencia: 'Comp A', nota_acumulada: 2 }]);
    expect(r.resumo_geral).toBe('resumo');
  });

  it('sem lista de avaliações (ou sem acumulado), devolve como veio', () => {
    expect(acumuladoDaCompetencia(null, [], 'x')).toBeNull();
    expect(acumuladoDaCompetencia({ resumo_geral: 'r' }, [], 'x')).toEqual({ resumo_geral: 'r' });
  });
});

// ── Juntar as pontuações ────────────────────────────────────────────────────

/** A saída de UM scorer, já validada (o que `pontuarFechamento` recebe de cada rodada). */
function saidaDoScorer(descritores: Array<[string, number, number, number]>, extra: Record<string, unknown> = {}) {
  return validateEvolutionScenarioScore({
    avaliacao_por_descritor: descritores.map(([descritor, pre, cenarioNota, pos]) => ({
      descritor, nota_pre: pre, nota_acumulada: null, nota_cenario: cenarioNota, nota_pos: pos,
      justificativa: `justifica ${descritor}`, trecho_cenario: 't', evidencia_acumulada: 'e', limites_da_leitura: ['l'],
    })),
    resumo_avaliacao: {
      mensagem_geral: 'geral', evidencias_citadas: ['ev'], principal_avanco: 'avanço',
      principal_ponto_de_atencao: 'atenção', mensagem_final: 'fecho', proximos_passos: ['Praticar X'],
    },
    alertas_metodologicos: ['alerta'],
    ...extra,
  });
}

describe('mesclarPontuacoes: o mesmo formato de uma competência só', () => {
  const partes = () => [
    { competencia: 'Comp A', parsed: saidaDoScorer([['a1', 1.5, 2.0, 2.0], ['a2', 2.0, 2.5, 2.5]]) },
    { competencia: 'Comp B', parsed: saidaDoScorer([['b1', 1.0, 3.0, 3.0]], { alertas_metodologicos: [] }) },
  ];

  it('os descritores de todas, na ordem dos cenários, cada um com a competência de onde veio', () => {
    const m = mesclarPontuacoes(partes());
    expect(m.avaliacao_por_descritor.map((d: any) => [d.competencia, d.descritor])).toEqual([
      ['Comp A', 'a1'], ['Comp A', 'a2'], ['Comp B', 'b1'],
    ]);
  });

  it('cada descritor guarda TODOS os campos que o relatório, o Evolution Report e o certificado leem', () => {
    const d = mesclarPontuacoes(partes()).avaliacao_por_descritor[0];
    for (const campo of ['descritor', 'nota_pre', 'nota_acumulada', 'nota_cenario', 'nota_pos', 'delta', 'classificacao', 'nivel_rubrica', 'consistencia_com_acumulado', 'justificativa', 'trecho_cenario', 'evidencia_acumulada', 'limites_da_leitura']) {
      expect(d, campo).toHaveProperty(campo);
    }
    expect(d).toMatchObject({ descritor: 'a1', nota_pre: 1.5, nota_cenario: 2, nota_pos: 2, delta: 0.5, classificacao: 'evoluiu' });
  });

  it('as médias são refeitas sobre o CONJUNTO pela mesma conta do validador (uma casa decimal)', () => {
    const m = mesclarPontuacoes(partes());
    // pre: (1.5 + 2.0 + 1.0) / 3 = 1.5 ; pos: (2.0 + 2.5 + 3.0) / 3 = 2.5 ; cenário idem
    expect(m.nota_media_pre).toBe(1.5);
    expect(m.nota_media_cenario).toBe(2.5);
    expect(m.nota_media_pos).toBe(2.5);
    expect(m.delta_medio).toBe(1);
    expect(m.nota_media_acumulada).toBeNull();
  });

  it('é o MESMO formato do scorer de uma competência: as chaves de topo e as do descritor iguais', () => {
    const unica = saidaDoScorer([['a1', 1.5, 2.0, 2.0], ['a2', 2.0, 2.5, 2.5]]);
    const m = mesclarPontuacoes([{ competencia: 'Comp A', parsed: unica }]);
    const chavesDe = (o: any) => Object.keys(o).sort();
    // as do scorer, mais SÓ a informação nova (`avaliacao_por_competencia`)
    expect(chavesDe(m)).toEqual([...chavesDe(unica), 'avaliacao_por_competencia'].sort());
    expect(chavesDe(m.avaliacao_por_descritor[0])).toEqual([...chavesDe(unica.avaliacao_por_descritor[0]), 'competencia'].sort());
    expect(chavesDe(m.resumo_avaliacao)).toEqual(chavesDe(unica.resumo_avaliacao));
    // e com UMA competência os números do conjunto são os do scorer
    for (const k of ['nota_media_pre', 'nota_media_acumulada', 'nota_media_cenario', 'nota_media_pos', 'delta_medio']) {
      expect(m[k], k).toEqual(unica[k]);
    }
    expect(m.avaliacao_por_descritor.map(({ competencia: _c, ...d }: any) => d)).toEqual(unica.avaliacao_por_descritor);
  });

  it('o resumo é um RASCUNHO com o texto de cada competência (a redação final escreve a devolutiva)', () => {
    const r = mesclarPontuacoes(partes()).resumo_avaliacao;
    expect(r.mensagem_geral).toBe('Comp A: geral\n\nComp B: geral');
    expect(r.mensagem_final).toContain('Comp B: fecho');
    expect(r.evidencias_citadas).toEqual(['ev']);
  });

  it('próximos passos: o primeiro de cada competência e depois os demais, no teto de 3 do validador', () => {
    const cinco = COMPETENCIAS.map((c, i) => ({
      competencia: c,
      parsed: saidaDoScorer([[`d${i}`, 1.5, 2, 2]], { resumo_avaliacao: { mensagem_geral: 'g', principal_avanco: 'a', principal_ponto_de_atencao: 'p', mensagem_final: 'f', proximos_passos: [`${c} passo 1`, `${c} passo 2`] } }),
    }));
    expect(mesclarPontuacoes(cinco).resumo_avaliacao.proximos_passos).toEqual(['Comp A passo 1', 'Comp B passo 1', 'Comp C passo 1']);
  });

  it('alertas de todas, com a competência na frente; e a média de cada competência fica registrada', () => {
    const m = mesclarPontuacoes(partes());
    expect(m.alertas_metodologicos).toEqual(['Comp A: alerta']);
    expect(m.avaliacao_por_competencia).toEqual([
      { competencia: 'Comp A', descritores: 2, nota_media_pre: 1.8, nota_media_cenario: 2.3, nota_media_pos: 2.3, delta_medio: 0.5 },
      { competencia: 'Comp B', descritores: 1, nota_media_pre: 1, nota_media_cenario: 3, nota_media_pos: 3, delta_medio: 2 },
    ]);
  });

  it('uma competência sem nota (null) não vira zero nas médias do conjunto', () => {
    const semNota = saidaDoScorer([['c1', 1.5, 2.0, 2.0]]);
    semNota.avaliacao_por_descritor[0].nota_pos = null;
    const m = mesclarPontuacoes([{ competencia: 'A', parsed: saidaDoScorer([['a', 2.0, 3.0, 3.0]]) }, { competencia: 'B', parsed: semNota }]);
    expect(m.nota_media_pos).toBe(3);
  });
});

// ── O conjunto de descritores que o B pontua (decisão do dono: os 6 da competência) ─────────
describe('descritoresDoFechamento: os descritores que o Cenário A avaliou, não só os 4 do conteúdo', () => {
  const sel = (competencia: string, descritor: string, nota_atual: number) => ({
    competencia, descritor, nota_atual, gap: 1, semanas_alocadas: 1, semanas_ids: [2],
  });
  const linha = (competencia: string, descritor: string, nota: number | string) => ({ competencia, descritor, nota });
  /** Seis linhas do mapeamento da competência: d1..d4 são os 4 de menor nota (os selecionados), d5 e d6 sobram. */
  const mapa = (competencia: string) => [
    linha(competencia, 'd1', 1.0), linha(competencia, 'd2', 1.5), linha(competencia, 'd3', 2.0),
    linha(competencia, 'd4', 2.5), linha(competencia, 'd5', 3.0), linha(competencia, 'd6', 3.5),
  ];
  const selecionadosDe = (competencia: string) => ['d1', 'd2', 'd3', 'd4'].map((d, i) => sel(competencia, d, [1.0, 1.5, 2.0, 2.5][i]));

  it('6 por competência (4 da trilha + 2 só do mapeamento): 30 nas 5, na ordem das competências', () => {
    const { descritores, semMapeamento } = descritoresDoFechamento(
      COMPETENCIAS.flatMap(selecionadosDe), COMPETENCIAS.flatMap(mapa), COMPETENCIAS,
    );
    expect(descritores).toHaveLength(30);
    expect(semMapeamento).toEqual([]);
    expect(descritores.map((d) => d.competencia)).toEqual(COMPETENCIAS.flatMap((c) => Array(6).fill(c)));
    expect(descritores.slice(0, 6).map((d) => d.descritor)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6']);
  });

  it('os da trilha entram INTACTOS (gap, semanas), e os do mapeamento entram só com o que a seleção guarda', () => {
    const { descritores } = descritoresDoFechamento(selecionadosDe('Comp A'), mapa('Comp A'), ['Comp A']);
    expect(descritores[0]).toEqual({ competencia: 'Comp A', descritor: 'd1', nota_atual: 1, gap: 1, semanas_alocadas: 1, semanas_ids: [2] });
    expect(descritores[4]).toEqual({ competencia: 'Comp A', descritor: 'd5', nota_atual: 3 });
    expect(descritores[5]).toEqual({ competencia: 'Comp A', descritor: 'd6', nota_atual: 3.5 });
  });

  it('os que só o mapeamento tem vêm do menor nível para o maior, e no empate por nome (ordem estável)', () => {
    const linhas = [linha('Comp A', 'zeta', 3.0), linha('Comp A', 'beta', 2.0), linha('Comp A', 'alfa', 2.0), linha('Comp A', 'omega', '1.5')];
    const { descritores } = descritoresDoFechamento([], linhas, ['Comp A']);
    expect(descritores.map((d) => d.descritor)).toEqual(['omega', 'alfa', 'beta', 'zeta']);
    expect(descritores[0].nota_atual).toBe(1.5); // `numeric` do banco pode chegar como texto
  });

  it('a mesma lista, embaralhada, dá o mesmo resultado (não depende da ordem de leitura do banco)', () => {
    const a = descritoresDoFechamento(selecionadosDe('Comp A'), mapa('Comp A'), ['Comp A']).descritores;
    const b = descritoresDoFechamento(selecionadosDe('Comp A'), [...mapa('Comp A')].reverse(), ['Comp A']).descritores;
    expect(b).toEqual(a);
  });

  it('descritor repetido no mapeamento, ou já selecionado (caixa e espaços), não entra duas vezes', () => {
    const { descritores } = descritoresDoFechamento(
      selecionadosDe('Comp A'),
      [...mapa('Comp A'), linha('Comp A', ' D1 ', 1.0), linha('Comp A', 'd5', 3.0)],
      ['Comp A'],
    );
    expect(descritores.map((d) => d.descritor)).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'd6']);
  });

  it('a competência casa sem diferença de caixa e espaços; o nome gravado é o da trilha', () => {
    const { descritores } = descritoresDoFechamento(selecionadosDe('Comp A'), mapa(' comp a '), ['Comp A']);
    expect(descritores).toHaveLength(6);
    expect(descritores[5].competencia).toBe('Comp A');
  });

  it('as linhas do mapeamento de OUTRA competência não entram', () => {
    const { descritores } = descritoresDoFechamento(selecionadosDe('Comp A'), [...mapa('Comp A'), ...mapa('Comp X')], ['Comp A']);
    expect(descritores).toHaveLength(6);
    expect(descritores.every((d) => d.competencia === 'Comp A')).toBe(true);
  });

  it('competência SEM linha no mapeamento: fica só com os da trilha e vem listada em `semMapeamento`', () => {
    const r = descritoresDoFechamento(
      [...selecionadosDe('Comp A'), ...selecionadosDe('Comp B')], mapa('Comp A'), ['Comp A', 'Comp B'],
    );
    expect(r.descritores).toHaveLength(10);
    expect(r.semMapeamento).toEqual(['Comp B']);
  });

  it('descritor da trilha de competência fora da lista vai para o FIM, intacto (quem monta as entradas o recusa)', () => {
    const orfao = sel('Outra', 'x1', 2);
    const { descritores } = descritoresDoFechamento([...selecionadosDe('Comp A'), orfao], mapa('Comp A'), ['Comp A']);
    expect(descritores).toHaveLength(7);
    expect(descritores[6]).toBe(orfao);
    const { grupos, semCenario } = descritoresPorCompetencia(descritores, ['Comp A']);
    expect(grupos[0].descritores).toHaveLength(6);
    expect(semCenario).toEqual([orfao]);
  });

  it('o mapeamento NÃO muda quem foi selecionado: o que a trilha tem fica, mesmo que o mapeamento tenha mudado de nota', () => {
    const { descritores } = descritoresDoFechamento(
      [sel('Comp A', 'd1', 1.0)], [linha('Comp A', 'd1', 3.9), linha('Comp A', 'd2', 2.0)], ['Comp A'],
    );
    expect(descritores.map((d) => [d.descritor, d.nota_atual])).toEqual([['d1', 1], ['d2', 2]]);
  });
});
