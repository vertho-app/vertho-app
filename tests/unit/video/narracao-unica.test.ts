/**
 * Alinhamento cena × transcrição (lib/video/narracao-unica.ts). Os casos plantam o
 * que o Whisper faz na prática: erra uma palavra, some com um número, ouve a 1ª
 * palavra errada — e exigem fronteira certa OU recusa explícita (null), nunca um
 * corte no lugar errado em silêncio.
 */
import { describe, it, expect } from 'vitest';
import { alinharCenas, montarTextoUnico, fatiarPcm16, validarFatias, planejarNarracaoUnica, garantirCabecaSilenciosa, CABECA_SILENCIO_PAD_S } from '@/lib/video/narracao-unica';
import type { FatiaCena } from '@/lib/video/narracao-unica';
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
    // sem PCM o corte é o meio da pausa e as fatias são contíguas: a 1ª palavra
    // fica a meia pausa do início da fatia, e as palavras são relativas à fatia
    expect(f[1].words[0].word).toBe('Ritmo');
    expect(f[1].words[0].start).toBeCloseTo(0.425, 2); // (0,05 + 0,8) / 2
    expect(f[1].inicio).toBeCloseTo(f[0].fim, 6);
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

/** PCM sintético a partir das palavras: tom de 440 Hz durante cada palavra, silêncio fora. */
function sintetizar(words: WordTime[], duracaoS: number, sr = 24000): Buffer {
  const pcm = Buffer.alloc(Math.ceil(duracaoS * sr) * 2);
  for (const w of words) {
    for (let i = Math.floor(w.start * sr); i < Math.min(pcm.length / 2, Math.ceil(w.end * sr)); i++) {
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 0.3 * 32767), i * 2);
    }
  }
  return pcm;
}

