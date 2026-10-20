import { describe, it, expect, vi, beforeEach } from 'vitest';

const callAI = vi.fn();
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => callAI(...a) }));

import { gerarDesafioDaSemana, problemasDoDesafio, TETO_DESAFIO_PAR } from '@/lib/season-engine/kit/desafio-par';

/**
 * A trava em código do desafio em par (20/10/2026).
 *
 * O prompt pede a regra; o código garante. No replay com os 6 pares reais de
 * uma diretora de macae, a regra escrita foi seguida em ~5 de 6 gerações: o
 * nome interno "caminho alternativo" vazou para o texto da pessoa, um texto
 * passou do teto e um critério trouxe travessão. Como a célula é gerada uma vez
 * e servida a todo mundo do par, o deslize de uma amostra vira o texto de todos.
 */

const limpo = {
  desafio_texto: 'Se surgir um conflito na escola, ouça cada parte separadamente. Se nenhum conflito surgir, escolha uma tensão pequena e faça o mesmo.',
  acao_observavel: 'ouvir as duas partes antes de decidir',
  criterio_de_execucao: 'A pessoa conta o que cada parte disse. No caminho alternativo, conta: qual tensão escolheu.',
  por_que_cabe_na_semana: 'Duas conversas curtas, sem aprovação.',
};

describe('problemasDoDesafio', () => {
  it('aceita o desafio limpo, com "caminho alternativo" só no CRITÉRIO (onde ele é pedido)', () => {
    expect(problemasDoDesafio(limpo)).toEqual([]);
  });

  it('🔴 recusa "caminho alternativo" no texto que a pessoa lê', () => {
    const r = problemasDoDesafio({ ...limpo, desafio_texto: `${limpo.desafio_texto} No caminho alternativo, registre junto.` });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatch(/caminho alternativo/);
  });

  it('recusa texto acima do teto e aceita exatamente no teto', () => {
    expect(problemasDoDesafio({ ...limpo, desafio_texto: 'a'.repeat(TETO_DESAFIO_PAR) })).toEqual([]);
    expect(problemasDoDesafio({ ...limpo, desafio_texto: 'a'.repeat(TETO_DESAFIO_PAR + 1) })[0]).toMatch(/caracteres/);
  });

  it('recusa travessão e meia-risca em QUALQUER campo, não só no texto', () => {
    expect(problemasDoDesafio({ ...limpo, criterio_de_execucao: 'conta o que fez — e quando' })[0]).toMatch(/travessão/);
    expect(problemasDoDesafio({ ...limpo, por_que_cabe_na_semana: 'de 10–20 minutos' })[0]).toMatch(/travessão/);
    expect(problemasDoDesafio({ ...limpo, criterio_de_execucao: undefined })).toEqual([]);
  });
});

function sbFalso() {
  const inserts: any[] = [];
  const cadeia: any = {
    select: () => cadeia, eq: () => cadeia,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async (row: any) => { inserts.push(row); return { error: null }; },
  };
  return { sb: { from: () => cadeia }, inserts };
}

const ARGS = {
  empresaId: 'e1', competencia: 'GERENCIAMENTO DE CONFLITOS', disc: 'D', cargo: 'Diretor(a) Escolar',
  descritores: ['Escuta das partes', 'Identificação de causas'],
  nucleos: [
    { descritor: 'Escuta das partes', ideia_central: 'ouvir os dois lados', pontos_chave: ['a'], exemplo_ancora: 'x' },
    { descritor: 'Identificação de causas', ideia_central: 'achar a causa', pontos_chave: ['b'], exemplo_ancora: 'y' },
  ],
};

describe('gerarDesafioDaSemana com a trava', () => {
  beforeEach(() => callAI.mockReset());

  it('🔑 recusa a 1ª resposta, conta ao modelo POR QUÊ e grava a 2ª', async () => {
    callAI
      .mockResolvedValueOnce(JSON.stringify({ ...limpo, criterio_de_execucao: 'conta o que fez — e quando' }))
      .mockResolvedValueOnce(JSON.stringify(limpo));
    const { sb, inserts } = sbFalso();
    const r = await gerarDesafioDaSemana(sb, ARGS);
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(String(callAI.mock.calls[1][0])).toMatch(/A resposta anterior foi recusada: há travessão/);
    expect(r.desafio.criterio_de_execucao).toBe(limpo.criterio_de_execucao);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].desafio.criterio_de_execucao).toBe(limpo.criterio_de_execucao);
  });

  it('🔴 três recusas seguidas LANÇAM com o motivo e não gravam nada', async () => {
    callAI.mockResolvedValue(JSON.stringify({ ...limpo, desafio_texto: `${limpo.desafio_texto} No caminho alternativo, faça X.` }));
    const { sb, inserts } = sbFalso();
    await expect(gerarDesafioDaSemana(sb, ARGS)).rejects.toThrow(/caminho alternativo/);
    expect(callAI).toHaveBeenCalledTimes(3);
    expect(inserts).toHaveLength(0);
  });

  it('a 1ª tentativa vai com o prompt que tem a regra do acontecimento', async () => {
    callAI.mockResolvedValueOnce(JSON.stringify(limpo));
    const { sb } = sbFalso();
    await gerarDesafioDaSemana(sb, ARGS);
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(String(callAI.mock.calls[0][0])).toMatch(/QUANDO A AÇÃO DEPENDE DE ALGO ACONTECER/);
    expect(String(callAI.mock.calls[0][0])).not.toMatch(/A resposta anterior foi recusada/);
  });
});
