import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig } from 'remotion';
import { Background, Brand, BRAND, Eyebrow, IconClock, IconChat, IconHourglass, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, springIn } from '../utils/timing';
import type { ComputedScene } from '../data/load-scenes';

const ICONS = [IconClock, IconChat, IconHourglass];

export const IconStory: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 14, 18);
  const title = reveal(frame, 6, 22);
  const items = scene.items || [];

  return (
    <AbsoluteFill>
      {scene.src && <Audio src={scene.src} />}
      <Background brand={brand} intensity={0.9} />

      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: out }}>
        <Eyebrow brand={brand} style={{ justifyContent: 'center' }}>Sinais</Eyebrow>
        <h1 style={{ margin: '24px 0 0', color: BRAND.ink, fontSize: 86, fontWeight: 800, letterSpacing: -1.5, opacity: title, transform: translateUp(title, 32) }}>
          {scene.title}
        </h1>
      </div>

      <div style={{ position: 'absolute', top: 396, left: 140, right: 140, bottom: 250, display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'stretch', opacity: out }}>
        {items.map((it, i) => {
          const delay = 34 + i * 22;
          const s = springIn(frame, fps, delay, 16);
          const bob = Math.sin((frame + i * 30) / 26) * 9;
          const Icon = ICONS[i % ICONS.length];
          return (
            <div
              key={it}
              style={{
                flex: 1,
                maxWidth: 460,
                opacity: Math.min(1, s),
                transform: `translateY(${(1 - s) * 60 + bob}px) scale(${0.86 + s * 0.14})`,
                background: withAlpha('#0a2240', 0.5),
                border: `1.5px solid ${withAlpha(brand.primary, 0.22)}`,
                borderRadius: 30,
                padding: '54px 40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                boxShadow: `0 26px 60px ${withAlpha('#000814', 0.4)}`,
              }}
            >
              <div style={{ width: 130, height: 130, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(brand.primary, 0.12), border: `1.5px solid ${withAlpha(brand.primary, 0.4)}` }}>
                <Icon size={64} color={brand.primary} />
              </div>
              <span style={{ marginTop: 18, color: brand.primary, fontSize: 24, fontWeight: 700, letterSpacing: 3 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ marginTop: 14, color: BRAND.ink, fontSize: 42, fontWeight: 600, lineHeight: 1.18 }}>{it}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
