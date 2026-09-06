/**
 * Alinhamento cena × transcrição (lib/video/narracao-unica.ts). Os casos plantam o
 * que o Whisper faz na prática: erra uma palavra, some com um número, ouve a 1ª
 * palavra errada — e exigem fronteira certa OU recusa explícita (null), nunca um
 * corte no lugar errado em silêncio.
 */
import { describe, it, expect } from 'vitest';
import { alinharCenas, montarTextoUnico, fatiarPcm16 } from '@/lib/video/narracao-unica';
import type { WordTime } from '@/lib/video/whisper-align';

/** Transcrição sintética: cada palavra dura 0,3 s; entre cenas, pausa de 0,8 s. */
function transcrever(cenas: string[][], pausa = 0.8): WordTime[] {
  const out: WordTime[] = []; let t = 0.5;
  for (const c of cenas) {
    for (const w of c) { out.push({ word: w, start: t, end: t + 0.3 }); t += 0.35; }
    t += pausa;
  }
  return out;
}

describe('narração única: alinhamento de cenas', () => {
  const cenas = [
    { id: 'scene-1', narration: 'Você já teve aquela sensação de que a aula estava indo bem?' },
    { id: 'scene-2', narration: 'Ritmo não é velocidade. É a sensação de que cada parte da aula tem um lugar.' },
    { id: 'scene-3', narration: 'Então, o que você vai observar na sua próxima aula?' },
  ];

  it('casa cenas limpas e corta no meio da pausa entre elas', () => {
    const words = transcrever(cenas.map((c) => c.narration.split(' ')));
    const f = alinharCenas(words, cenas)!;
    expect(f).not.toBeNull();
    expect(f.map((x) => x.id)).toEqual(['scene-1', 'scene-2', 'scene-3']);
    for (let i = 1; i < f.length; i++) expect(f[i].inicio).toBeGreaterThanOrEqual(f[i - 1].fim - 1e-6);
    // a cabeça encosta na 1ª palavra (0,12 s antes) e as palavras ficam relativas à fatia
    expect(f[1].words[0].word).toBe('Ritmo');
    expect(f[1].words[0].start).toBeCloseTo(0.12, 2);
    expect(f[0].casadas).toBe(f[0].total);
  });

  it('tolera o ASR errar palavras (substituição e omissão) e ainda acha a fronteira', () => {
    const t = cenas.map((c) => c.narration.split(' '));
    t[1][2] = 'nao'; t[1].splice(5, 1); // "é" ouvido como "nao", "sensação" sumiu
    const words = transcrever(t);
    const f = alinharCenas(words, cenas)!;
    expect(f).not.toBeNull();
    expect(f[1].casadas).toBeGreaterThanOrEqual(Math.ceil(f[1].total * 0.6));
    expect(f[2].words[0].word).toBe('Então,');
  });

  it('se o ASR erra a PRIMEIRA palavra da cena, a fatia começa na fronteira (não corta a palavra)', () => {
    const t = cenas.map((c) => c.narration.split(' '));
    t[2][0] = 'entao?'; // token diferente de "então" normalizado? não: "entao" == "entao" → força um erro real
    t[2][0] = 'xxx';
    const words = transcrever(t);
    const f = alinharCenas(words, cenas)!;
    expect(f).not.toBeNull();
    const primeiraPalavraReal = words.find((w) => w.word === 'xxx')!;
    expect(f[2].inicio).toBeLessThan(primeiraPalavraReal.start); // a palavra não ouvida fica DENTRO da fatia
    expect(f[2].words[0].word).toBe('xxx');
  });

  it('recusa (null) quando uma cena casa menos de 60 % — nunca corta no chute', () => {
    const t = cenas.map((c) => c.narration.split(' '));
    t[1] = ['blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá', 'blá'];
    expect(alinharCenas(transcrever(t), cenas)).toBeNull();
  });

  it('recusa quando as cenas do roteiro vêm em ordem diferente da fala', () => {
    const words = transcrever([cenas[1].narration.split(' '), cenas[0].narration.split(' '), cenas[2].narration.split(' ')]);
    expect(alinharCenas(words, cenas)).toBeNull();
  });

  it('hífen no roteiro ("Segunda-feira") e ASR em duas palavras: casa e corta na pausa entre as cenas', () => {
    // Medido 06/09 (vídeo 10e50d4a): o token colado "segundafeira" não casava com
    // "Segunda" + "feira", a 1ª palavra da cena 2 ficava sem dono e o corte caía
    // DENTRO dela ("...prática. Segun|feira, terceira aula").
    const c2 = [
      { id: 'scene-1', narration: 'Você vai ver a diferença na prática.' },
      { id: 'scene-2', narration: 'Segunda-feira, terceira aula. Você abre a mesma apresentação.' },
    ];
    const words = transcrever([c2[0].narration.split(' '), ['Segunda', 'feira,', 'terceira', 'aula.', 'Você', 'abre', 'a', 'mesma', 'apresentação.']]);
    const f = alinharCenas(words, c2)!;
    expect(f).not.toBeNull();
    expect(f[1].casadas).toBe(f[1].total);
    expect(f[1].words[0].word).toBe('Segunda');
    expect(f[0].words.at(-1)!.word).toBe('prática.');
    const segunda = words.find((w) => w.word === 'Segunda')!;
    expect(f[0].fim).toBeLessThan(segunda.start);
    expect(f[1].inicio).toBeLessThanOrEqual(segunda.start);
  });

  it('ASR devolve o hífen colado ("Segunda-feira") e o roteiro também: continua casando', () => {
    const c2 = [
      { id: 'scene-1', narration: 'Você vai ver a diferença na prática.' },
      { id: 'scene-2', narration: 'Segunda-feira, terceira aula. Você abre a mesma apresentação.' },
    ];
    const words = transcrever([c2[0].narration.split(' '), ['Segunda-feira,', 'terceira', 'aula.', 'Você', 'abre', 'a', 'mesma', 'apresentação.']]);
    const f = alinharCenas(words, c2)!;
    expect(f).not.toBeNull();
    expect(f[1].casadas).toBe(f[1].total);
    expect(f[1].words[0].word).toBe('Segunda');
  });

  it('palavra de borda que o ASR errou fica do lado certo: a fronteira é a MAIOR pausa entre as cenas', () => {
    // 1ª palavra da cena 3 ouvida errada ("xxx"): a pausa longa (0,8 s) fica ANTES
    // dela, e a curta (0,05 s) entre ela e a 2ª palavra. O corte tem que cair na longa.
    const t = cenas.map((c) => c.narration.split(' '));
    t[2][0] = 'xxx';
    const words = transcrever(t);
    const f = alinharCenas(words, cenas)!;
    const xxx = words.find((w) => w.word === 'xxx')!;
    const ultimaCena2 = words[words.indexOf(xxx) - 1];
    expect(f[1].fim).toBeGreaterThan(ultimaCena2.end);
    expect(f[1].fim).toBeLessThan(xxx.start);
    expect(f[2].inicio).toBeCloseTo((ultimaCena2.end + xxx.start) / 2, 5);
  });

  it('texto único separa cenas por parágrafo duplo e fatiarPcm16 respeita os limites', () => {
    expect(montarTextoUnico(cenas).split('\n\n')).toHaveLength(3);
    const pcm = Buffer.alloc(24000 * 2 * 10); // 10 s
    const fatia = fatiarPcm16(pcm, 24000, 2.5, 4.0);
    expect(fatia.length).toBe(Math.ceil(1.5 * 24000) * 2);
    expect(fatiarPcm16(pcm, 24000, 9.5, 12).length).toBe(24000); // clampa no fim
  });
});
