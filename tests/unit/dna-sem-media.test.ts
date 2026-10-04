import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Lote 5b (04/10/2026): o PDF do DNA organizacional (o "Retrato de Competências", que o
 * RH recebe como documento) não imprime mais a média decimal da competência, e a IA
 * que escreve o texto desse PDF não recebe mais a média nem tem licença para citá-la.
 *
 * Antes: cada competência abria com "Média: 3.12" (`c.media.toFixed(2)`, a última
 * dívida declarada do guard `nota-decimal-cliente-guard` no PDF do DNA), e o prompt da
 * narrativa mandava "citar percentuais e médias que estão nos dados", com a linha
 * "- Comunicação: média 2.4 (N1=...)": o decimal entrava no PDF por dois caminhos.
 */
const mocks = vi.hoisted(() => ({
  elementos: [] as any[],
  chamadasIA: [] as Array<{ system: string; user: string }>,
}));

vi.mock('@react-pdf/renderer', async (original) => ({
  ...(await original<any>()),
  // Captura o documento em vez de renderizá-lo: o teste lê o texto da árvore React.
  renderToBuffer: vi.fn(async (el: any) => { mocks.elementos.push(el); return new Uint8Array([37, 80, 68, 70]); }),
}));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (system: string, user: string) => {
    mocks.chamadasIA.push({ system, user });
    return JSON.stringify({ intro: 'i', forcas: [], leituraGeral: 'l', padroes: [], prioridades: [], acoes: [], profissionaisReferencia: 'r', fecho: 'f' });
  }),
}));

import { renderDnaPDF } from '@/lib/dna-organizacional-pdf';
import { gerarNarrativaDna } from '@/lib/dna-organizacional/narrative';
import type { DnaAggregate } from '@/lib/dna-organizacional/aggregate';
import { criarNarrativaDnaAcmeDemo } from '@/lib/demo/acme-organization-report-fixture';

/** Percorre a árvore React expandindo componentes de função (sem hooks) e junta todo o texto. */
function textoDaArvore(no: any, saida: string[] = []): string[] {
  if (no == null || typeof no === 'boolean') return saida;
  if (typeof no === 'string' || typeof no === 'number') { saida.push(String(no)); return saida; }
  if (Array.isArray(no)) { no.forEach((n) => textoDaArvore(n, saida)); return saida; }
  if (React.isValidElement(no)) {
    const { type, props } = no as any;
    if (typeof type === 'function') textoDaArvore((type as any)(props), saida);
    else textoDaArvore(props?.children, saida);
  }
  return saida;
}

const pct = (n1: number, n2: number, n3: number, n4: number) => ({ n1, n2, n3, n4 });
// Notas decimais DISTINTAS e fáceis de procurar no texto: 2.4137 e 3.1289.
const dna: DnaAggregate = {
  totalColaboradores: 10, avaliados: 8, participacaoPct: 80, totalAvaliacoes: 40,
  distGeral: { n1: 4, n2: 12, n3: 20, n4: 4, total: 40 }, distGeralPct: pct(10, 30, 50, 10),
  competencias: [
    {
      nome: 'Planejamento', media: 2.4137, prioridade: true, pct: pct(40, 30, 20, 10),
      descritores: [{ descritor: 'Define metas', media: 2.0911, totalColabs: 8, pct: pct(50, 25, 25, 0) }],
      forca: undefined, oportunidade: { descritor: 'Define metas', n1pct: 50 },
    },
    {
      nome: 'Escuta', media: 3.1289, prioridade: false, pct: pct(5, 20, 55, 20),
      descritores: [{ descritor: 'Pergunta antes de opinar', media: 3.2765, totalColabs: 8, pct: pct(0, 25, 50, 25) }],
      forca: { descritor: 'Pergunta antes de opinar', nivelPct: 75, bucket: 'n3' }, oportunidade: undefined,
    },
    {
      // empate entre N2 e N3: o nível mais frequente é o menor (N2)
      nome: 'Feedback', media: 2.5, prioridade: false, pct: pct(0, 50, 50, 0),
      descritores: [], forca: undefined, oportunidade: undefined,
    },
  ],
  topGaps: [{ competencia: 'Planejamento', descritor: 'Define metas', n1pct: 50, media: 2.0911 }],
  forcas: [{ competencia: 'Escuta', descritor: 'Pergunta antes de opinar', bucket: 'n3', pct: 75 }],
  semDados: false,
};

describe('PDF do DNA organizacional', () => {
  beforeEach(() => { mocks.elementos.length = 0; mocks.chamadasIA.length = 0; });

  async function textoDoPdf() {
    await renderDnaPDF({ empresaNome: 'Empresa X', dataRef: '04/10/2026', segmento: 'educacao', dna, narrativa: criarNarrativaDnaAcmeDemo(dna) });
    return textoDaArvore(mocks.elementos[0]).join('');
  }

  it('cada competência abre com o NÍVEL MAIS FREQUENTE, da mesma distribuição impressa embaixo', async () => {
    const texto = await textoDoPdf();
    expect(texto).toContain('Nível mais frequente:N1PRIORIDADE');
    expect(texto).toContain('Nível mais frequente:N3');
    // Feedback: 50% em N2 e 50% em N3 => empate vai para o menor
    expect(texto).toMatch(/FEEDBACK[\s\S]*?Nível mais frequente:N2/);
    expect(texto).toContain('Nível 1: 40%  |  Nível 2: 30%  |  Nível 3: 20%  |  Nível 4: 10%');
  });

  it('nenhuma nota decimal nem "Média:" no documento', async () => {
    const texto = await textoDoPdf();
    expect(texto).not.toMatch(/M[eé]dia:/);
    for (const nota of ['2.41', '3.12', '2.09', '3.27', '2,41', '3,12']) expect(texto, nota).not.toContain(nota);
  });
});

describe('narrativa do DNA (IA): sem média na entrada nem licença para citá-la', () => {
  beforeEach(() => { mocks.chamadasIA.length = 0; });

  it('a linha de cada competência traz o nível mais frequente e os percentuais, nunca `média`', async () => {
    await gerarNarrativaDna(dna, { empresaNome: 'Empresa X', segmento: 'educacao' });
    const [{ user }] = mocks.chamadasIA;
    expect(user).toContain('- Planejamento: nível mais frequente N1 (N1=40% N2=30% N3=20% N4=10%) [PRIORITÁRIA]');
    expect(user).toContain('- Escuta: nível mais frequente N3 (N1=5% N2=20% N3=55% N4=20%)');
    expect(user).toContain('- Feedback: nível mais frequente N2');
    expect(user).not.toMatch(/m[eé]dia/i);
    for (const nota of ['2.4137', '3.1289', '2.0911', '3.2765']) expect(user, nota).not.toContain(nota);
  });

  it('a regra proíbe média e "X de 4", e não manda mais "citar médias"', async () => {
    await gerarNarrativaDna(dna, { empresaNome: 'Empresa X', segmento: 'educacao' });
    const [{ system }] = mocks.chamadasIA;
    expect(system).toContain('NUNCA escreva média, nota decimal, pontuação nem "X de 4"');
    expect(system).toContain('Pode citar percentuais e níveis (N1 a N4)');
    expect(system).not.toMatch(/citar percentuais e m[eé]dias/);
  });
});
