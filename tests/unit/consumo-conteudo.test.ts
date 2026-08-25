import { describe, it, expect } from 'vitest';
import {
  consumiuConteudo,
  cursosConcluidos,
  marcarSemanaConsumida,
  marcarCursoConcluido,
} from '@/lib/season-engine/consumo-conteudo';
import { temTrabalhoDoColaborador } from '@/lib/season-engine/trilha-core';

/**
 * `temporada_semana_progresso.conteudo_consumido` tinha DOIS escritores com
 * formatos diferentes (boolean da marcação manual, array do video-tracking) e
 * SEIS leitores com réguas que discordavam entre si. Este arquivo trava a régua
 * única e o fato de as duas escritas não se destruírem mais.
 *
 * Estado medido em 25/08/2026, e ele importa para ler estes testes: das 941
 * linhas da tabela, 838 são `false` e 103 são `true` — ZERO em array. O ramo do
 * array é hoje inalcançável (0 de 87 trilhas têm `cursos` preenchido). Ou seja,
 * os casos de array abaixo são sobre o dia em que o primeiro curso for
 * cadastrado, não sobre dado existente.
 */

describe('consumiuConteudo — a régua única', () => {
  it('boolean true é consumido; false e null não', () => {
    expect(consumiuConteudo(true)).toBe(true);
    expect(consumiuConteudo(false)).toBe(false);
    expect(consumiuConteudo(null)).toBe(false);
    expect(consumiuConteudo(undefined)).toBe(false);
  });

  it('🔴 ARRAY VAZIO é NÃO consumido — a divergência que existia', () => {
    // A tela fazia `!conteudo_consumido`: `![]` é `false`, logo "consumido", e
    // isso DESTRAVAVA o botão de Evidências. O painel de engajamento, com
    // `some(concluido)`, contava a mesma pessoa como não-consumida.
    expect(consumiuConteudo([])).toBe(false);
    // A régua antiga, explicitada para a diferença não virar folclore. Passa
    // por `unknown` porque o TS sabe que um literal `[]` é sempre truthy e
    // recusa `![]` — o que é exatamente o ponto: em JS isso era um `false`
    // silencioso no meio de um `disabled=`.
    const reguaAntiga = (v: unknown) => !v;
    expect(reguaAntiga([])).toBe(false);        // "consumido" — destravava o botão
    expect(consumiuConteudo([])).toBe(false);   // a régua nova discorda, e é a certa
  });

  it('array só conta com pelo menos um curso concluído', () => {
    expect(consumiuConteudo([{ semana: 1, concluido: false }])).toBe(false);
    expect(consumiuConteudo([{ semana: 1, concluido: true }])).toBe(true);
    expect(consumiuConteudo([{ semana: 1, concluido: false }, { semana: 2, concluido: true }])).toBe(true);
  });

  it('lixo não vira consumo', () => {
    expect(consumiuConteudo('sim')).toBe(false);
    expect(consumiuConteudo(1)).toBe(false);
    expect(consumiuConteudo({ concluido: true })).toBe(false); // objeto ≠ array
  });
});

describe('cursosConcluidos — a OUTRA pergunta', () => {
  it('devolve só os concluídos, e nunca confunde com o booleano', () => {
    expect(cursosConcluidos([{ semana: 1, concluido: true }, { semana: 2, concluido: false }]))
      .toEqual([{ semana: 1, concluido: true }]);
    expect(cursosConcluidos(true)).toEqual([]);
    expect(cursosConcluidos(null)).toEqual([]);
  });
});

describe('as duas escritas param de se destruir', () => {
  it('marcar a semana sobre um BOOLEAN continua booleano', () => {
    expect(marcarSemanaConsumida(false, 3)).toBe(true);
    expect(marcarSemanaConsumida(null, 3)).toBe(true);
    expect(marcarSemanaConsumida(true, 3)).toBe(true);
  });

  it('🔴 marcar a semana sobre um ARRAY não apaga os cursos', () => {
    // Antes: `conteudo_consumido: true` cru — a lista de cursos da pessoa
    // sumia, e `/dashboard/praticar` e a home a perdiam junto.
    const antes = [{ semana: 1, concluido: true, concluido_em: '2026-08-01T00:00:00Z' }];
    const depois = marcarSemanaConsumida(antes, 3) as any[];
    expect(Array.isArray(depois)).toBe(true);
    expect(depois).toHaveLength(2);
    expect(depois[0]).toEqual(antes[0]);                       // o curso antigo intacto
    expect(depois[1]).toMatchObject({ semana: 3, concluido: true });
    expect(consumiuConteudo(depois)).toBe(true);
  });

  it('🔴 concluir um curso sobre um TRUE não apaga a marcação da semana', () => {
    // Antes: `Array.isArray(x) ? [...x] : []` — o `true` virava array VAZIO e a
    // semana voltava a contar como não consumida.
    const depois = marcarCursoConcluido(true, 5);
    expect(consumiuConteudo(depois)).toBe(true);
    expect(depois).toEqual([expect.objectContaining({ semana: 5, concluido: true })]);
  });

  it('concluir curso é idempotente', () => {
    const um = marcarCursoConcluido([], 2);
    const dois = marcarCursoConcluido(um, 2);
    expect(dois).toHaveLength(1);
    expect(dois[0].concluido_em).toBe(um[0].concluido_em); // não recarimba
  });

  it('marcar a semana duas vezes não duplica a entrada', () => {
    const um = marcarSemanaConsumida([{ semana: 9, concluido: false }], 9) as any[];
    const dois = marcarSemanaConsumida(um, 9) as any[];
    expect(dois).toHaveLength(1);
    expect(dois[0]).toMatchObject({ semana: 9, concluido: true });
  });
});

describe('temTrabalhoDoColaborador — a catraca da regeneração', () => {
  it('array vazio NÃO é trabalho (antes bloqueava a regeneração alegando trabalho inexistente)', () => {
    expect(temTrabalhoDoColaborador({ conteudo_consumido: [] })).toBe(false);
  });

  it('curso concluído É trabalho e protege a semana', () => {
    expect(temTrabalhoDoColaborador({ conteudo_consumido: [{ semana: 1, concluido: true }] })).toBe(true);
  });

  it('o comportamento dos casos REAIS de hoje não mudou', () => {
    // 941 de 941 linhas do banco são boolean — estes dois casos são o mundo real.
    expect(temTrabalhoDoColaborador({ conteudo_consumido: true })).toBe(true);
    expect(temTrabalhoDoColaborador({ conteudo_consumido: false })).toBe(false);
    // E os outros sinais de trabalho seguem intactos.
    expect(temTrabalhoDoColaborador({ reflexao: { a: 1 } })).toBe(true);
    expect(temTrabalhoDoColaborador({ tira_duvidas: { a: 1 } })).toBe(true);
    expect(temTrabalhoDoColaborador({})).toBe(false);
  });
});
