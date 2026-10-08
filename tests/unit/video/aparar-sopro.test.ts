import { describe, it, expect } from 'vitest';
import { APARO, analisarSopro, energiaPorJanelaDb, pcmSemOComeco } from '@/lib/video/aparar-sopro';

/**
 * A régua que decide se a HeyGen recebe o áudio inteiro ou aparado. Os perfis abaixo são as 12 primeiras janelas de 50 ms
 * (dBFS) MEDIDAS em áudios reais de 08/10/2026 (Boehringer, `scripts/_avatar-aparar-boeh.ts`), com a decisão que a
 * receita validada de ouvido pelo dono (06/10) tomou sobre cada um. O teste prova que o módulo de produção repete o
 * instrumento, não que a conta está "plausível".
 */

const RATE = 24000;
const JANELA = Math.round(RATE * APARO.janelaS);

/** PCM 16-bit mono: cada janela de 50 ms é uma onda quadrada de RMS = `db`. Depois do perfil, fala a −20 dB. */
function pcmDePerfil(perfilDb: number[], totalS = 3): Buffer {
  const janelas = Math.round(totalS / APARO.janelaS);
  const b = Buffer.alloc(janelas * JANELA * 2);
  for (let j = 0; j < janelas; j++) {
    const db = j < perfilDb.length ? perfilDb[j] : -20;
    const amp = Math.round(32768 * 10 ** (db / 20));
    for (let k = 0; k < JANELA; k++) b.writeInt16LE(k % 2 ? -amp : amp, (j * JANELA + k) * 2);
  }
  return b;
}

describe('analisarSopro nos áudios reais da Boehringer', () => {
  it('fecho da e405782d: sopro de −50 dB, fala em 0,40 s → apara 8 quadros', () => {
    const a = analisarSopro(pcmDePerfil([-76, -52, -55, -52, -52, -54, -50, -72, -28, -21, -26, -31]), RATE);
    expect(a.fala).toBe(true);
    expect(a.inicioS).toBeCloseTo(0.4, 5);
    expect(Math.round(a.picoAntesDb!)).toBe(-50);
    expect(a.sopro).toBe(true);
    expect(a.quadros).toBe(8);
    expect(a.aplicar).toBe(true);
  });

  it.each([
    ['abertura da e405782d (pico −63 dB, fala em 0,25 s)', [-93, -63, -63, -64, -64, -36, -20, -17, -36, -39, -16, -23]],
    ['abertura da 5b7ae86b (pico −57 dB)', [-59, -58, -62, -57, -51, -22, -12, -12, -20, -22, -17, -14]],
    ['fecho da 5b7ae86b (pico −56 dB, a 1 dB do limiar)', [-113, -58, -61, -62, -56, -63, -15, -16, -19, -20, -37, -39]],
    ['fecho da db7fc0f3 (pico −60 dB)', [-97, -60, -66, -67, -66, -66, -20, -11, -16, -16, -20, -33]],
  ])('%s: limpo, NÃO toca', (_n, perfil) => {
    const a = analisarSopro(pcmDePerfil(perfil), RATE);
    expect(a.fala).toBe(true);
    expect(a.sopro).toBe(false);
    expect(a.aplicar).toBe(false);
  });
});

