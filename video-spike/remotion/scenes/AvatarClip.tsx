import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, BRAND, Eyebrow, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import type { ComputedScene } from '../data/load-scenes';

/**
 * Cena de avatar (intro/outro): o MP4 ocupa o quadro (com seu próprio áudio —
 * a mentora fala). Por cima, um scrim sutil e um título/subtítulo no topo, que
 * entram com fade+slide e saem no fim. Título no topo p/ não brigar com a legenda.
 */
export const AvatarClip: React.FC<{ scene: ComputedScene; brand: Brand; kicker: string }> = ({ scene, brand, kicker }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const panel = fadeInOut(frame, durationInFrames, 16, 18);
  const tIn = reveal(frame, 8, 24);
  const sIn = reveal(frame, 22, 24);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background }}>
      {scene.src && (
        <OffthreadVideo src={scene.src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      {/* scrim p/ legibilidade do título (topo) e respiro na base */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${withAlpha('#04101f', 0.86)} 0%, ${withAlpha('#04101f', 0.28)} 26%, transparent 52%, ${withAlpha('#04101f', 0.62)} 100%)`,
        }}
      />
      <div style={{ position: 'absolute', top: 116, left: 120, maxWidth: 1180, opacity: panel }}>
        <Eyebrow brand={brand}>{kicker}</Eyebrow>
        <h1
          style={{
            margin: '26px 0 0',
            color: BRAND.ink,
            fontSize: 108,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: -2,
            opacity: tIn,
            transform: translateUp(tIn, 42),
            textShadow: '0 6px 30px rgba(0,8,20,0.5)',
          }}
        >
          {scene.title}
        </h1>
        <p
          style={{
            margin: '22px 0 0',
            color: BRAND.ink,
            fontSize: 47,
            fontWeight: 500,
            opacity: sIn * 0.92,
            transform: translateUp(sIn, 28),
            textShadow: '0 4px 20px rgba(0,8,20,0.5)',
          }}
        >
          {scene.subtitle}
        </p>
      </div>
    </AbsoluteFill>
  );
};
