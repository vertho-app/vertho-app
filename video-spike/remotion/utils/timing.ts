import { Easing, interpolate, spring } from 'remotion';

// Easing "premium" (saída suave tipo expo) usado nas entradas.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** Progresso 0→1 de uma entrada que começa em `delay` e dura `dur` frames. */
export function reveal(frame: number, delay = 0, dur = 18): number {
  return interpolate(frame, [delay, delay + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  });
}

/** Opacidade com fade-in no começo e fade-out no fim de um trecho de `total` frames. */
export function fadeInOut(frame: number, total: number, fin = 12, fout = 14): number {
  return interpolate(frame, [0, fin, Math.max(fin + 1, total - fout), total], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

/** Spring de entrada (escala/translação) com leve overshoot controlado. */
export function springIn(frame: number, fps: number, delay = 0, damping = 18): number {
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7, stiffness: 120 } });
}

/** Translação Y a partir do progresso (px). */
export function translateUp(p: number, dist = 34): string {
  return `translateY(${(1 - p) * dist}px)`;
}

/**
 * Delay (frame) de entrada do item `i` de `n`, DISTRIBUÍDO ao longo da cena (de
 * `startFrac` a `endFrac` da duração) — aproxima o ritmo da NARRAÇÃO em vez de
 * tudo entrar de uma vez no começo. Os itens terminam de entrar antes do fim
 * (sobra um hold). Use no lugar de `FIRST + i*STEP` para sincronizar com a fala.
 */
export function staggerDelay(total: number, i: number, n: number, startFrac = 0.08, endFrac = 0.72): number {
  const start = total * startFrac;
  if (n <= 1) return Math.round(start);
  const end = Math.max(start, total * endFrac);
  return Math.round(start + (i / (n - 1)) * (end - start));
}
