import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/** Frase-âncora memorável em tela limpa — respiro que fixa um princípio. */
export const QuoteSpotlightV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 18, 22);
  const markP = reveal(frame, 4, 18);
  const quoteP = reveal(frame, 14, 40);
  const authorP = reveal(frame, 46, 24);
  const texto = scene.quote || scene.title || '';

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="soft" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 220px' }}>
        <div style={{ color: withAlpha(brand.primary, 0.55), fontSize: 250, fontWeight: 800, lineHeight: 0.4, height: 96, opacity: markP, fontFamily: 'Georgia, "Times New Roman", serif' }}>
          &ldquo;
        </div>
        <p style={{ color: INK, fontSize: 86, fontWeight: 700, textAlign: 'center', maxWidth: 1480, lineHeight: 1.18, letterSpacing: -1, opacity: quoteP, transform: translateUp(quoteP, 30) }}>
          {texto}
        </p>
        {scene.subtitle && (
          <div style={{ marginTop: 50, display: 'flex', alignItems: 'center', gap: 16, opacity: authorP }}>
            <div style={{ width: 44, height: 2, background: brand.primary }} />
            <span style={{ color: ACCENT_SOFT, fontSize: 34, fontWeight: 600, letterSpacing: 1 }}>{scene.subtitle}</span>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
