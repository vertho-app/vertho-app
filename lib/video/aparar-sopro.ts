/**
 * SOPRO antes da fala no mp3 que vai à HeyGen: o que desalinha a boca do avatar no fecho.
 *
 * O PROBLEMA (medido em 05-07/10/2026)
 * O `avatar_iii` faz lip-sync do NOSSO mp3 e é DETERMINÍSTICO (mesmo áudio + mesma foto = mesmo vídeo, SSIM 1,000):
 * sortear de novo não conserta um clipe com a boca fora do tempo, só mudar a ENTRADA muda a saída. Num fecho de
 * take único (cena 9 da ACME) o áudio da fatia abria com um sopro de ~−50 dB entre 0,1 e 0,4 s e a fala em 0,45 s;
 * a abertura limpa (−64 a −68 dB, fala em 0,30 s) saía no tempo. Deslocar o vídeo em quadros só dava "o menos
 * pior" (3 rodadas cegas, nunca "perfeito"): atraso que não é constante não se corrige com deslocamento constante.
 * O que o dono aprovou de ouvido, na grade cega: APARAR o começo do áudio enviado e repor, no clipe devolvido, os
 * mesmos quadros parados no início, para o clipe voltar a casar com o mp3 original da composição.
 *
 * A RÉGUA (a mesma de `scripts/_avatar-aparar.ts`, validada em ACME, Escolas S1/S2/S3 e Boehringer)
 *  · início da fala = 1ª janela de 50 ms acima de −38 dBFS. Pela ENERGIA do próprio áudio, não pelo timestamp do
 *    Whisper, que marca ~220 ms tarde (cortar por ele come o ataque da 1ª palavra);
 *  · sopro = energia acima de −55 dBFS entre 0,05 s e (início − 0,06 s). Abertura limpa (−57 a −69 dB) não é tocada;
 *  · corte = (início − 0,12 s) em quadros de 30 fps, para baixo: sobra ~0,12 s de respiro antes da voz;
 *  · só vale se o corte tiver ao menos 3 quadros (menos que isso é ruído de medida, não atraso audível).
 *
 * Puro: sem rede e sem ffmpeg. Quem corta, sobe e repõe os quadros é `trigger/gerar-video-modulo.ts`.
 */

export const APARO = {
  fps: 30,
  /** Janela da medida de energia (s). */
  janelaS: 0.05,
  /** Só os primeiros segundos importam: o sopro está antes da 1ª palavra. */
  analiseS: 1.6,
  limiarFalaDb: -38,
  limiarSoproDb: -55,
  respiroS: 0.12,
  minQuadros: 3,
} as const;

/** Energia (dBFS, RMS) de cada janela de 50 ms nos primeiros `durS` segundos de um PCM 16-bit mono. */
export function energiaPorJanelaDb(pcm: Buffer, sampleRate: number, durS: number = APARO.analiseS): number[] {
  const w = Math.round(sampleRate * APARO.janelaS);
  const limite = Math.min(pcm.length >> 1, Math.round(sampleRate * durS));
  const out: number[] = [];
  for (let i = 0; i + w <= limite; i += w) {
    let soma = 0;
    for (let k = 0; k < w; k++) { const v = pcm.readInt16LE((i + k) * 2) / 32768; soma += v * v; }
    out.push(20 * Math.log10(Math.sqrt(soma / w) + 1e-9));
  }
  return out;
}

export interface AnaliseSopro {
  /** Achou fala (energia acima do limiar) nos primeiros segundos? */
  fala: boolean;
  /** Onde a fala começa, em segundos (null sem fala). */
  inicioS: number | null;
  /** Maior energia entre 0,05 s e (início − 0,06 s), em dBFS (null sem fala). */
  picoAntesDb: number | null;
  sopro: boolean;
  /** Quadros a aparar do começo (pode ser negativo ou zero quando a fala abre cedo; só vale com `aplicar`). */
  quadros: number;
  /** Há sopro E o corte tem quadros suficientes: é este o veredito. */
  aplicar: boolean;
}

export function analisarSopro(pcm: Buffer, sampleRate: number): AnaliseSopro {
  const db = energiaPorJanelaDb(pcm, sampleRate);
  const j = db.findIndex((x) => x > APARO.limiarFalaDb);
  if (j < 0) return { fala: false, inicioS: null, picoAntesDb: null, sopro: false, quadros: 0, aplicar: false };
  const inicioS = j * APARO.janelaS;
  // Da 2ª janela (0,05 s) até ~0,06 s antes da fala: a 1ª janela e o miolo colado na fala ficam de fora de propósito.
  const antes = db.slice(1, Math.max(1, j - 1));
  const picoAntesDb = antes.length ? Math.max(...antes) : -120;
  const sopro = picoAntesDb > APARO.limiarSoproDb;
  const quadros = Math.floor((inicioS - APARO.respiroS) * APARO.fps);
  return { fala: true, inicioS, picoAntesDb, sopro, quadros, aplicar: sopro && quadros >= APARO.minQuadros };
}

/** O PCM sem os primeiros `quadros` quadros de vídeo (a duração é a dos quadros, não a da amostra: 30 fps). */
export function pcmSemOComeco(pcm: Buffer, sampleRate: number, quadros: number): Buffer {
  const amostras = Math.round((quadros / APARO.fps) * sampleRate);
  return pcm.subarray(Math.min(pcm.length, amostras * 2));
}
