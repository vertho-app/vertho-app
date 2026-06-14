import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/** Processo sequencial: passos numerados conectados por uma linha que se desenha. */
export const StepsFlowV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const steps = (scene.items || []).slice(0, 5);
  const title = reveal(frame, 8, 24);

  const FIRST = 42, STEP = 18;
  const lineP = interpolate(frame, [FIRST, FIRST + Math.max(1, steps.length) * STEP + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 150px', opacity: out }}>
        <div style={{ opacity: title }}>
          <EyebrowV2 brand={brand}>Passo a passo</EyebrowV2>
          <h1 style={{ margin: '20px 0 96px', color: INK, fontSize: 78, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, transform: translateUp(title, 30) }}>{scene.title}</h1>
        </div>

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* trilho + progresso */}
          <div style={{ position: 'absolute', top: 47, left: 47, right: 47, height: 3, background: withAlpha('#ffffff', 0.08) }} />
          <div style={{ position: 'absolute', top: 47, left: 47, height: 3, width: `calc((100% - 94px) * ${lineP})`, background: brand.primary, boxShadow: `0 0 14px ${withAlpha(brand.primary, 0.5)}` }} />

          {steps.map((s, i) => {
            const p = reveal(frame, FIRST + i * STEP, 20);
            return (
              <div key={i} style={{ position: 'relative', width: `${100 / steps.length}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: p, transform: `translateY(${(1 - p) * 22}px)` }}>
                <div style={{ width: 94, height: 94, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: brand.background, border: `3px solid ${brand.primary}`, color: ACCENT_SOFT, fontSize: 44, fontWeight: 800, boxShadow: `0 0 30px ${withAlpha(brand.primary, p * 0.4)}` }}>
                  {i + 1}
                </div>
                <span style={{ color: INK, fontSize: 36, fontWeight: 600, textAlign: 'center', marginTop: 28, maxWidth: 300, lineHeight: 1.2, opacity: 0.92 }}>{s}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
