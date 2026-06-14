import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha, IconChat } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK } from '../theme-v2';
import { ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/** Abre uma SITUAÇÃO típica ("Imagine que...") — contextualiza um problema antes da solução. */
export const ScenarioCardV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const iconP = reveal(frame, 6, 24);
  const eyebrowP = reveal(frame, 18, 20);
  const textP = reveal(frame, 28, 42);

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 220px', opacity: out }}>
        <div style={{ width: 150, height: 150, borderRadius: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(brand.primary, 0.14), border: `2px solid ${withAlpha(brand.primary, 0.5)}`, opacity: iconP, transform: `scale(${0.7 + iconP * 0.3})` }}>
          <IconChat size={80} color={ACCENT_SOFT} />
        </div>
        <div style={{ opacity: eyebrowP, marginTop: 56 }}>
          <EyebrowV2 brand={brand}>{scene.title || 'Imagine'}</EyebrowV2>
        </div>
        <p style={{ color: INK, fontSize: 78, fontWeight: 700, maxWidth: 1420, lineHeight: 1.22, letterSpacing: -1, marginTop: 30, opacity: textP, transform: translateUp(textP, 28) }}>
          {scene.subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
