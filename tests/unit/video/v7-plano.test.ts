import { describe, it, expect } from 'vitest';
import {
  problemasDoPlano, aplicarAjustes, montarMomentos, segundosDaAncora, tetoDeTempo, cabeAjuste, pedidoDeAjuste,
  type CenaPlano, type RespostaPlano, type FraseCena,
} from '@/lib/video/v7/plano';
import { MODELOS_CATALOGO_V7, CATALOGO_V7 } from '@/lib/video/v7/catalogo';

/**
 * As regras do plano visual da biblioteca v7 que o código GARANTE (o catálogo só pede). Cada caso reproduz o defeito
 * que a regra fecha, medido nos vídeos de validação de 16 e 17/10/2026: um modelo repetido mesmo com a regra no
 * prompt, momentos sob medida depois de o dono tirá-los, o `vago_preciso` depois de sair do catálogo, e momentos
 * longos e vazios que deixavam 10,6% do vídeo parado. Dados sintéticos: o repositório é público.
 */

/** Uma cena com `n` frases de 3 s cada (pausa de 0,5 s entre elas). */
function cena(id: string, n: number): CenaPlano {
  const frases: FraseCena[] = Array.from({ length: n }, (_, i) => ({ i, de: i * 3.5, ate: i * 3.5 + 3, texto: 'frase ' + i }));
  return { id, dur: n * 3.5 + 0.5, frases };
}
const m = (tpl: string, a: number, b: number, data: Record<string, unknown> = { t: '@' + a }, fundo = 'navy') => ({ frases: [a, b] as [number, number], tpl, fundo, nome: tpl, data });

describe('problemasDoPlano: as regras garantidas', () => {
  it('acusa o modelo repetido no vídeo (a 2ª ocorrência), mas não a imagem', () => {
    const cenas = [cena('scene-2', 4), cena('scene-3', 4)];
    const resp: RespostaPlano = { cenas: [
      { id: 'scene-2', momentos: [m('balanca', 0, 1), m('imagem', 2, 3)] },
      { id: 'scene-3', momentos: [m('imagem', 0, 1), m('balanca', 2, 3)] },
    ] };
    const p = problemasDoPlano(resp, cenas);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ cena: 'scene-3', k: 1, tpl: 'balanca' });
    expect(p[0].problema).toMatch(/repeats a template/);
  });

  it('acusa `sob_medida` e modelo fora do catálogo (o `vago_preciso` saiu em 17/10)', () => {
    const resp: RespostaPlano = { cenas: [{ id: 'scene-2', momentos: [m('sob_medida', 0, 1), m('vago_preciso', 2, 3)] }] };
    const p = problemasDoPlano(resp, [cena('scene-2', 4)]);
    expect(p.map((x) => x.tpl)).toEqual(['sob_medida', 'vago_preciso']);
    expect(p[0].problema).toMatch(/sob_medida/);
    expect(p[1].problema).toMatch(/not in the library/);
    expect(MODELOS_CATALOGO_V7).not.toContain('vago_preciso');
  });

  it('acusa o momento longo e ESPARSO, e não o longo cheio de eventos', () => {
    // 8 frases = 28,5 s num momento só. Esparso: só a âncora da 1ª frase (vazio de ~24 s). Cheio: uma âncora por frase.
    const c = cena('scene-4', 8);
    const esparso: RespostaPlano = { cenas: [{ id: 'scene-4', momentos: [m('escada', 0, 7, { t: '@0' })] }] };
    const cheio: RespostaPlano = { cenas: [{ id: 'scene-4', momentos: [m('escada', 0, 7, { t: '@0', degraus: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ texto: 'd' + i, t: '@' + i + '+0.3' })) })] }] };
    const p = problemasDoPlano(esparso, [c]);
    expect(p).toHaveLength(1);
    expect(p[0].problema).toMatch(/SPLIT/);
    expect(problemasDoPlano(cheio, [c])).toHaveLength(0);
  });

  it('a imagem longa não é dividida (ela não tem eventos por natureza)', () => {
    const resp: RespostaPlano = { cenas: [{ id: 'scene-4', momentos: [m('imagem', 0, 7, { lado: 'cheia' })] }] };
    expect(problemasDoPlano(resp, [cena('scene-4', 8)])).toHaveLength(0);
  });
});

