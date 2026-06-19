import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, cueDelay } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, INK_DIM, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/**
 * Régua de maturidade (construto-núcleo Vertho, N1→N4): degraus ASCENDENTES da
 * esquerda p/ direita, o degrau-meta acende em ciano com rótulo "META". Difere de
 * steps_flow: aqui são ESTADOS de maturidade, não passos de um método.
 *
 * Layout: os degraus assentam numa linha-base; os RÓTULOS vivem numa faixa
 * separada ABAIXO da base (com respiro) — nunca colados na linha. O selo "META"
 * é posicionado de forma ABSOLUTA acima do degrau-alvo, sem alterar a geometria
 * (degraus continuam com a base alinhada).
 */
export const MaturityLadderV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const rungs = (scene.rungs || []).slice(0, 5);
  const n = Math.max(1, rungs.length);
  const target = Math.min(n - 1, Math.max(0, scene.target ?? n - 1));
  const title = reveal(frame, 8, 24);

  const cue = (i: number) => cueDelay(durationInFrames, i, n, scene.speechStartFrame, scene.speechEndFrame);
  const firstD = cue(0);
  const lastD = cue(n - 1);
  const railP = interpolate(frame, [firstD, lastD + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const minH = 116, maxH = 336;
  const BARS_H = maxH + 64;          // folga acima do degrau-meta p/ o selo "META"
  const colW = `${100 / n - 3}%`;

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 150px', opacity: out }}>
        <div style={{ opacity: title }}>
          <EyebrowV2 brand={brand}>Régua de maturidade</EyebrowV2>
          <h1 style={{ margin: '20px 0 72px', color: INK, fontSize: 76, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, transform: translateUp(title, 30) }}>{scene.title}</h1>
        </div>

        {/* área dos degraus — base assenta na linha (bottom 0 desta área) */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: BARS_H }}>
          {/* linha-base que se desenha sob os degraus */}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: withAlpha('#ffffff', 0.08) }} />
          <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${railP * 100}%`, background: brand.primary, boxShadow: `0 0 14px ${withAlpha(brand.primary, 0.5)}` }} />

          {rungs.map((r, i) => {
            const d = cue(i);
            const p = reveal(frame, d, 22);
            const h = minH + (maxH - minH) * (n === 1 ? 1 : i / (n - 1));
            const isTarget = i === target;
            const labelP = reveal(frame, d + 8, 16);
            return (
              <div key={i} style={{ position: 'relative', width: colW, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity: p, transform: `translateY(${(1 - p) * 22}px)` }}>
                {isTarget && (
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: h + 16, textAlign: 'center', color: ACCENT_SOFT, fontSize: 23, fontWeight: 800, letterSpacing: 5, opacity: labelP }}>META</span>
                )}
                <div
                  style={{
                    width: '100%',
                    height: h,
                    borderRadius: 16,
                    background: isTarget
                      ? `linear-gradient(180deg, ${withAlpha(brand.primary, 0.92)}, ${withAlpha(brand.primary, 0.46)})`
                      : withAlpha('#0a2240', 0.6),
                    border: `2px solid ${isTarget ? brand.primary : withAlpha('#ffffff', 0.1)}`,
                    boxShadow: isTarget ? `0 0 44px ${withAlpha(brand.primary, p * 0.5)}` : 'none',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* faixa de RÓTULOS separada, ABAIXO da base (respiro de 34px) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 34 }}>
          {rungs.map((r, i) => {
            const isTarget = i === target;
            const labelP = reveal(frame, cue(i) + 8, 16);
            return (
              <div key={i} style={{ width: colW, textAlign: 'center', opacity: labelP }}>
                <span style={{ color: isTarget ? INK : INK_DIM, fontSize: 31, fontWeight: isTarget ? 700 : 600, lineHeight: 1.18 }}>{r}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
