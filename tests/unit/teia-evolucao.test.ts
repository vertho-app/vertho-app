/**
 * A TEIA do relatório de evolução (pedido do dono, 17/09/2026: as duas
 * avaliações sobrepostas).
 *
 * 🔴 O QUE ESTE ARQUIVO PROTEGE. Sobrepor diagnóstico e fechamento é desenhar o
 * par de notas que saiu das telas em 14/09 — e, onde a nota caiu, é um veredito
 * de regressão em forma de bico afundado, que a régua do produto não afirma
 * (`avancoExibido` tem piso em zero desde 14/09; o nível da competência tem
 * `Math.max` desde 16/09). `Medido: 17/09/2026` — 33 dos 331 comportamentos
 * gravados (10%), em 8 dos 47 relatórios, têm nota final MENOR que a inicial.
 * Sem o piso, essas 8 pessoas abrem o relatório com o gráfico contradizendo o
 * texto ao lado.
 *
 * Os testes de geometria existem porque tela e papel desenham a MESMA teia por
 * dois renderizadores diferentes: se a régua não estiver num núcleo só, ela
 * diverge (é a história de `convergencia.ts`, com nove cópias da régua de
 * nível).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { isValidElement, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import RelatorioTemporadaConcluida from '@/components/temporada/relatorio-temporada-concluida';
import { GEOMETRIA_TELA } from '@/components/temporada/teia-evolucao';
import { TemporadaConcluidaPDF } from '@/lib/temporada-concluida-pdf';
import { montarTeia, temTeia, quebrarRotulo, MIN_EIXOS, NOTA_MAX, NOTA_MIN } from '@/lib/season-engine/teia-evolucao';

const CENTRO = { x: 100, y: 100 };
const RAIO = 60;
const opcoes = { centro: CENTRO, raio: RAIO };

const raioDe = (p: { x: number; y: number }) => Math.hypot(p.x - CENTRO.x, p.y - CENTRO.y);

function descritor(nome: string, pre: number | null, pos: number | null) {
  return { descritor: nome, nota_pre: pre, nota_pos: pos };
}

/** Seis comportamentos, um deles em QUEDA — a forma real de um relatório. */
const SEIS = [
  descritor('Organização do plano', 1.5, 2.7),
  descritor('Gestão de riscos', 1.9, 2.8),
  descritor('Leitura do contexto', 2.0, 2.0),
  descritor('Limites profissionais', 2.2, 2.1),
  descritor('Busca de apoio', 1.2, 3.0),
  descritor('Comunicação com a equipe', 2.4, 2.9),
];

describe('o piso: a teia não afirma queda que a régua não afirma', () => {
  it('comportamento que caiu fecha no MESMO ponto em que começou', () => {
    const teia = montarTeia(SEIS, opcoes)!;
    const caiu = teia.eixos.find((e) => e.rotulo === 'Limites profissionais')!;
    expect(caiu.inicio).toBe(2.2);
    expect(caiu.fim).toBe(2.2);
    expect(caiu.segurouNoPiso).toBe(true);
    expect(caiu.pontoFim).toEqual(caiu.pontoInicio);
  });

  it('nenhum vértice do fechamento fica mais perto do centro que o do diagnóstico', () => {
    // Varre TODOS os eixos, com quedas de todos os tamanhos: a asserção é de
    // ausência, então ela precisa do conjunto inteiro, não de um caso.
    const variados = [
      descritor('a', 3.4, 1.0), descritor('b', 2.0, 2.0), descritor('c', 1.0, 4.0),
      descritor('d', 2.6, 2.5), descritor('e', 3.9, 3.2), descritor('f', 1.1, 1.2),
    ];
    const teia = montarTeia(variados, opcoes)!;
    expect(teia.eixos).toHaveLength(6);
    for (const e of teia.eixos) {
      expect(raioDe(e.pontoFim), `${e.rotulo} encolheu`).toBeGreaterThanOrEqual(raioDe(e.pontoInicio) - 1e-9);
      expect(e.fim).toBeGreaterThanOrEqual(e.inicio);
    }
    // e o piso de fato agiu nos que caíram (senão o teste acima passaria por
    // não haver queda nenhuma no fixture)
    expect(teia.eixos.filter((e) => e.segurouNoPiso).map((e) => e.rotulo)).toEqual(['a', 'd', 'e']);
  });

  it('quem subiu continua subindo: o piso não achata o avanço', () => {
    const teia = montarTeia(SEIS, opcoes)!;
    const subiu = teia.eixos.find((e) => e.rotulo === 'Busca de apoio')!;
    expect(subiu.fim).toBe(3.0);
    expect(subiu.segurouNoPiso).toBe(false);
    expect(raioDe(subiu.pontoFim)).toBeGreaterThan(raioDe(subiu.pontoInicio));
  });
});

