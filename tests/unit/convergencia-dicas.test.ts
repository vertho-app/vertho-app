import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { DICA_VEREDITO } from '@/lib/season-engine/convergencia-dicas';
import { numerosDasDicas } from '@/lib/gestor/veredito-dicas';
import { createTranslator } from 'next-intl';
import { semComentarios } from '../helpers/fonte';

/**
 * A descrição de cada veredito é UMA só: o relatório de evolução (PDF) e a tela
 * Evolução da equipe leem a mesma frase (pedido do dono em 17/09/2026).
 *
 * Desde 21/09/2026 o PDF compara só o cenário inicial com o final e não mostra
 * veredito (`relatorio-evolucao-pdf.test.ts` trava isso); a frase ficou na tela.
 * A varredura de cópia à mão, abaixo, continua cobrindo o PDF.
 */
const RAIZ = path.resolve(__dirname, '../..');
const FONTE = 'lib/season-engine/convergencia-dicas.ts';

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome.startsWith('.')) continue;
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

describe('descrição dos vereditos', () => {
  it('todo veredito tem uma frase', () => {
    const vereditos = Object.values(CONVERGENCIA);
    expect(vereditos).toHaveLength(3);
    for (const veredito of vereditos) expect(DICA_VEREDITO[veredito]?.length ?? 0).toBeGreaterThan(20);
  });

  /**
   * R-67 (04/10/2026): a tela Evolução da equipe fala nos 4 idiomas, então a frase vem do
   * catálogo (`ManagerEvolution.verdictHints`) com os números dos cortes da régua
   * (`numerosDasDicas`). A fonte única passa a valer ASSIM: em pt-BR o catálogo, com os
   * números preenchidos, escreve EXATAMENTE `DICA_VEREDITO`, e nos outros idiomas os mesmos
   * números entram pelo `Intl` do idioma.
   */
  const CHAVE_DO_VEREDITO: Record<string, 'confirmed' | 'partial' | 'stable'> = {
    [CONVERGENCIA.CONFIRMADA]: 'confirmed', [CONVERGENCIA.PARCIAL]: 'partial', [CONVERGENCIA.ESTAVEL]: 'stable',
  };
  const frase = (locale: string, chave: string) => createTranslator({
    locale, messages: JSON.parse(readFileSync(path.join(RAIZ, 'messages', `${locale}.json`), 'utf8')), namespace: 'ManagerEvolution',
  })(`verdictHints.${chave}` as any, numerosDasDicas(locale) as any);

  it('a tela lê as três frases do catálogo e os números da régua, sem copiá-los', () => {
    const fonte = semComentarios(readFileSync(path.join(RAIZ, 'app/dashboard/gestor/equipe-evolucao/page.tsx'), 'utf8'));
    expect(fonte).toContain('numerosDasDicas(');
    for (const chave of ['confirmed', 'partial', 'stable']) {
      expect(fonte, `sem verdictHints.${chave}`).toContain(`verdictHints.${chave}`);
    }
    // Corte ou frase escritos à mão na tela divergiriam da régua na próxima calibragem.
    expect(fonte).not.toMatch(/CORTE_(CONFIRMADA|PARCIAL)|Avanço de|Progress of|Avance de/);
  });

  it.each(Object.values(CONVERGENCIA))('pt-BR: o catálogo escreve a frase de %s igual à fonte única', (veredito) => {
    expect(frase('pt-BR', CHAVE_DO_VEREDITO[veredito])).toBe(DICA_VEREDITO[veredito]);
  });

  it('os outros idiomas usam os mesmos cortes, com o separador decimal do idioma', () => {
    expect(numerosDasDicas('pt-BR')).toEqual({ min: '0,5', from: '0,2', to: '0,4', max: '0,1' });
    expect(numerosDasDicas('en-US')).toEqual({ min: '0.5', from: '0.2', to: '0.4', max: '0.1' });
    expect(frase('en-US', 'partial')).toContain('0.2 to 0.4');
    expect(frase('es-ES', 'partial')).toContain('0,2 a 0,4');
    expect(frase('pt-PT', 'confirmed')).toContain('0,5 ou mais');
  });

  it('🔴 nenhuma frase é copiada à mão em outro arquivo', () => {
    const copias: string[] = [];
    const frases = Object.values(DICA_VEREDITO);
    for (const dir of ['app', 'components', 'lib']) {
      for (const arquivo of arquivos(path.join(RAIZ, dir))) {
        const relativo = path.relative(RAIZ, arquivo).split(path.sep).join('/');
        if (relativo === FONTE) continue;
        const fonte = readFileSync(arquivo, 'utf8');
        for (const frase of frases) if (fonte.includes(frase)) copias.push(`${relativo}: "${frase}"`);
      }
    }
    expect(copias).toEqual([]);
  });
});

