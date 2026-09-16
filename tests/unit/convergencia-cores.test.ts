/**
 * Cores do veredito: uma paleta só, e a decisão do dono dentro dela.
 *
 * 🔑 POR QUE (16/09/2026). "Evolução parcial deve ser verde claro e evolução
 * confirmada verde mais escuro." Até então parcial era laranja, âmbar, ciano ou
 * azul conforme a superfície (oito lugares, cinco cores). Este teste trava as
 * duas coisas que fazem a decisão valer: a relação claro/escuro dentro da paleta,
 * e cada superfície lendo DA paleta em vez de escrever cor à mão.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { COR_VEREDITO_PAPEL, COR_VEREDITO_TELA } from '@/lib/season-engine/convergencia-cores';
import { CONVERGENCIA, avancoMedioExibido, formatarValorAvanco } from '@/lib/season-engine/convergencia';
import { semComentarios } from '../helpers/fonte';

/** Luminância relativa (WCAG) de um hex #RRGGBB. */
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** É verde: o canal G domina. */
function ehVerde(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return g > r && g > b;
}

describe('paleta do veredito', () => {
  it('papel: confirmada e parcial são verdes, e confirmada é o mais ESCURO', () => {
    const conf = COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].fg;
    const parc = COR_VEREDITO_PAPEL[CONVERGENCIA.PARCIAL].fg;
    expect(ehVerde(conf) && ehVerde(parc)).toBe(true);
    expect(luminancia(conf)).toBeLessThan(luminancia(parc));
  });

  it('tela: confirmada e parcial são verdes, e parcial é o mais CLARO', () => {
    const conf = COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA].hex;
    const parc = COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL].hex;
    expect(ehVerde(conf) && ehVerde(parc)).toBe(true);
    expect(luminancia(parc)).toBeGreaterThan(luminancia(conf));
    expect(COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL].tinta).toMatch(/green|emerald/);
    expect(COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA].tinta).toMatch(/green|emerald/);
  });
});

const SUPERFICIES = [
  'lib/temporada-concluida-pdf.tsx',
  'app/dashboard/temporada/concluida/page.tsx',
  'app/dashboard/temporada/page.tsx',
  'app/dashboard/gestor/equipe-evolucao/page.tsx',
  'app/admin/evolucao/page.tsx',
  'app/dashboard/relatorios/relatorios-rh-view.tsx',
  'components/pdf/RelatorioEvolucao.tsx',
  'app/dashboard/evolucao/page.tsx',
  'lib/plenaria-equipe-pdf.ts',
];

describe('toda superfície que pinta veredito lê a paleta única', () => {
  it.each(SUPERFICIES)('%s', (arquivo) => {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    expect(fonte).toContain('convergencia-cores');
    // As cores antigas de "parcial" (âmbar/laranja/ciano/azul) não voltam por cópia.
    // Âncoras EXATAS do veredito: o troféu âmbar da tela é ícone, não veredito.
    for (const velha of ["cor: 'amber'", 'valor={resumo.parciais || 0} cor="text-amber-400"', "'#D97706'", "'#67E8F9'", "'#0C4A6E'", 'colors.orange', 'bg-[#9ae2e6]']) {
      expect(fonte, `"${velha}" voltou em ${arquivo}`).not.toContain(velha);
    }
  });
});

describe('avanço médio de um conjunto', () => {
  it('é a média dos avanços exibidos, não a diferença das médias', () => {
    const apoio = [
      { nota_pre: 2, nota_pos: 2.1 }, { nota_pre: 2, nota_pos: 1.4 }, { nota_pre: 2, nota_pos: 2.3 },
      { nota_pre: 2, nota_pos: 2.3 }, { nota_pre: 2.9, nota_pos: 2.2 },
    ];
    expect(avancoMedioExibido(apoio)).toBe(0.1);
    expect(formatarValorAvanco(avancoMedioExibido(apoio))).toBe('+0.1');
  });

  it('ignora descritor sem nota e devolve null quando nenhum tem', () => {
    expect(avancoMedioExibido([{ nota_pre: 2, nota_pos: 2.6 }, { nota_pre: null, nota_pos: 3 }])).toBe(0.6);
    expect(avancoMedioExibido([{ nota_pre: null, nota_pos: null }])).toBeNull();
    expect(formatarValorAvanco(null)).toBeNull();
    expect(formatarValorAvanco(0)).toBe('0.0');
  });
});