describe('quando não há teia', () => {
  it(`menos de ${MIN_EIXOS} comportamentos medidos: nada é desenhado`, () => {
    expect(montarTeia(SEIS.slice(0, 2), opcoes)).toBeNull();
    expect(temTeia(SEIS.slice(0, 2))).toBe(false);
    expect(montarTeia([], opcoes)).toBeNull();
    expect(montarTeia(null, opcoes)).toBeNull();
    expect(montarTeia(SEIS.slice(0, 3), opcoes)).not.toBeNull();
    expect(temTeia(SEIS.slice(0, 3))).toBe(true);
  });

  it('`temTeia` e `montarTeia` decidem igual — o PDF escolhe o layout por uma e desenha pela outra', () => {
    const casos = [SEIS, SEIS.slice(0, 1), SEIS.slice(0, 2), SEIS.slice(0, 3), [], null,
      [descritor('x', 1, null), descritor('y', 2, 3), descritor('z', 1, 2)]];
    for (const caso of casos) {
      expect(temTeia(caso), JSON.stringify(caso)).toBe(montarTeia(caso, opcoes) != null);
    }
  });

  it('nota ausente não vira zero no centro: o comportamento fica de fora', () => {
    const comBuraco = [
      descritor('sem fim', 2.0, null),
      descritor('sem começo', null, 2.0),
      ...SEIS.slice(0, 3),
    ];
    const teia = montarTeia(comBuraco, opcoes)!;
    expect(teia.eixos.map((e) => e.rotulo)).toEqual(['Organização do plano', 'Gestão de riscos', 'Leitura do contexto']);
    // o caso que já mordeu em `avancoExibido`: string vazia é `Number('') === 0`,
    // e um eixo em zero seria um bico no centro que ninguém mediu
    const comVazio = [...SEIS.slice(0, 3), { descritor: 'c', nota_pre: '', nota_pos: '' }];
    expect(montarTeia(comVazio, opcoes)!.eixos.map((e) => e.rotulo)).not.toContain('c');
    expect(montarTeia(comVazio, opcoes)!.eixos).toHaveLength(3);
  });
});

describe('escala e geometria', () => {
  it(`nota ${NOTA_MIN} no centro, nota ${NOTA_MAX} na ponta, meio termo no meio`, () => {
    const teia = montarTeia([descritor('a', 1, 1), descritor('b', 4, 4), descritor('c', 2.5, 2.5)], opcoes)!;
    expect(raioDe(teia.eixos[0].pontoInicio)).toBeCloseTo(0, 6);
    expect(raioDe(teia.eixos[1].pontoInicio)).toBeCloseTo(RAIO, 6);
    expect(raioDe(teia.eixos[2].pontoInicio)).toBeCloseTo(RAIO / 2, 6);
    for (const e of teia.eixos) expect(raioDe(e.vertice)).toBeCloseTo(RAIO, 6);
  });

  it('nota fora da escala não sai do desenho', () => {
    const teia = montarTeia([descritor('a', 0, 9), descritor('b', 2, 2), descritor('c', -3, 1)], opcoes)!;
    for (const e of teia.eixos) {
      expect(raioDe(e.pontoInicio)).toBeLessThanOrEqual(RAIO + 1e-9);
      expect(raioDe(e.pontoFim)).toBeLessThanOrEqual(RAIO + 1e-9);
      expect(e.inicio).toBeGreaterThanOrEqual(NOTA_MIN);
      expect(e.fim).toBeLessThanOrEqual(NOTA_MAX);
    }
  });

  it('o primeiro comportamento fica no topo e os demais seguem em sentido horário', () => {
    const teia = montarTeia([descritor('topo', 4, 4), descritor('direita-baixo', 4, 4), descritor('esquerda-baixo', 4, 4)], opcoes)!;
    const [topo, dir, esq] = teia.eixos.map((e) => e.vertice);
    expect(topo.x).toBeCloseTo(CENTRO.x, 6);
    expect(topo.y).toBeLessThan(CENTRO.y);
    expect(dir.x).toBeGreaterThan(CENTRO.x);
    expect(dir.y).toBeGreaterThan(CENTRO.y);
    expect(esq.x).toBeLessThan(CENTRO.x);
  });

  it('o rótulo se afasta do desenho para o lado certo', () => {
    const teia = montarTeia([descritor('topo', 2, 2), descritor('direita', 2, 2), descritor('esquerda', 2, 2)], opcoes)!;
    expect(teia.eixos[0].ancora).toBe('middle');
    expect(teia.eixos[1].ancora).toBe('start');
    expect(teia.eixos[2].ancora).toBe('end');
    for (const e of teia.eixos) expect(raioDe(e.pontoRotulo)).toBeGreaterThan(RAIO);
  });

  it('os polígonos têm um vértice por comportamento e os anéis também', () => {
    const teia = montarTeia(SEIS, opcoes)!;
    expect(teia.poligonoInicio.split(' ')).toHaveLength(6);
    expect(teia.poligonoFim.split(' ')).toHaveLength(6);
    for (const anel of teia.aneis) expect(anel.pontos.split(' ')).toHaveLength(6);
    expect(teia.aneis.map((a) => a.valor)).toEqual([2, 3, 4]);
  });
});

