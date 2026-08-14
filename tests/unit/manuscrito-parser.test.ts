import { describe, it, expect, vi } from 'vitest';

// mammoth é dinâmico dentro do parser; stubamos por teste com o texto cru.
function mockMammoth(texto: string) {
  vi.doMock('mammoth', () => ({
    default: {
      extractRawText: async () => ({ value: texto }),
      convertToHtml: async () => ({ value: '' }),
    },
  }));
}

/**
 * Gera um manuscrito sintético. `scheme`:
 *  - 'faixa-synth'  → SED08: por-faixa, síntese própria (MB 48+d), 9/desc
 *  - 'faixa-integ'  → DIR09/COO03: por-faixa, 8/desc, síntese numa seção "INTEGRAÇÃO"
 *  - 'sequencial'   → COO06: contíguo 1-9 por descritor, 9º = síntese
 * `sep` = '|' ou '·'. `glue` cola o ID na ação.
 */
function manuscrito(opts: { scheme: string; sep?: string; glue?: boolean; cod?: string }) {
  const { scheme, sep = '|', glue = false, cod = 'XYZ01' } = opts;
  const D = 6, cargo = 'Cargo Teste';
  const descNomes = Array.from({ length: D }, (_, i) => `Descritor ${i + 1}`);
  const linhas: string[] = ['Título do Manuscrito', 'Subtítulo', `Manuscrito-base ${sep} ${cargo} ${sep} ${cod}`, ''];

  const bloco = (desc: string, num: number, acao: string) => {
    const id = `${cod}_MB${String(num).padStart(2, '0')}`;
    linhas.push(`Título editorial ${num}`);
    linhas.push(glue
      ? `${cargo} ${sep} ${cod} ${sep} ${desc} ${sep} ID: ${id}${acao}`
      : `${cargo} ${sep} ${cod} ${sep} ${desc} ${sep} ID: ${id} ${sep} ${acao}`);
    linhas.push(`Corpo do microbloco ${num}. `.repeat(200)); // ~5k chars
  };

  if (scheme === 'faixa-capitulo') {
    // DIR02: rótulo do cabeçalho = nome da COMPETÊNCIA (constante); descritores são
    // capítulos; numeração por-faixa em ORDEM DE DOCUMENTO por descritor.
    for (let d = 0; d < D; d++) {
      linhas.push(`Capítulo ${d + 1} — ${descNomes[d]}`);
      const nums = [d * 2 + 1, d * 2 + 2, 12 + d * 2 + 1, 12 + d * 2 + 2, 24 + d * 2 + 1, 24 + d * 2 + 2, 36 + d * 2 + 1, 36 + d * 2 + 2, 48 + d + 1];
      for (const n of nums) bloco('Autocuidado e resiliência', n, `Ação ${n}`);
    }
  } else if (scheme === 'sequencial') {
    // desc1 = 1..9, desc2 = 10..18, …
    for (let d = 0; d < D; d++) for (let k = 1; k <= 9; k++) bloco(descNomes[d], d * 9 + k, `Ação ${d}-${k}`);
  } else {
    // por-faixa: N1 block (1..12), N2 (13..24), N3 (25..36), N4 (37..48)
    for (let faixa = 0; faixa < 4; faixa++) {
      for (let d = 0; d < D; d++) {
        for (let k = 0; k < 2; k++) bloco(descNomes[d], faixa * 12 + d * 2 + k + 1, `Ação f${faixa} d${d}`);
      }
    }
    if (scheme === 'faixa-synth') {
      for (let d = 0; d < D; d++) bloco(descNomes[d], 48 + d + 1, `Consolidar ${d}`); // rótulo = descritor
    } else if (scheme === 'faixa-integ') {
      for (let d = 0; d < D; d++) bloco('INTEGRAÇÃO', 48 + d + 1, `Integração ${d}`); // rótulo distinto
    }
  }
  linhas.push('Síntese — fechamento');
  linhas.push('Bibliografia');
  return linhas.join('\n');
}

/**
 * Manuscrito a partir de uma MATRIZ de números de MB (um array por descritor,
 * em ordem de documento). Permite montar casos que o gerador paramétrico acima
 * não expressa: descritores de tamanhos diferentes e numerações adulteradas.
 */
