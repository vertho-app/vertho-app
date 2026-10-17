import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { htmlDaComposicao, linhaDoTempo, lerRuntime } from '@/worker-hetzner/video-v7/composicao.mjs';
import { MODELOS_CATALOGO_V7 } from '@/lib/video/v7/catalogo';

/**
 * A composição do vídeo da biblioteca v7 e o executor próprio dos filmes. Validados em 17/10/2026 contra os dois
 * vídeos de validação aprovados, renderizados no HyperFrames: igual quadro a quadro dentro do ruído da comparação.
 * Aqui ficam as garantias que não precisam de navegador: os momentos entram como DADOS (nada de código em texto),
 * o JSON não fecha a tag do script, a ordem de carga, e a calibração da digitação medida no player de referência.
 */

const DIR = path.resolve(__dirname, '../../../worker-hetzner/video-v7');
const runtime = lerRuntime(DIR);
const mom = (id: string, tpl: string, fundo = 'navy', data: Record<string, unknown> = { t: 0.3 }, dur = 6) => ({ id, tpl, data, dur, fundo });

describe('linha do tempo', () => {
  it('cada momento começa onde o anterior termina e conhece o fundo do anterior (para a passagem)', () => {
    const r = linhaDoTempo([mom('s2-1-fluxo', 'fluxo', 'navy'), mom('s2-2-balanca', 'balanca', 'claro', {}, 4.5), mom('s3-1-rede', 'rede', 'branco')]);
    expect(r.duracao).toBe(16.5);
    expect(r.momentos.map((x: { start: number; anterior: string }) => [x.start, x.anterior])).toEqual([[0, 'navy'], [6, 'navy'], [10.5, 'claro']]);
  });

  it('recusa id, modelo ou fundo fora do formato (eles vão para atributos e para o JSON do filme)', () => {
    expect(() => linhaDoTempo([mom('s2"><script>', 'fluxo')])).toThrow(/id/);
    expect(() => linhaDoTempo([mom('s2-1', 'fluxo(1)')])).toThrow(/modelo/);
    expect(() => linhaDoTempo([mom('s2-1', 'fluxo', 'roxo')])).toThrow(/fundo/);
    expect(() => linhaDoTempo([])).toThrow(/sem momentos/);
  });
});

describe('o index.html', () => {
  const { html, duracao } = htmlDaComposicao({
    momentos: [mom('s2-1-citacao', 'citacao', 'claro', { t: 0.4, texto: 'fim da tag </script><img src=x onerror=alert(1)>' })],
    assets: { 's2-1-imagem.png': 'midia/s2-1-imagem.png' },
    audios: [{ arquivo: 'midia/scene-2.mp3', inicio: 0 }],
    runtime,
  });

  it('leva os momentos como JSON e nunca monta código a partir deles', () => {
    expect(html).not.toMatch(/new Function\(|\beval\(/);
    const json = html.match(/<script type="application\/json" id="filme-dados">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy();
    const dados = JSON.parse(json!);
    expect(dados.momentos[0]).toMatchObject({ id: 's2-1-citacao', tpl: 'citacao', fundo: 'claro', start: 0, anterior: 'navy' });
    expect(dados.duracao).toBe(duracao);
  });

  it('um "</script>" no texto do plano não fecha a tag do JSON', () => {
    const json = html.match(/<script type="application\/json" id="filme-dados">([\s\S]*?)<\/script>/)![1];
    expect(json).not.toContain('</script');
    expect(JSON.parse(json).momentos[0].data.texto).toBe('fim da tag </script><img src=x onerror=alert(1)>');
  });

  it('carrega o executor antes das linhas da marca, a biblioteca antes da camada, e o driver por último', () => {
    const pos = (marca: string) => html.indexOf(marca);
    const ordem = ['window.__vertho = {', 'window.UI = (function', 'window.LIB = { T, ICONES }', 'window.__vertho.cena = cena', "getElementById('filme-dados')"].map(pos);
    expect(ordem.every((p) => p > 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(html).toContain('data-start="0" data-duration="6.000" data-volume="1"');
  });
});

describe('a biblioteca tem todo modelo que o catálogo oferece', () => {
  it('cada modelo do catálogo existe como LIB.T.<modelo>', () => {
    const lib = readFileSync(path.join(DIR, 'biblioteca.js'), 'utf8');
    const faltam = MODELOS_CATALOGO_V7.filter((n) => !new RegExp('\\bT\\.' + n + ' = ').test(lib));
    expect(faltam).toEqual([]);
  });
});

describe('o executor próprio (kit.js)', () => {
  // o kit roda no navegador; as funções puras dele cabem num contexto com um documento mínimo
  const ctx: Record<string, unknown> = { window: {}, document: { createElement: () => ({}), createTreeWalker: () => ({}) } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(path.join(DIR, 'kit.js'), 'utf8'), ctx);
  const kit = (ctx.window as { kit: Record<string, (...a: never[]) => unknown> }).kit as unknown as {
    seg: (t: number, a: number, b: number) => number; eo: (x: number) => number; eio: (x: number) => number; eob: (x: number, s?: number) => number;
    typist: (txt: string, t0: number, cps?: number, seed?: number) => { end: number; times: number[]; at: (t: number) => string };
  };

  it('as curvas: seg recorta, eo/eio/eob vão de 0 a 1', () => {
    expect([kit.seg(-1, 0, 2), kit.seg(1, 0, 2), kit.seg(9, 0, 2)]).toEqual([0, 0.5, 1]);
    expect(kit.eo(0.1)).toBeCloseTo(0.271, 3);   // medido no player: 1ª palavra a 0,05 s de 0,5 s = 0,271
    expect([kit.eo(0), kit.eio(0), kit.eob(0), kit.eo(1), kit.eio(1), kit.eob(1)]).toEqual([0, 0, 0, 1, 1, 1]);
    expect(kit.eob(0.7)).toBeGreaterThan(1);   // passa do ponto e volta
  });

  it('a digitação é determinística e termina perto do player de referência (medido em 17/10)', () => {
    const casos: [string, number, number][] = [['Regra objetiva, verificável', 11, 1.1076], ['Equipamento estranho no salão', 12, 1.2409], ['abc def', 7, 0.3438]];
    for (const [txt, seed, fimNoPlayer] of casos) {
      const a = kit.typist(txt, 0, 24, seed), b = kit.typist(txt, 0, 24, seed);
      expect(a.times).toEqual(b.times);
      expect(Math.abs(a.end - fimNoPlayer)).toBeLessThan(0.06);
      expect(a.times[0]).toBeCloseTo(0.0319, 3);
      expect(a.at(a.end)).toBe(txt);
      expect(a.at(0)).toBe('');
    }
  });
});
