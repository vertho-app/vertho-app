/**
 * C-1 da revisão dos simuladores (27/09/2026): competência sem nível porque a
 * citação caiu não é "Sem oportunidade de observar".
 *
 * O avaliador classificou a conduta, a citação não conferiu com a fala e o
 * descritor foi rebaixado (`descartados`). Quando isso zera os observados da
 * competência, o resumo dizia "Sem oportunidade de observar", como se a
 * conversa não tivesse dado a chance. Os três simuladores já projetam
 * `descartado` por descritor; a leitura mora no componente comum.
 *
 * O teste passa pelo caminho real do atendimento: `consolidar` (tolerância de
 * descarte), o adaptador `competenciasDoAtendimento` e o componente renderizado.
 * A competência sem nenhuma conduta avaliada continua "Sem oportunidade de
 * observar": sem esse controle, a asserção de ausência passaria com a tela vazia.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import MatrizAtendimento from '@/components/recepcao/matriz-relatorio';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { abrirSessao, consolidar } from '@/lib/recepcao/core';
import type { Insumos } from '@/lib/recepcao/model';

const MENSAGENS: Record<string, any> = Object.fromEntries(
  ['pt-BR', 'pt-PT', 'en-US', 'es-ES'].map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]),
);
const render = (filho: any, locale = 'pt-BR') =>
  renderToStaticMarkup(
    createElement(NextIntlClientProvider, {
      locale,
      messages: MENSAGENS[locale],
      timeZone: 'America/Sao_Paulo',
      children: filho,
    }),
  );
/** O `<summary>` da competência (o resumo que a pessoa lê antes de abrir). */
function resumo(html: string, nome: string) {
  const bloco = html.split('<details').find((b) => b.includes(`<span>${nome}</span>`));
  expect(bloco, `competência ${nome} não renderizada`).toBeTruthy();
  return bloco!.slice(0, bloco!.indexOf('</summary>'));
}

/**
 * Acolhimento, Compreensão e Clareza com 6 observados; Resolução sem nenhuma
 * conduta avaliada; Procedimentos com UMA conduta avaliada cuja citação não
 * confere (vira descartada) e as outras cinco sem oportunidade.
 */
function relatorioComDescarte() {
  const c = aplicarMatrizAtendimento(structuredClone(catalogoLimites[0]));
  const s = abrirSessao(c, 0);
  s.historico.push(
    { id: 'm1', role: 'user', content: 'Entendo o impacto. Qual horário funciona para você?' },
    { id: 'm2', role: 'assistant', content: 'Só depois das 17h30.' },
  );
  s.respostas = 1;
  const insumos: Insumos = {
    dimensoes: c.matriz!.competencias.flatMap((comp, ci) =>
      comp.descritores.map((d, di) => {
        const avaliado = ci < 3 || (ci === 4 && di === 0);
        if (!avaliado)
          return { id: d.codigo, classificacao: 'nao_observavel' as const, justificativa: 'Sem oportunidade.', evidencias: [], oportunidades: [] };
        return {
          id: d.codigo,
          classificacao: 'n3' as const,
          justificativa: 'Você perguntou pela disponibilidade.',
          evidencias: [{ mensagemId: 'm1', trecho: ci === 4 ? 'Frase que nunca foi dita.' : 'Qual horário funciona para você?' }],
          oportunidades: [{ mensagemId: 'm0', trecho: s.historico[0].content.slice(0, 20) }],
        };
      }),
    ),
    ocorrencias: [],
    desfecho: { tipo: 'nao_resolvido', justificativa: 'Sem combinado.', evidencias: [] },
    feedback: { acerto: 'a', melhoria: 'b', novaTentativa: 'c' },
  };
  const relatorio = consolidar(s, insumos)!;
  return { relatorio, historico: s.historico, dominio: c.dominio };
}

describe('C-1: competência sem nível por evidência descartada', () => {
  it('o caminho real do atendimento marca a competência como "Evidência descartada"', () => {
    const { relatorio, historico, dominio } = relatorioComDescarte();
    // Pré-condição: o descarte aconteceu e zerou os observados da competência.
    expect(relatorio.descartados).toHaveLength(1);
    const proc = relatorio.competencias!.find((c) => c.codigo === 'procedimentos')!;
    expect(proc).toMatchObject({ observados: 0, nivel: null });

    const html = render(createElement(MatrizAtendimento, { relatorio, historico, nomePersona: 'Marina', dominio }));
    const procedimentos = resumo(html, 'Procedimentos e proteção de informações');
    expect(procedimentos).toContain('Evidência descartada');
    expect(procedimentos).not.toContain('Sem oportunidade de observar');
    // Controle: sem conduta avaliada, a leitura antiga continua valendo.
    expect(resumo(html, 'Resolução e encaminhamento')).toContain('Sem oportunidade de observar');
  });

  it('a chave existe nos quatro idiomas e o componente comum a usa', () => {
    const competencias = [
      {
        codigo: 'x',
        nome: 'Competência X',
        nota: null,
        nivel: null,
        observados: 0,
        total: 6,
        suficiente: false,
        descritores: [{ codigo: 'x1', nome: 'Descritor', nivel: null, descartado: true }],
      },
    ];
    for (const locale of Object.keys(MENSAGENS)) {
      const esperado = MENSAGENS[locale].SimuladoresRelatorio.discardedShort;
      expect(esperado, locale).toBeTruthy();
      const html = render(createElement(RelatorioCompetencias, { competencias, regra: null }), locale);
      expect(resumo(html, 'Competência X'), locale).toContain(esperado);
    }
  });
});

