import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/** Separa "73%" → { prefix:'', num:73, suffix:'%', decimals:0 } para animar o count-up. */
function parseStat(s?: string) {
  const str = (s || '').trim();
  const m = str.match(/^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!m) return { prefix: '', num: null as number | null, suffix: str, decimals: 0 };
  const decimals = (m[2].split(/[.,]/)[1] || '').length;
  return { prefix: m[1], num: parseFloat(m[2].replace(',', '.')), suffix: m[3], decimals };
}

/** Número/percentual gigante com count-up — respiro de alto impacto entre cenas densas. */
export const StatHighlightV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const { prefix, num, suffix, decimals } = parseStat(scene.stat);

  const countP = reveal(frame, 12, 44);
  const shown = num == null ? null : num * countP;
  const numText = shown == null ? '' : shown.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const titleP = reveal(frame, 6, 24);
  const bigP = reveal(frame, 10, 22);
  const ctxP = reveal(frame, 52, 26);

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="soft" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 180px' }}>
        {scene.title && (
          <div style={{ opacity: titleP, marginBottom: 26 }}>
            <EyebrowV2 brand={brand} center>{scene.title}</EyebrowV2>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', opacity: bigP, transform: translateUp(bigP, 30) }}>
          <span style={{ color: ACCENT_SOFT, fontSize: 340, fontWeight: 800, lineHeight: 0.9, letterSpacing: -6, textShadow: `0 0 90px ${withAlpha(brand.primary, 0.45)}` }}>
            {num == null ? suffix : `${prefix}${numText}`}
          </span>
          {num != null && suffix && (
            <span style={{ color: ACCENT_SOFT, fontSize: 150, fontWeight: 800, marginLeft: 6 }}>{suffix}</span>
          )}
        </div>
        {scene.subtitle && (
          <p style={{ color: INK, fontSize: 56, fontWeight: 500, textAlign: 'center', maxWidth: 1300, marginTop: 44, lineHeight: 1.3, opacity: ctxP, transform: translateUp(ctxP, 24) }}>
            {scene.subtitle}
          </p>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
