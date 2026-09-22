/**
 * A média fica na JORNADA, não no encontro (decisão do dono, 22/09/2026).
 *
 * 🔴 O QUE ESTE ARQUIVO PROTEGE. Cada encontro avalia 3 competências (foco + 2
 * secundárias) e a média exige 3 competências COM NÍVEL, o que pede 4
 * comportamentos observados em cada uma na mesma conversa. `Medido: 19/09/2026`
 * na sonda do avaliador: Análise 6/6, Comunicação 5/6 e Priorização 0/6, ou
 * seja, o encontro real fica a uma competência da média. A caixa "Média do
 * encontro" existiu até 19/09 e passava a vida vazia, explicando o que faltava
 * para um número que a forma do encontro quase nunca produz.
 *
 * Os testes abaixo fixam as duas pontas: o encontro mostra o NÍVEL de cada
 * competência, com o foco marcado, e nenhuma média; a síntese da jornada mostra
 * a média. O caso "ideal" (as 3 competências com nível) existe de propósito: com
 * a média DISPONÍVEL no resumo, a tela do encontro continua sem mostrá-la, que é
 * a diferença entre uma decisão e um dado que faltou. E o mesmo componente,
 * chamado com `media`, exibe a caixa: sem isso, a asserção de ausência passaria
 * verde mesmo que a tela tivesse deixado de renderizar o relatório inteiro.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import SinteseJornadaView from '@/components/simulador-lideranca/sintese';
import { competenciasParaRelatorio } from '@/components/simulador-lideranca/relatorio';
import {
  gravarAvaliacao,
  linhasDoEncontro,
  resumoAvaliacao,
  sinteseDaJornada,
} from '@/lib/simulador-lideranca/core';
import { linhasDaVariante } from '@/lib/simuladores/lideranca/matriz-global';
import type { Avaliacao } from '@/lib/simulador-lideranca/schema';
import {
  avaliacao,
  avaliacaoDasLinhas,
  episodio,
  FALA,
} from '../fixtures/simulador-lideranca';

const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
const REL = pt.SimuladoresRelatorio as Record<string, string>;
const LID = pt.SimuladorLideranca as Record<string, string>;
const MATRIZ = linhasDaVariante('lider');

const provider = (filho: any) =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale: 'pt-BR',
      messages: pt,
      timeZone: 'America/Sao_Paulo',
      children: filho,
    }),
  );

/** A conversa sustenta 4 comportamentos em CADA competência do encontro (o caso ideal). */
function avaliacaoCheia(indice: number): Avaliacao {
  const linhas = linhasDoEncontro(MATRIZ, indice);
  const a = avaliacaoDasLinhas(linhas);
  const porCompetencia = new Map<string, string[]>();
  for (const l of linhas) porCompetencia.set(l.nome, [...(porCompetencia.get(l.nome) ?? []), l.cod_desc]);
  for (const codigos of porCompetencia.values())
    for (const codigo of codigos.slice(0, 4)) {
      const d = a.descritores.find((x) => x.codigo === codigo)!;
      d.nivel = 3;
      d.justificativa = 'Você perguntou pelos fatos antes de propor a solução.';
      d.evidencias = [{ fonte: 'fala', turno: 1, trecho: FALA }];
    }
  return a;
}

const gravar = (a: Avaliacao, indice: number) =>
  gravarAvaliacao(a, episodio(indice), linhasDoEncontro(MATRIZ, indice));

/** A devolutiva do encontro exatamente como as telas a montam. */
function relatorioDoEncontro(indice: number, cheia: boolean) {
  const gravada = gravar(cheia ? avaliacaoCheia(indice) : avaliacao(indice), indice);
  const resumo = resumoAvaliacao(gravada, MATRIZ, indice);
  const { competencias, regra } = competenciasParaRelatorio(resumo, gravada, MATRIZ, () => 'na conversa');
  return { resumo, competencias, regra };
}