/**
 * R-126 (revisão de 02/10/2026): com descarte PARCIAL (sobraram observados
 * abaixo do mínimo), o aviso dizia "faltou oportunidade de demonstrar os
 * demais" e o comportamento descartado aparecia como "Não observado". Agora o
 * aviso tem a variante que conta as citações descartadas, e o descritor leva o
 * rótulo "Evidência descartada".
 */
function relatorioComDescarteParcial() {
  const c = aplicarMatrizAtendimento(structuredClone(catalogoLimites[0]));
  const s = abrirSessao(c, 0);
  s.historico.push(
    { id: 'm1', role: 'user', content: 'Entendo o impacto. Qual horário funciona para você?' },
    { id: 'm2', role: 'assistant', content: 'Só depois das 17h30.' },
  );
  s.respostas = 1;
  // Resolução (ci 3): dois comportamentos com citação válida e um com citação inventada.
  const insumos: Insumos = {
    dimensoes: c.matriz!.competencias.flatMap((comp, ci) =>
      comp.descritores.map((d, di) => {
        const avaliado = ci < 3 || (ci === 3 && di <= 2);
        if (!avaliado)
          return { id: d.codigo, classificacao: 'nao_observavel' as const, justificativa: 'Sem oportunidade.', evidencias: [], oportunidades: [] };
        const inventada = ci === 3 && di === 2;
        return {
          id: d.codigo,
          classificacao: 'n3' as const,
          justificativa: 'Você perguntou pela disponibilidade.',
          evidencias: [{ mensagemId: 'm1', trecho: inventada ? 'Frase que nunca foi dita.' : 'Qual horário funciona para você?' }],
          oportunidades: [{ mensagemId: 'm0', trecho: s.historico[0].content.slice(0, 20) }],
        };
      }),
    ),
    ocorrencias: [],
    desfecho: { tipo: 'nao_resolvido', justificativa: 'Sem combinado.', evidencias: [] },
    feedback: { acerto: 'a', melhoria: 'b', novaTentativa: 'c' },
  };
  const relatorio = consolidar(s, insumos)!;
  return { relatorio, historico: s.historico, dominio: c.dominio, descartado: c.matriz!.competencias[3].descritores[2].nome };
}

/**
 * O bloco inteiro da competência (resumo + corpo), até a próxima competência.
 * Não dá para cortar em `<details`: a régua e o grupo "sem oportunidade" de
 * cada comportamento também são `<details>`.
 */
function bloco(html: string, nome: string) {
  const ini = html.indexOf(`<span>${nome}</span>`);
  expect(ini, `competência ${nome} não renderizada`).toBeGreaterThan(-1);
  const resto = html.slice(ini);
  const prox = resto.search(/<details class="[^"]*_competencia_/);
  return prox < 0 ? resto : resto.slice(0, prox);
}

describe('R-126: descarte parcial não vira "faltou oportunidade"', () => {
  it('o aviso conta as citações descartadas e o descritor diz "Evidência descartada"', () => {
    const { relatorio, historico, dominio, descartado } = relatorioComDescarteParcial();
    // Pré-condição: o descarte foi parcial (sobraram observados, abaixo do mínimo).
    expect(relatorio.descartados).toHaveLength(1);
    const res = relatorio.competencias!.find((c) => c.codigo === 'resolucao')!;
    expect(res).toMatchObject({ observados: 2, suficiente: false, nivel: null });

    const html = render(createElement(MatrizAtendimento, { relatorio, historico, nomePersona: 'Marina', dominio }));
    const resolucao = bloco(html, 'Resolução e encaminhamento');
    expect(resolucao).toContain('não conferiu com o que foi dito e foi descartada');
    expect(resolucao).not.toContain('faltou oportunidade');
    // O descritor descartado tem o próprio rótulo, não "Não observado".
    // O React escapa aspas e apóstrofos no HTML; o nome vem do catálogo.
    const escapado = descartado.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const item = resolucao.split('<li>').find((li) => li.includes(escapado))!;
    expect(item).toBeTruthy();
    expect(item).toContain('Evidência descartada');
    expect(item).not.toContain('Não observado');
  });

  it('sem descarte, o aviso de falta de oportunidade continua (controle)', () => {
    const competencias = [
      {
        codigo: 'x', nome: 'Competência X', nota: null, nivel: null, observados: 2, total: 6, suficiente: false,
        descritores: [
          { codigo: 'x1', nome: 'Visto', nivel: 3 },
          { codigo: 'x2', nome: 'Também visto', nivel: 2 },
        ],
      },
    ];
    const html = render(createElement(RelatorioCompetencias, { competencias, regra: { minDescritores: 4, minCompetencias: 3 } }));
    expect(html).toContain('faltou oportunidade');
  });

  it('a variante existe nos quatro idiomas e é usada pelo componente', () => {
    const competencias = [
      {
        codigo: 'x', nome: 'Competência X', nota: null, nivel: null, observados: 1, total: 6, suficiente: false,
        descritores: [
          { codigo: 'x1', nome: 'Visto', nivel: 3 },
          { codigo: 'x2', nome: 'Caiu', nivel: null, descartado: true },
        ],
      },
    ];
    for (const locale of Object.keys(MENSAGENS)) {
      expect(MENSAGENS[locale].SimuladoresRelatorio.insufficientDiscarded, locale).toBeTruthy();
      const html = render(createElement(RelatorioCompetencias, { competencias, regra: { minDescritores: 4, minCompetencias: 3 } }), locale);
      expect(html, locale).not.toContain(MENSAGENS[locale].SimuladoresRelatorio.notObservedShort);
      expect(html, locale).toContain(MENSAGENS[locale].SimuladoresRelatorio.discardedShort);
    }
  });
});