describe('os limites da régua', () => {
  // Onda quadrada: RMS = amplitude. −55 dBFS = amplitude 58,27: 58 fica logo abaixo e 59 logo acima.
  const comPico = (amp: number) => {
    const b = pcmDePerfil([-90, -90, -90, -90, -90, -90, -90, -90, -20]);
    for (let j = 2; j <= 5; j++) for (let k = 0; k < JANELA; k++) b.writeInt16LE(k % 2 ? -amp : amp, (j * JANELA + k) * 2);
    return b;
  };
  it('o limiar de sopro é ESTRITO: −55,04 dB não é sopro, −54,89 dB é', () => {
    expect(analisarSopro(comPico(58), RATE).sopro).toBe(false);
    expect(analisarSopro(comPico(59), RATE).sopro).toBe(true);
  });

  it('corte de menos de 3 quadros é ruído de medida: há sopro mas não aplica', () => {
    // Fala em 0,20 s com sopro antes: floor((0,20 − 0,12) × 30) = 2 quadros.
    const a = analisarSopro(pcmDePerfil([-90, -50, -50, -90, -20]), RATE);
    expect(a.sopro).toBe(true);
    expect(a.quadros).toBe(2);
    expect(a.aplicar).toBe(false);
  });

  it('sem fala nos primeiros 1,6 s (silêncio ou ruído baixo): não aplica e diz que não achou fala', () => {
    const a = analisarSopro(pcmDePerfil(Array(40).fill(-60)), RATE);
    expect(a.fala).toBe(false);
    expect(a.inicioS).toBeNull();
    expect(a.aplicar).toBe(false);
  });

  it('a fala no instante zero (sem sopro possível) não aplica e não lança com a lista de "antes" vazia', () => {
    const a = analisarSopro(pcmDePerfil([-20, -20, -20]), RATE);
    expect(a.fala).toBe(true);
    expect(a.picoAntesDb).toBe(-120);
    expect(a.aplicar).toBe(false);
  });

  it('só olha os primeiros 1,6 s: sopro depois disso é fala/pausa normal e não conta', () => {
    const perfil = [...Array(33).fill(-90), -50, -50, -20]; // 1,65 s de silêncio e só então o "sopro"
    expect(energiaPorJanelaDb(pcmDePerfil(perfil), RATE)).toHaveLength(32);
    expect(analisarSopro(pcmDePerfil(perfil), RATE).fala).toBe(false);
  });

  it('PCM vazio ou mais curto que uma janela não quebra', () => {
    expect(analisarSopro(Buffer.alloc(0), RATE).aplicar).toBe(false);
    expect(analisarSopro(Buffer.alloc(100), RATE).aplicar).toBe(false);
  });

  it('a medida independe da taxa de amostragem: o mesmo perfil dá a mesma decisão a 16 kHz e a 24 kHz', () => {
    const perfil = [-76, -52, -55, -52, -52, -54, -50, -72, -28, -21, -26, -31];
    const a24 = analisarSopro(pcmDePerfil(perfil), 24000);
    const j16 = Math.round(16000 * APARO.janelaS);
    const b = Buffer.alloc(60 * j16 * 2);
    for (let j = 0; j < 60; j++) { const amp = Math.round(32768 * 10 ** ((j < perfil.length ? perfil[j] : -20) / 20)); for (let k = 0; k < j16; k++) b.writeInt16LE(k % 2 ? -amp : amp, (j * j16 + k) * 2); }
    const a16 = analisarSopro(b, 16000);
    expect(a16.quadros).toBe(a24.quadros);
    expect(a16.aplicar).toBe(a24.aplicar);
  });
});

describe('pcmSemOComeco', () => {
  it('tira exatamente os quadros pedidos: 8 quadros a 30 fps = 0,2667 s = 6.400 amostras a 24 kHz', () => {
    const pcm = Buffer.alloc(24000 * 2 * 2); // 2 s
    const r = pcmSemOComeco(pcm, 24000, 8);
    expect(r.length).toBe(pcm.length - 6400 * 2);
  });
  it('a fala preservada é a do ponto certo, sem deslocar amostras', () => {
    const pcm = Buffer.alloc(100 * 2);
    for (let i = 0; i < 100; i++) pcm.writeInt16LE(i, i * 2);
    const r = pcmSemOComeco(pcm, 30, 30); // 30 quadros a 30 fps = 1 s = 30 amostras a 30 Hz
    expect(r.readInt16LE(0)).toBe(30);
    expect(r.length).toBe(70 * 2);
  });
  it('pedir mais que o áudio devolve vazio, não lança', () => {
    expect(pcmSemOComeco(Buffer.alloc(10), 24000, 30).length).toBe(0);
  });
});