describe('liderança: a média é da jornada, o encontro mostra o nível de cada competência', () => {
  it('🔴 o encontro não traz média, nem quando o resumo TEM uma para mostrar', () => {
    const real = relatorioDoEncontro(0, false);
    const ideal = relatorioDoEncontro(0, true);
    // O encontro real fica sem média porque só o foco junta 4 comportamentos.
    expect(real.resumo.media.nota).toBeNull();
    // O ideal produz média no resumo: a tela é que não a mostra.
    expect(ideal.resumo.media).toMatchObject({ competencias: 3, suficiente: true });
    expect(ideal.resumo.media.nivel).not.toBeNull();
    for (const caso of [real, ideal]) {
      const html = provider(
        createElement(RelatorioCompetencias, {
          competencias: caso.competencias,
          regra: caso.regra,
          tema: 'escuro',
        }),
      );
      expect(html).not.toContain(REL.overall);
      expect(html).not.toContain('Média');
      // e o que FICA no lugar: as 3 competências do encontro, foco marcado.
      expect(html).toContain(REL.focus);
      expect(caso.competencias.map((c) => c.foco)).toEqual([true, false, false]);
      for (const c of caso.competencias) expect(html).toContain(c.nome);
    }
    // A competência com evidência suficiente mostra o nível; a sem evidência diz o que faltou.
    const htmlIdeal = provider(
      createElement(RelatorioCompetencias, { competencias: ideal.competencias, regra: ideal.regra, tema: 'escuro' }),
    );
    expect(htmlIdeal).toContain('Nível 3');
    const htmlReal = provider(
      createElement(RelatorioCompetencias, { competencias: real.competencias, regra: real.regra, tema: 'escuro' }),
    );
    expect(htmlReal).toContain(REL.insufficientShort);
  });

  it('o mesmo componente COM `media` mostra a caixa (a ausência acima é decisão, não tela vazia)', () => {
    const ideal = relatorioDoEncontro(0, true);
    const html = provider(
      createElement(RelatorioCompetencias, {
        competencias: ideal.competencias,
        regra: ideal.regra,
        tema: 'escuro',
        media: ideal.resumo.media,
      }),
    );
    expect(html).toContain(REL.overall);
    expect(html).toContain('Nível 3');
  });

  it('🔴 as telas da liderança não passam `media` para a devolutiva do encontro', () => {
    for (const arquivo of [
      'components/simulador-lideranca/treino.tsx',
      'components/simulador-lideranca/equipe.tsx',
    ]) {
      const fonte = readFileSync(arquivo, 'utf8');
      const chamadas = [...fonte.matchAll(/<RelatorioCompetencias[\s\S]*?\/>/g)].map((m) => m[0]);
      expect(chamadas.length).toBeGreaterThan(0);
      for (const chamada of chamadas) expect(chamada).not.toMatch(/\bmedia=/);
    }
  });

  it('a média aparece na síntese da jornada, e diz o que falta quando ainda não há', () => {
    const concluidos = (cheia: boolean) =>
      [0, 1, 2, 3, 4].map((i) => ({
        indice: i,
        repeticao: false,
        encerradoEm: `2026-09-1${i + 3}T12:00:00Z`,
        avaliacao: gravar(cheia ? avaliacaoCheia(i) : avaliacao(i), i),
      }));
    const comMedia = sinteseDaJornada(concluidos(true), MATRIZ, 5);
    expect(comMedia.media.nivel).toBe(3);
    const html = provider(createElement(SinteseJornadaView, { sintese: comMedia, publico: 'pessoa' }));
    expect(html).toContain(LID.synthesisAverage.replace('{level}', '3'));

    const semMedia = sinteseDaJornada(concluidos(false), MATRIZ, 5);
    expect(semMedia.media.nota).toBeNull();
    const htmlSem = provider(createElement(SinteseJornadaView, { sintese: semMedia, publico: 'pessoa' }));
    expect(htmlSem).toContain(LID.synthesisNoAverage);
  });

  it('a copy da média do encontro saiu dos quatro idiomas junto com a caixa', () => {
    for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const m = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      expect(m.SimuladorLideranca).not.toHaveProperty('encounterAverage');
    }
  });
});