describe('aplicarAjustes: a troca devolvida pelo Opus', () => {
  const cenas = [cena('scene-2', 6)];
  const base = (): RespostaPlano => ({ cenas: [{ id: 'scene-2', momentos: [m('balanca', 0, 1), m('caderno', 2, 3), m('balanca', 4, 5)] }] });

  it('aceita a troca por modelo livre e a registra', () => {
    const resp = base(), p = problemasDoPlano(resp, cenas);
    const r = aplicarAjustes(resp, p, [{ cena: 'scene-2', k: 2, momentos: [m('semaforo', 4, 5)] }]);
    expect(r).toEqual({ feitas: [expect.stringContaining('balanca')], recusadas: 0 });
    expect(resp.cenas[0].momentos.map((x) => x.tpl)).toEqual(['balanca', 'caderno', 'semaforo']);
    expect(resp.ajustes_n).toBe(1);
    expect(problemasDoPlano(resp, cenas)).toHaveLength(0);
  });

  it('recusa a troca por modelo já usado no vídeo, por `sob_medida`, por modelo fora do catálogo e por modelo duplicado', () => {
    for (const novos of [[m('caderno', 4, 5)], [m('sob_medida', 4, 5)], [m('vago_preciso', 4, 5)], [m('ciclo', 4, 4), m('ciclo', 5, 5)]]) {
      const resp = base(), p = problemasDoPlano(resp, cenas);
      const r = aplicarAjustes(resp, p, [{ cena: 'scene-2', k: 2, momentos: novos }]);
      expect(r.recusadas).toBe(1);
      expect(resp.cenas[0].momentos[2].tpl).toBe('balanca');
    }
  });

  it('a divisão cobre exatamente as frases do original, mesmo que a resposta erre a borda', () => {
    const resp: RespostaPlano = { cenas: [{ id: 'scene-4', momentos: [m('escada', 0, 7, { t: '@0' })] }] };
    const p = problemasDoPlano(resp, [cena('scene-4', 8)]);
    aplicarAjustes(resp, p, [{ cena: 'scene-4', k: 0, momentos: [m('ciclo', 4, 6), m('escada', 1, 3)] }]);
    expect(resp.cenas[0].momentos.map((x) => [x.tpl, ...x.frases])).toEqual([['escada', 0, 3], ['ciclo', 4, 7]]);
  });

  it('para depois de 2 rodadas', () => {
    const resp = base();
    expect(cabeAjuste(resp)).toBe(true);
    resp.ajustes_n = 2;
    expect(cabeAjuste(resp)).toBe(false);
  });

  it('o pedido de ajuste lista os modelos proibidos e só as cenas com problema', () => {
    const resp = base(), p = problemasDoPlano(resp, cenas);
    const txt = pedidoDeAjuste(resp, [...cenas, cena('scene-9', 2)], p, 'Casa de boliche');
    expect(txt).toContain('CONTEXT of the video (company, workplace, role): Casa de boliche');
    expect(txt).toContain('(forbidden here): ["balanca","caderno"]');
    expect(txt).not.toContain('scene-9');
  });
});

