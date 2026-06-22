import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, INK, INK_DIM, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/** Define um termo de forma limpa (card centralizado) — respiro antes de aprofundar. */
export const DefinitionCardV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const cardP = reveal(frame, 4, 26);
  const termP = reveal(frame, 16, 26);
  const lineP = reveal(frame, 34, 22);
  const defP = reveal(frame, 44, 34);
  const term = scene.term || scene.title || '';
  const def = scene.definition || scene.subtitle || '';

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="soft" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 220px' }}>
        <div
          style={{
            width: '100%', maxWidth: 1360, background: withAlpha('#0a2240', 0.5),
            border: `1.5px solid ${withAlpha('#ffffff', 0.08)}`, borderRadius: 34, padding: '90px 96px',
            textAlign: 'center', opacity: cardP, transform: `scale(${0.96 + cardP * 0.04})`,
            boxShadow: `0 40px 120px ${withAlpha('#000814', 0.45)}`,
          }}
        >
          <div style={{ color: ACCENT_SOFT, fontSize: 23, fontWeight: 800, letterSpacing: 6, marginBottom: 30, opacity: termP }}>DEFINIÇÃO</div>
          <h1 style={{ margin: 0, color: INK, fontSize: 104, fontWeight: 800, letterSpacing: -2, lineHeight: 1.02, opacity: termP, transform: translateUp(termP, 24) }}>{term}</h1>
          <div style={{ height: 3, width: 120 * lineP, background: brand.primary, margin: '46px auto', borderRadius: 2, boxShadow: `0 0 14px ${withAlpha(brand.primary, 0.5)}` }} />
          <p style={{ margin: '0 auto', color: INK_DIM, fontSize: 46, fontWeight: 500, lineHeight: 1.34, maxWidth: 1040, opacity: defP }}>{def}</p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