describe('rótulo do eixo', () => {
  it('quebra sem cortar palavra e cabe em duas linhas', () => {
    expect(quebrarRotulo('Leitura do contexto e identificação do problema', 22, 2))
      .toEqual(['Leitura do contexto e', 'identificação do…']);
    expect(quebrarRotulo('Gestão de riscos', 22, 2)).toEqual(['Gestão de riscos']);
    expect(quebrarRotulo('', 22, 2)).toEqual([]);
  });

  it('palavra única maior que a linha não some', () => {
    expect(quebrarRotulo('Interdisciplinaridade', 10, 2)).toEqual(['Interdisciplinaridade']);
  });

  it('🔴 o código da matriz NUNCA vira rótulo de eixo', () => {
    const teia = montarTeia([
      descritor('COO03_D1 — Consciência de limites', 1.3, 3.0),
      descritor('GES12_D3 – Gestão de riscos', 1.9, 2.8),
      descritor('DIR7_D10-Busca de apoio', 1.2, 3.0),
    ], opcoes)!;
    expect(teia.eixos.map((e) => e.rotulo)).toEqual(['Consciência de limites', 'Gestão de riscos', 'Busca de apoio']);
    for (const e of teia.eixos) expect(e.linhas.join(' ')).not.toMatch(/[A-Z]{2,5}\d{1,3}_[A-Z]\d+/);
  });
});

/**
 * A teia chega às DUAS superfícies do relatório — a tela que a pessoa abre e o
 * PDF que ela baixa. O fix de 14/09 valeu só em admin e gestor e deixou o
 * colaborador de fora; o guard cobre os dois lugares de uma vez.
 */
describe('a teia nas duas superfícies', () => {
  const seisNaMesmaCompetencia = SEIS.map((d) => ({ ...d, competencia: 'Planejamento', convergencia: 'evolucao_parcial' }));
  const dados = (descritores: any[]) => ({
    colab: { nome: 'Pessoa Teste', cargo: 'Gestão Escolar' },
    trilha: { competencia: 'Planejamento', numeroTemporada: 1, totalSemanas: 9 },
    evolutionReport: { resumo: { confirmadas: 0, parciais: 5, estagnacoes: 1 }, descritores },
    momentos: [], missoes: [], sem14: { resumo_avaliacao: { mensagem_geral: 'DEVOLUTIVA' } },
  });
  const pt = JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')).SeasonDone;

  function textosDaArvore(no: any, out: string[] = []): string[] {
    if (no == null || typeof no === 'boolean') return out;
    if (typeof no === 'string' || typeof no === 'number') { out.push(String(no)); return out; }
    if (Array.isArray(no)) { for (const n of no) textosDaArvore(n, out); return out; }
    if (isValidElement(no)) {
      const { type, props } = no as any;
      return typeof type === 'function' ? textosDaArvore(type(props), out) : textosDaArvore(props?.children, out);
    }
    return out;
  }
  const textoDoPdf = (descritores: any[]) =>
    textosDaArvore(TemporadaConcluidaPDF({ dados: dados(descritores), marca: { logoBase64: null, mostrarVertho: true } as any })).join('\n');

  const htmlDaTela = (descritores: any[]) => renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale: 'pt-BR', messages: JSON.parse(readFileSync('messages/pt-BR.json', 'utf8')), timeZone: 'America/Sao_Paulo',
    children: createElement(RelatorioTemporadaConcluida, { data: dados(descritores) }),
  }));

  it('o PDF traz a teia com legenda quando a competência tem comportamentos suficientes', () => {
    const t = textoDoPdf(seisNaMesmaCompetencia);
    expect(t).toContain(pt.chart.legendStart);
    expect(t).toContain(pt.chart.legendEnd);
    expect(t).toContain(pt.chart.note);
    // e o rótulo de cada eixo, que é o comportamento
    expect(t).toContain('Limites profissionais');
  });

  it('a tela desenha os dois polígonos, e o do fim nunca entra no do início', () => {
    const html = htmlDaTela(seisNaMesmaCompetencia);
    const poligonos = [...html.matchAll(/<polygon[^>]*points="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    // 3 anéis + fim + início
    expect(poligonos).toHaveLength(5);
    const { centro } = GEOMETRIA_TELA;
    const raios = (pts: string) => pts.split(' ').map((p) => {
      const [x, y] = p.split(',').map(Number);
      return Math.hypot(x - centro.x, y - centro.y);
    });
    const [fim, inicio] = [raios(poligonos[3]), raios(poligonos[4])];
    expect(fim).toHaveLength(6);
    for (const [i, r] of fim.entries()) expect(r, `eixo ${i}`).toBeGreaterThanOrEqual(inicio[i] - 0.02);
    expect(html).toContain(pt.chart.legendStart);
  });

  it('sem comportamentos suficientes, nenhuma das duas desenha', () => {
    const dois = seisNaMesmaCompetencia.slice(0, 2);
    expect(textoDoPdf(dois)).not.toContain(pt.chart.legendStart);
    expect(htmlDaTela(dois)).not.toContain('<polygon');
  });

  it('a legenda existe nos 4 idiomas', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const j = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      for (const chave of ['legendStart', 'legendEnd', 'scale', 'note', 'alt']) {
        expect(String(j.SeasonDone.chart?.[chave] || ''), `${loc}.${chave}`).not.toBe('');
      }
    }
  });
});
