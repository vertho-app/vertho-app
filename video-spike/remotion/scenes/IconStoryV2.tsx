import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, IconClock, IconChat, IconHourglass, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, springIn } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

const ICONS = [IconClock, IconChat, IconHourglass];
const FIRST = 34;
const STEP = 24;

export const IconStoryV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const title = reveal(frame, 6, 24);
  const items = scene.items || [];
  const activeIdx = items.reduce((acc, _x, i) => (frame >= FIRST + i * STEP + 8 ? i : acc), -1);

  return (
    <AbsoluteFill>
      {scene.src && <Audio src={scene.src} />}
      <BackgroundV2 brand={brand} tone="soft" />

      <div style={{ position: 'absolute', top: 142, left: 0, right: 0, textAlign: 'center', opacity: out }}>
        <EyebrowV2 brand={brand} center>Sinais</EyebrowV2>
        <h1 style={{ margin: '22px 0 0', color: INK, fontSize: 92, fontWeight: 800, letterSpacing: -1.6, opacity: title, transform: translateUp(title, 30) }}>
          {scene.title}
        </h1>
      </div>

      <div style={{ position: 'absolute', top: 400, left: 130, right: 130, bottom: 240, display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'stretch', opacity: out }}>
        {items.map((it, i) => {
          const s = springIn(frame, fps, FIRST + i * STEP, 16);
          const bob = Math.sin((frame + i * 30) / 28) * 7;
          const isActive = i === activeIdx;
          const glow = isActive ? interpolate(Math.sin(frame / 10), [-1, 1], [0.18, 0.42]) : 0;
          const Icon = ICONS[i % ICONS.length];
          return (
            <div
              key={it}
              style={{
                flex: 1,
                maxWidth: 470,
                opacity: Math.min(1, s),
                transform: `translateY(${(1 - s) * 56 + bob}px) scale(${(0.88 + s * 0.12) * (isActive ? 1.035 : 1)})`,
                background: 'linear-gradient(165deg, rgba(22,58,98,0.92) 0%, rgba(13,38,68,0.92) 100%)',
                border: `2px solid ${withAlpha(brand.primary, isActive ? 0.85 : 0.4)}`,
                borderRadius: 30,
                padding: '52px 40px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                boxShadow: isActive
                  ? `0 30px 70px ${withAlpha('#000814', 0.45)}, 0 0 ${30 + glow * 50}px ${withAlpha(brand.primary, glow)}`
                  : `0 24px 56px ${withAlpha('#000814', 0.4)}`,
              }}
            >
              <div style={{ width: 132, height: 132, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(brand.primary, isActive ? 0.22 : 0.14), border: `2px solid ${withAlpha(brand.primary, isActive ? 0.8 : 0.5)}` }}>
                <Icon size={66} color={isActive ? ACCENT_SOFT : brand.primary} />
              </div>
              <span style={{ marginTop: 20, color: brand.primary, fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ marginTop: 14, color: INK, fontSize: 44, fontWeight: 600, lineHeight: 1.16 }}>{it}</span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