describe('narração única: QA das fatias (roteiro + áudio) e roteamento de recusa', () => {
  const cenas = [
    { id: 'scene-1', narration: 'Você vai ver a diferença na prática.' },
    { id: 'scene-2', narration: 'Segunda-feira, terceira aula. Você abre a mesma apresentação.' },
    { id: 'scene-3', narration: 'Então, o que você vai observar na sua próxima aula?' },
  ];
  const palavra = (word: string, start: number) => ({ word, start, end: start + 0.3 });

  it('acusa a fatia que TERMINA com a palavra que abre a cena seguinte (o "Segun|feira" de 06/09)', () => {
    const fatias: FatiaCena[] = [
      { id: 'scene-1', inicio: 0, fim: 3.2, casadas: 7, total: 7,
        words: ['Você', 'vai', 'ver', 'a', 'diferença', 'na', 'prática.', 'Segunda'].map((w, i) => palavra(w, i * 0.4)) },
      { id: 'scene-2', inicio: 3.2, fim: 6, casadas: 8, total: 9,
        words: ['feira,', 'terceira', 'aula.', 'Você', 'abre', 'a', 'mesma', 'apresentação.'].map((w, i) => palavra(w, i * 0.35)) },
    ];
    const avisos = validarFatias(fatias, cenas.slice(0, 2));
    expect(avisos).toHaveLength(1);
    expect(avisos[0].id).toBe('scene-1');
    expect(avisos[0].motivo).toContain('Segunda');
  });

  it('acusa a fatia que COMEÇA com a palavra que fecha a cena anterior, e não acusa palavra que a própria cena tem', () => {
    const fatias: FatiaCena[] = [
      { id: 'scene-1', inicio: 0, fim: 2.5, casadas: 6, total: 7,
        words: ['Você', 'vai', 'ver', 'a', 'diferença', 'na'].map((w, i) => palavra(w, i * 0.4)) },
      { id: 'scene-2', inicio: 2.5, fim: 6, casadas: 9, total: 9,
        words: ['prática.', 'Segunda', 'feira,', 'terceira', 'aula.', 'Você', 'abre', 'a', 'mesma', 'apresentação.'].map((w, i) => palavra(w, i * 0.35)) },
    ];
    const avisos = validarFatias(fatias, cenas.slice(0, 2));
    expect(avisos.map((a) => a.id)).toEqual(['scene-2']);
    expect(avisos[0].motivo).toContain('prática');
    // "Você" existe nas duas cenas: começar com ela NÃO é vazamento
    const limpa: FatiaCena[] = [fatias[0], { ...fatias[1], words: fatias[1].words.slice(5) }];
    expect(validarFatias(limpa, cenas.slice(0, 2))).toEqual([]);
  });

  it('corte no silêncio passa; corte no meio de uma palavra (sem pausa) é acusado pela energia', () => {
    const words = transcrever(cenas.map((c) => c.narration.split(' ')));
    const fatias = alinharCenas(words, cenas)!;
    const total = words[words.length - 1].end + 0.5;
    const pcm = sintetizar(words, total);
    expect(validarFatias(fatias, cenas, pcm, 24000)).toEqual([]);
    // força a fronteira 1→2 para dentro da 2ª palavra da cena 2
    const dentro = words[words.findIndex((w) => w.word === 'Segunda-feira,') + 1]; // "terceira"
    const quebrada: FatiaCena[] = [
      { ...fatias[0], fim: dentro.start + 0.15 },
      { ...fatias[1], inicio: dentro.start + 0.15 },
      fatias[2],
    ];
    const avisos = validarFatias(quebrada, cenas, pcm, 24000);
    expect(avisos.some((a) => a.id === 'scene-2' && a.motivo.includes('sem pausa'))).toBe(true);
  });

  it('com o PCM, o corte vai para o silêncio da pausa mesmo quando o Whisper marca o início da palavra atrasado', () => {
    // Medido 06/09: energia de fala já 120 ms antes do `start` do Whisper em 5 de 8
    // cenas. Simula: o som da 1ª palavra da cena 2 começa 0,5 s ANTES do timestamp,
    // então o meio geométrico da pausa (0,425 s antes do start) cai DENTRO do som.
    // O corte tem que ir para o silêncio real, entre a palavra anterior e o som.
    const words = transcrever(cenas.map((c) => c.narration.split(' ')));
    const total = words[words.length - 1].end + 0.5;
    const idx = words.findIndex((w) => w.word === 'Segunda-feira,');
    const som = words.map((w, i) => (i === idx ? { ...w, start: w.start - 0.5 } : w));
    const pcm = sintetizar(som, total);
    const f = alinharCenas(words, cenas, total, pcm, 24000)!;
    expect(f[1].inicio).toBeLessThan(som[idx].start - 0.04);
    expect(f[1].inicio).toBeGreaterThan(words[idx - 1].end);
    expect(validarFatias(f, cenas, pcm, 24000)).toEqual([]);
  });

  it('cabeça de silêncio: fala no instante zero ganha 150 ms de silêncio na frente; fala que já começa depois de 100 ms fica como está', () => {
    // A composição pula o 1º quadro do áudio (33 ms): a fala não pode começar em t=0.
    const comFalaNoZero = sintetizar([{ word: 'x', start: 0, end: 1 }, { word: 'y', start: 1.3, end: 2 }], 2.5);
    const g = garantirCabecaSilenciosa(comFalaNoZero, 24000);
    expect(g.deslocamentoS).toBeCloseTo(CABECA_SILENCIO_PAD_S, 6);
    expect(g.pcm.length).toBe(comFalaNoZero.length + Math.round(CABECA_SILENCIO_PAD_S * 24000) * 2);
    // os primeiros 100 ms do resultado são silêncio
    expect(g.pcm.subarray(0, 4800).every((b) => b === 0)).toBe(true);
    const comRespiro = sintetizar([{ word: 'x', start: 0.2, end: 1.2 }, { word: 'y', start: 1.5, end: 2.2 }], 2.5);
    expect(garantirCabecaSilenciosa(comRespiro, 24000).deslocamentoS).toBe(0);
  });

  it('planejarNarracaoUnica: recusa com motivo quando o alinhamento falha e quando a fronteira é suspeita; aprova o caso limpo', () => {
    const words = transcrever(cenas.map((c) => c.narration.split(' ')));
    const total = words[words.length - 1].end + 0.5;
    const limpo = planejarNarracaoUnica(words, cenas, total, sintetizar(words, total), 24000);
    expect(limpo.ok).toBe(true);
    expect(limpo.fatias!.map((f) => f.id)).toEqual(['scene-1', 'scene-2', 'scene-3']);

    const fora = transcrever([cenas[1].narration.split(' '), cenas[0].narration.split(' '), cenas[2].narration.split(' ')]);
    const r1 = planejarNarracaoUnica(fora, cenas);
    expect(r1.ok).toBe(false);
    expect(r1.motivo).toContain('alinhamento');

    // áudio que NÃO para entre as cenas (tom contínuo): toda fronteira cai sem pausa
    const continuo = sintetizar([{ word: 'x', start: 0, end: total }], total);
    const r2 = planejarNarracaoUnica(words, cenas, total, continuo, 24000);
    expect(r2.ok).toBe(false);
    expect(r2.motivo).toContain('fronteira suspeita');
  });
});