describe('montarMomentos: das âncoras aos segundos do momento', () => {
  it('resolve "@k", "@k$" e deslocamentos no tempo LOCAL do momento', () => {
    const c = cena('scene-2', 4);   // frases em 0, 3,5, 7, 10,5 s
    expect(segundosDaAncora('@2+0.4', c.frases)).toBeCloseTo(7.4);
    expect(segundosDaAncora('@1$', c.frases)).toBeCloseTo(6.5);
    expect(segundosDaAncora('@9', c.frases)).toBeNull();
    const resp: RespostaPlano = { cenas: [{ id: 'scene-2', momentos: [m('fluxo', 0, 1, { t: '@0+0.3' }), m('balanca', 2, 3, { t: '@2+0.5', tPesa: '@3$' })] }] };
    const { momentos } = montarMomentos(resp, [c]);
    expect(momentos.map((x) => x.id)).toEqual(['s2-1-fluxo', 's2-2-balanca']);
    // o 2º momento começa no meio da pausa antes da frase 2: (6,5 + 7) / 2 = 6,75
    expect(momentos[1].dur).toBeCloseTo(14.5 - 6.75);
    expect(momentos[1].data.t).toBeCloseTo(7.5 - 6.75);
    // ação final presa a dur − 1,9 (a frase 3 termina em 13,5 → 6,75 local, acima do teto de 5,85)
    expect(momentos[1].data.tPesa).toBeCloseTo(momentos[1].dur - 1.9, 2);
  });

  it('os tetos de tempo: ações finais 1,9 s antes do fim, elementos curtos 1,3 s, o resto 0,7 s', () => {
    expect(tetoDeTempo('s2-1-escada.tSobe', 10)).toBeCloseTo(8.1);
    expect(tetoDeTempo('s2-1-quadro.cartoes[2].t', 10)).toBeCloseTo(8.7);
    expect(tetoDeTempo('s2-1-pergunta.escolha.t', 10)).toBeCloseTo(8.7);
    expect(tetoDeTempo('s2-1-ciclo.etapas[1].t', 10)).toBeCloseTo(9.3);
  });

  it('`sob_medida`, modelo fora do catálogo e a 3ª imagem viram `frase`; a imagem vai para navy e pede ilustração', () => {
    const cenas = [cena('scene-2', 6), cena('scene-3', 4)];
    const img = (a: number, b: number) => m('imagem', a, b, { lado: 'cheia', imagem: { estilo: 'ilustracao', descricao: 'a bowling alley' } }, 'claro');
    const resp: RespostaPlano = { cenas: [
      { id: 'scene-2', momentos: [img(0, 1), m('sob_medida', 2, 3, { telas: ['Ideia'] }), m('vago_preciso', 4, 5)] },
      { id: 'scene-3', momentos: [img(0, 1), img(2, 3)] },
    ] };
    const r = montarMomentos(resp, cenas);
    expect(r.momentos.map((x) => x.tpl)).toEqual(['imagem', 'frase', 'frase', 'imagem', 'frase']);
    expect(r.momentos[1].data.texto).toBe('Ideia');
    expect(r.momentos[0].fundo).toBe('navy');
    expect(r.imagens).toEqual([
      { momento: 's2-1-imagem', nome: 's2-1-imagem.png', descricao: 'a bowling alley', lado: 'cheia' },
      { momento: 's3-1-imagem', nome: 's3-1-imagem.png', descricao: 'a bowling alley', lado: 'cheia' },
    ]);
    expect(r.momentos[0].data.arquivo).toBe('s2-1-imagem.png');
    expect(r.momentos[0].data.imagem).toBeUndefined();
  });

  it('encadeia os momentos: buraco ou sobreposição nas frases é corrigido e avisado', () => {
    const resp: RespostaPlano = { cenas: [{ id: 'scene-2', momentos: [m('fluxo', 0, 1), m('balanca', 3, 4)] }] };
    const r = montarMomentos(resp, [cena('scene-2', 6)]);
    expect(r.momentos.map((x) => x.frases)).toEqual([[0, 1], [2, 5]]);
    expect(r.avisos.join(' ')).toMatch(/começava na frase 3, ajustado para 2/);
    expect(r.avisos.join(' ')).toMatch(/terminava na frase 4, ajustado para 5/);
  });

  it('acusa o texto acima do teto do catálogo (sem cortar: o modelo encolhe a letra)', () => {
    const resp: RespostaPlano = { cenas: [{ id: 'scene-2', momentos: [m('balanca', 0, 3, { t: '@0', esq: 'um lado comprido demais', dir: 'outro' })] }] };
    const r = montarMomentos(resp, [cena('scene-2', 4)]);
    expect(r.excessos).toEqual(['s2-1-balanca esq: 23/16 "um lado comprido demais"']);
    expect(r.momentos[0].data.esq).toBe('um lado comprido demais');
  });
});

describe('o catálogo da v7', () => {
  it('oferece 23 modelos, a imagem e a frase, sem `sob_medida` e sem `vago_preciso`', () => {
    expect(MODELOS_CATALOGO_V7).toHaveLength(25);
    expect(MODELOS_CATALOGO_V7).toEqual(expect.arrayContaining(['imagem', 'frase', 'escada', 'medidor', 'rede', 'pergunta']));
    expect(CATALOGO_V7).not.toMatch(/sob_medida/);
    expect(CATALOGO_V7).toMatch(/NEVER REPEAT A TEMPLATE/);
  });
});