function manuscritoDeNumeros(numsPorDesc: number[][], cod = 'XYZ01') {
  const cargo = 'Cargo Teste';
  const linhas: string[] = ['Título do Manuscrito', 'Subtítulo', `Manuscrito-base | ${cargo} | ${cod}`, ''];
  numsPorDesc.forEach((nums, d) => {
    for (const n of [...nums].sort((a, b) => a - b)) {
      const id = `${cod}_MB${String(n).padStart(2, '0')}`;
      linhas.push(`Título editorial ${n}`);
      linhas.push(`${cargo} | ${cod} | Descritor ${d + 1} | ID: ${id} | Ação ${n}`);
      linhas.push(`Corpo do microbloco ${n}. `.repeat(200));
    }
  });
  linhas.push('Síntese — fechamento');
  linhas.push('Bibliografia');
  return linhas.join('\n');
}

/**
 * 6 descritores com 2,1,2,1,2,1 MBs por faixa e síntese em 4 deles → tamanhos
 * 9, 5, 8, 5, 8, 5. Numeração por faixa: N1 = 1-9, N2 = 10-18, N3 = 19-27,
 * N4 = 28-36; sínteses 37-40. É a forma do DIR08 real.
 */
const HETEROGENEO: number[][] = [
  [1, 2, 10, 11, 19, 20, 28, 29, 37],
  [3, 12, 21, 30, 38],
  [4, 5, 13, 14, 22, 23, 31, 32],
  [6, 15, 24, 33, 39],
  [7, 8, 16, 17, 25, 26, 34, 35],
  [9, 18, 27, 36, 40],
];

async function parse(texto: string) {
  vi.resetModules();
  mockMammoth(texto);
  const { parsearManuscrito } = await import('@/lib/manuscrito-parser');
  return parsearManuscrito(Buffer.from('x'));
}