/**
 * R-33 (04/10/2026): o quadro "Como cada resultado é definido" e as frases dos
 * cartões descreviam a régua QUALITATIVA removida em 17/09/2026 ("+0,5 E evidência
 * percebida", "Estável até +0,2"). A régua de hoje é só o avanço entre o cenário
 * inicial e o final (`classificarConvergencia`). Estes testes amarram o TEXTO aos
 * cortes do código: quem mexer em `CORTE_PARCIAL` ou `CORTE_CONFIRMADA` sem
 * reescrever a copy vê o vermelho aqui.
 */
import { CORTE_CONFIRMADA, CORTE_PARCIAL, classificarConvergencia } from '@/lib/season-engine/convergencia';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const msgs = (locale: string) => JSON.parse(readFileSync(path.join(RAIZ, 'messages', `${locale}.json`), 'utf8'));
/** Como cada idioma escreve 0,5 / 0.5 (o avanço aparece com uma casa). */
const numero = (n: number, locale: string) => (locale === 'en-US' ? n.toFixed(1) : n.toFixed(1).replace('.', ','));
const maisUm = (n: number) => Math.round((n + 0.1) * 10) / 10;
const menosUm = (n: number) => Math.round((n - 0.1) * 10) / 10;

describe('a régua escrita nas telas é a de hoje (R-33)', () => {
  it('as frases dos cartões da Evolução da equipe saem dos cortes do código', () => {
    expect(DICA_VEREDITO[CONVERGENCIA.CONFIRMADA]).toContain(numero(CORTE_CONFIRMADA, 'pt-BR'));
    expect(DICA_VEREDITO[CONVERGENCIA.PARCIAL]).toContain(numero(CORTE_PARCIAL, 'pt-BR'));
    expect(DICA_VEREDITO[CONVERGENCIA.PARCIAL]).toContain(numero(menosUm(CORTE_CONFIRMADA), 'pt-BR'));
    expect(DICA_VEREDITO[CONVERGENCIA.ESTAVEL]).toContain(numero(menosUm(CORTE_PARCIAL), 'pt-BR'));
  });

  it('nenhuma frase fala dos critérios qualitativos que saíram da régua', () => {
    for (const frase of Object.values(DICA_VEREDITO)) {
      expect(frase).not.toMatch(/induzid|restri[cç][aã]o|estrutura da conversa|caso real|evid[eê]ncia|nota/i);
    }
  });

  it.each(LOCALES)('%s: o quadro do RH descreve o avanço e não cita nota nem evidência', (locale) => {
    const c = msgs(locale).RhReports.dashboard.evolution.criteria;
    expect(c.confirmed).toContain(numero(CORTE_CONFIRMADA, locale));
    expect(c.partial).toContain(numero(CORTE_PARCIAL, locale));
    expect(c.partial).toContain(numero(menosUm(CORTE_CONFIRMADA), locale));
    expect(c.stable).toContain(numero(menosUm(CORTE_PARCIAL), locale));
    for (const texto of Object.values<string>(c)) {
      expect(texto).not.toMatch(/\bnota\b|\bscore\b|evid[eê]ncia|evidence|percebid|noticed|percibi/i);
    }
  });

  it('o corte do texto é o corte do motor: avanço 0,4 é parcial, 0,5 confirma, 0,1 é estável', () => {
    const avanco = (a: number) => classificarConvergencia({ nota_pre: 2, nota_pos: 2 + a });
    expect(avanco(CORTE_CONFIRMADA)).toBe(CONVERGENCIA.CONFIRMADA);
    expect(avanco(menosUm(CORTE_CONFIRMADA))).toBe(CONVERGENCIA.PARCIAL);
    expect(avanco(CORTE_PARCIAL)).toBe(CONVERGENCIA.PARCIAL);
    expect(avanco(menosUm(CORTE_PARCIAL))).toBe(CONVERGENCIA.ESTAVEL);
    expect(maisUm(CORTE_PARCIAL)).toBeLessThan(CORTE_CONFIRMADA);
  });
});
