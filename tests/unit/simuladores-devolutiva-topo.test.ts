/**
 * Revisão de 04/10/2026, itens de devolutiva:
 *  - vendas: a recomendação prioritária vem ANTES das competências (no celular
 *    ela ficava depois das cinco) e não se repete na lista de baixo;
 *  - vendas: "volta como foco no próximo plano" só quando é verdade (a
 *    devolutiva antiga do histórico não volta);
 *  - atendimento: o nível geral aparece uma vez na devolutiva de quem treinou
 *    (cabeçalho), e a revisão da equipe segue com o bloco.
 *
 * Renderiza os componentes reais com as mensagens reais em pt-BR.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import Relatorio from '@/components/simulador-vendas/relatorio';
import MatrizAtendimento from '@/components/recepcao/matriz-relatorio';
import { relatorioDocumental } from '../fixtures/simulador-vendas-matriz';

const MENSAGENS = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8'));
const html = (children: ReactElement) =>
  renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'pt-BR', messages: MENSAGENS, timeZone: 'America/Sao_Paulo' },
      children,
    ),
  );
const ocorrencias = (texto: string, trecho: string) => texto.split(trecho).length - 1;

describe('vendas: prioridade no topo da devolutiva', () => {
  const vendas = (props: Record<string, unknown> = {}) =>
    html(
      createElement(Relatorio, {
        relatorio: relatorioDocumental() as any,
        versao: 'pace-7',
        ...props,
      }),
    );
  const v = MENSAGENS.SimuladorVendas;

  it('a prioritária vem antes da matriz, uma vez só; as demais seguem na lista', () => {
    const h = vendas();
    const prioridade = h.indexOf(v.priority);
    const matriz = h.indexOf('aria-label="Devolutiva por competência"');
    const lista = h.indexOf(v.recommendations);
    expect(prioridade).toBeGreaterThan(-1);
    expect(matriz).toBeGreaterThan(prioridade);
    expect(lista).toBeGreaterThan(matriz);
    expect(ocorrencias(h, 'Confirme o diagnóstico')).toBe(1);
    expect(h.indexOf('Confirme o diagnóstico')).toBeLessThan(matriz);
    for (const outra of ['Defina o avanço', 'Combine próximos passos'])
      expect(h.indexOf(outra)).toBeGreaterThan(lista);
  });

  it('"volta no próximo plano" só quando a prioridade É o foco sugerido', () => {
    expect(vendas()).not.toContain(v.priorityNextPlan);
    expect(vendas({ focoSugerido: 'Outro foco, de devolutiva mais nova' })).not.toContain(v.priorityNextPlan);
    expect(vendas({ focoSugerido: 'Confirme o diagnóstico' })).toContain(v.priorityNextPlan);
    // A equipe lê a devolutiva de outra pessoa: o plano não é dela.
    expect(vendas({ focoSugerido: 'Confirme o diagnóstico', modo: 'equipe' })).not.toContain(v.priorityNextPlan);
  });

  it('sem nenhuma recomendação marcada, a lista fica como era e não há destaque', () => {
    const r = relatorioDocumental();
    for (const item of r.Recomendacoes) item.prioritaria = false;
    const h = html(createElement(Relatorio, { relatorio: r as any, versao: 'pace-7' }));
    expect(h).not.toContain(v.priority);
    expect(ocorrencias(h, 'Confirme o diagnóstico')).toBe(1);
    expect(h.indexOf('Confirme o diagnóstico')).toBeGreaterThan(h.indexOf(v.recommendations));
  });
});

describe('atendimento: nível geral uma vez só na devolutiva de quem treinou', () => {
  const relatorio = {
    nota: 3,
    regraCobertura: true,
    dimensoes: [],
    competencias: [
      { codigo: 'clareza', nome: 'Clareza', nota: 3, nivel: 3, observados: 4, total: 4, suficiente: true, descritores: [] },
    ],
  } as any;
  const matriz = (props: Record<string, unknown> = {}) =>
    html(
      createElement(MatrizAtendimento, {
        relatorio,
        historico: [],
        nomePersona: 'Paciente',
        ...props,
      }),
    );
  const rotulo = `>${MENSAGENS.SimuladoresRelatorio.overall}<`;

  it('quem treinou: sem o bloco "Nível geral" (o cabeçalho já mostra o nível)', () => {
    expect(matriz({ comMedia: false })).not.toContain(rotulo);
  });

  it('a revisão da equipe continua com o bloco, que é a única leitura do nível ali', () => {
    expect(matriz({ publico: 'equipe' })).toContain(rotulo);
  });
});
