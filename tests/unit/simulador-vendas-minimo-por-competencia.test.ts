/**
 * V-12 da revisão de 27/09/2026 (decisão D5), na TELA. A régua do vendas passou
 * a ser proporcional (dois terços dos comportamentos avaliáveis: 4 de 6, e 3 de
 * 4 em Engajar), mas a devolutiva comum aos três simuladores escrevia "o nível
 * aparece a partir de {min}" com um mínimo único da regra (4). Em Engajar com 2
 * observados a tela dizia 4 onde a régua que decidiu pedia 3.
 *
 * O teste passa pelo caminho real: `competenciasDaMatriz` (o adaptador do
 * vendas) e o componente renderizado. O controle é o relatório gravado com a
 * regra anterior (`cobertura-4de6-3comp`), que continua dizendo 4 em Engajar:
 * sem ele, a asserção passaria com qualquer número fixo 3.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import { competenciasDaMatriz } from '@/components/simulador-vendas/relatorio-matriz';
import { avaliacaoMatriz } from '../fixtures/simulador-vendas-matriz';

const MENSAGENS = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
const rotulos = { nome: (c: string) => c, origem: () => '' };

/** Preparar com 3 de 6, Engajar com 2 de 4, e só PL com nível: sem média geral. */
function matriz() {
  const m = avaliacaoMatriz(3);
  const semNivel = ['P4', 'P5', 'P6', 'E3', 'E4', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  for (const d of m.descritores)
    if (semNivel.includes(d.codigo)) {
      d.nivel = null;
      d.evidencias = [];
    }
  return m;
}

function tela(regraGravada: string) {
  const { competencias, media, regra } = competenciasDaMatriz(matriz(), 'pace-7', rotulos, {}, regraGravada);
  return renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'pt-BR',
      messages: MENSAGENS,
      timeZone: 'America/Sao_Paulo',
      children: createElement(RelatorioCompetencias, { competencias, media, regra }),
    }),
  );
}
/** O bloco `<details>` da competência (resumo e aviso de cobertura). */
function bloco(html: string, codigo: string) {
  const b = html.split('<details').find((x) => x.includes(`<span>${codigo}</span>`));
  expect(b, `competência ${codigo} não renderizada`).toBeTruthy();
  return b!;
}

describe('V-12 na tela: o mínimo citado é o da competência', () => {
  it('regra nova: Engajar diz "a partir de 3" e Preparar "a partir de 4"', () => {
    const html = tela('cobertura-2tercos-3comp');
    expect(bloco(html, 'E')).toContain('O nível aparece a partir de 3');
    expect(bloco(html, 'P')).toContain('O nível aparece a partir de 4');
    // A média geral não afirma um número único quando os mínimos variam.
    expect(html).toContain('dois terços dos seus comportamentos');
    expect(html).not.toContain('Cada competência tem nível a partir de 4');
  });

  it('relatório gravado com a regra anterior segue lido como foi gerado (4 em Engajar)', () => {
    const html = tela('cobertura-4de6-3comp');
    expect(bloco(html, 'E')).toContain('O nível aparece a partir de 4');
    expect(bloco(html, 'P')).toContain('O nível aparece a partir de 4');
    expect(html).toContain('Cada competência tem nível a partir de 4');
    expect(html).not.toContain('dois terços dos seus comportamentos');
  });
});