describe('parsearManuscrito — convenções', () => {
  it('SED08: por-faixa com síntese própria (9/desc), síntese em todas as transições', async () => {
    const r = await parse(manuscrito({ scheme: 'faixa-synth' }));
    expect(r.stats.totalDescritores).toBe(6);
    expect(r.stats.modulosPrevistos).toBe(18);
    const d1 = r.descritores[0];
    expect(d1.microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4', 'SINTESE']);
    // síntese (MB49) entra nas 3 transições
    expect(d1.transicoes.every((t) => t.microblocos.some((id) => id.endsWith('MB49')))).toBe(true);
  });

  it('COO06: sequencial (contíguo 1-9), faixa por posição, 9º = síntese', async () => {
    const r = await parse(manuscrito({ scheme: 'sequencial' }));
    const d1 = r.descritores[0];
    expect(d1.microblocos.map((m) => Number(m.id.split('_MB')[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d1.microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4', 'SINTESE']);
    expect(r.avisos.some((a) => /sequencial/.test(a))).toBe(true);
  });

  it('DIR09/COO03: separador ·, ID colado, seção INTEGRAÇÃO excluída, 8/desc sem síntese', async () => {
    const r = await parse(manuscrito({ scheme: 'faixa-integ', sep: '·', glue: true }));
    expect(r.stats.totalDescritores).toBe(6);
    expect(r.stats.totalMicroblocos).toBe(48); // 54 - 6 da integração
    const d1 = r.descritores[0];
    expect(d1.microblocos).toHaveLength(8);
    expect(d1.microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4']);
    expect(d1.transicoes[0].microblocos).toHaveLength(4); // sem síntese
    expect(r.avisos.some((a) => /INTEGRAÇÃO/.test(a))).toBe(true);
  });

  it('DIR02: rótulo constante (competência), descritores derivados dos capítulos', async () => {
    const r = await parse(manuscrito({ scheme: 'faixa-capitulo' }));
    expect(r.stats.totalDescritores).toBe(6);
    expect(r.stats.modulosPrevistos).toBe(18);
    // nomes vêm dos capítulos, não do rótulo do cabeçalho
    expect(r.descritores[0].descritor).toBe('Descritor 1');
    expect(r.descritores.map((d) => d.descritor)).not.toContain('Autocuidado e resiliência');
    const d1 = r.descritores[0];
    expect(d1.microblocos.map((m) => Number(m.id.split('_MB')[1]))).toEqual([1, 2, 13, 14, 25, 26, 37, 38, 49]);
    expect(d1.microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4', 'SINTESE']);
    expect(r.avisos.some((a) => /rótulo único/.test(a))).toBe(true);
  });

  it('falha alto quando não há microbloco', async () => {
    await expect(parse('Só um texto sem cabeçalhos.\nNada aqui.')).rejects.toThrow(/Nenhum microbloco/);
  });

  // ── Manuscrito com nº de MBs VARIÁVEL por descritor (DIR08, 13/08) ─────────
  // A autora não escreveu a mesma quantidade para todo descritor: "Postura"
  // ganhou 2 MBs por faixa + síntese (9), "Acompanhamento" 1 por faixa e nenhuma
  // síntese (4). Cada um fecha sozinho em (4 faixas × k) [+1 síntese], e a
  // numeração global continua por faixa. O parser exigia uniformidade e barrava
  // material legítimo.
  it('DIR08: MBs/descritor variável (9, 5, 8) — faixas calculadas por descritor', async () => {
    const r = await parse(manuscritoDeNumeros(HETEROGENEO));
    expect(r.stats.totalDescritores).toBe(6);
    expect(r.descritores.map((d) => d.microblocos.length)).toEqual([9, 5, 8, 5, 8, 5]);
    // 2 MBs por faixa + síntese
    expect(r.descritores[0].microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4', 'SINTESE']);
    // 1 por faixa + síntese
    expect(r.descritores[1].microblocos.map((m) => m.faixa)).toEqual(['N1', 'N2', 'N3', 'N4', 'SINTESE']);
    // 2 por faixa, sem síntese
    expect(r.descritores[2].microblocos.map((m) => m.faixa)).toEqual(['N1', 'N1', 'N2', 'N2', 'N3', 'N3', 'N4', 'N4']);
    expect(r.avisos.some((a) => /VARIÁVEL/.test(a))).toBe(true);
    expect(r.stats.modulosPrevistos).toBe(18);
  });

  // A faixa sai da POSIÇÃO dentro do descritor — leitura cega. A numeração
  // global é a testemunha independente. Divergir = fatiar arbitrário, e o
  // sintoma seria conteúdo de N3 rotulado N4, invisível na tela.
  it('falha alto quando a posição e a numeração discordam sobre a faixa', async () => {
    const torto = HETEROGENEO.map((nums) => [...nums]);
    // Troca um MB de N4 (29, em d0) por um de N3 (21, em d1). Contagens e
    // numeração global seguem íntegras — só o PERTENCIMENTO mudou. Pela posição
    // o 21 vira N4 em d0; pela numeração continua N3.
    torto[0][7] = 21;
    torto[1][2] = 29;
    await expect(parse(manuscritoDeNumeros(torto))).rejects.toThrow(/faixa ambígua/);
  });

  it('falha alto quando as sínteses são numeradas antes das faixas', async () => {
    const sinteseNoInicio: number[][] = [
      [1, 5, 6, 14, 15, 23, 24, 32, 33],
      [2, 7, 16, 25, 34],
      [8, 9, 17, 18, 26, 27, 35, 36],
      [3, 10, 19, 28, 37],
      [11, 12, 20, 21, 29, 30, 38, 39],
      [4, 13, 22, 31, 40],
    ];
    await expect(parse(manuscritoDeNumeros(sinteseNoInicio))).rejects.toThrow(/faixa ambígua|Síntese numerada antes/);
  });

  it('falha alto quando os descritores têm nº de MBs diferentes', async () => {
    let t = manuscrito({ scheme: 'sequencial' });
    // remove uma linha de cabeçalho de um descritor → contagem desigual
    t = t.replace(/^.*ID: XYZ01_MB05.*$/m, 'linha adulterada sem ID');
    // Falha alto de algum modo — o ponto é NÃO fatiar em silêncio.
    await expect(parse(t)).rejects.toThrow(/MBs diferentes|não fecha|descritores principais/);
  });
});
