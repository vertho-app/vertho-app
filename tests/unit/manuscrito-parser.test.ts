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

  it('falha alto quando os descritores têm nº de MBs diferentes', async () => {
    let t = manuscrito({ scheme: 'sequencial' });
    // remove uma linha de cabeçalho de um descritor → contagem desigual
    t = t.replace(/^.*ID: XYZ01_MB05.*$/m, 'linha adulterada sem ID');
    // Falha alto de algum modo — o ponto é NÃO fatiar em silêncio.
    await expect(parse(t)).rejects.toThrow(/MBs diferentes|não fecha|descritores principais/);
  });
});
