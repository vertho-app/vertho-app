import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, springIn, cueDelay } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import { pickVariant } from '../utils/variant';
import { iconByName } from '../icons';
import type { ComputedScene } from '../data/load-scenes';

export const IconStoryV2: React.FC<{ scene: ComputedScene; brand: Brand; audio?: boolean }> = ({ scene, brand, audio = true }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const title = reveal(frame, 6, 24);
  const items = scene.items || [];
  const ni = Math.max(1, items.length);
  const delayOf = (i: number) => cueDelay(durationInFrames, i, ni, scene.speechStartFrame, scene.speechEndFrame);
  const activeIdx = items.reduce((acc, _x, i) => (frame >= delayOf(i) + 8 ? i : acc), -1);
  // 0 = 3 cards em linha (original) · 1 = lista vertical de features.
  const variant = pickVariant(`${scene.id}|${scene.title || ''}`, 2);

  // ── Variante 1: LISTA VERTICAL ────────────────────────────────────────────
  if (variant === 1) {
    return (
      <AbsoluteFill>
        {audio && scene.src && <Audio src={scene.src} />}
        <BackgroundV2 brand={brand} tone="soft" />
        <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: out }}>
          <EyebrowV2 brand={brand} center>Sinais</EyebrowV2>
          <h1 style={{ margin: '22px 0 0', color: INK, fontSize: 88, fontWeight: 800, letterSpacing: -1.6, opacity: title, transform: translateUp(title, 30) }}>{scene.title}</h1>
        </div>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out }}>
          <div style={{ marginTop: 140, display: 'flex', flexDirection: 'column', gap: 38, width: 1000 }}>
            {items.map((it, i) => {
              const s = springIn(frame, fps, delayOf(i), 16);
              const isActive = i === activeIdx;
              const Icon = iconByName(scene.icons?.[i], i);
              return (
                <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 36, opacity: Math.min(1, s), transform: `translateX(${(1 - s) * 44}px)`, background: 'linear-gradient(165deg, rgba(22,58,98,0.9) 0%, rgba(13,38,68,0.9) 100%)', border: `2px solid ${withAlpha(brand.primary, isActive ? 0.8 : 0.4)}`, borderRadius: 26, padding: '28px 44px', boxShadow: `0 22px 52px ${withAlpha('#000814', 0.4)}` }}>
                  <div style={{ width: 104, height: 104, borderRadius: '50%', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(brand.primary, isActive ? 0.22 : 0.14), border: `2px solid ${withAlpha(brand.primary, isActive ? 0.8 : 0.5)}` }}>
                    <Icon size={54} color={isActive ? ACCENT_SOFT : brand.primary} strokeWidth={1.7} />
                  </div>
                  <span style={{ color: brand.primary, fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: INK, fontSize: 48, fontWeight: 600 }}>{it}</span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      {audio && scene.src && <Audio src={scene.src} />}
      <BackgroundV2 brand={brand} tone="soft" />

      <div style={{ position: 'absolute', top: 142, left: 0, right: 0, textAlign: 'center', opacity: out }}>
        <EyebrowV2 brand={brand} center>Sinais</EyebrowV2>
        <h1 style={{ margin: '22px 0 0', color: INK, fontSize: 92, fontWeight: 800, letterSpacing: -1.6, opacity: title, transform: translateUp(title, 30) }}>
          {scene.title}
        </h1>
      </div>

      <div style={{ position: 'absolute', top: 400, left: 130, right: 130, bottom: 240, display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'stretch', opacity: out }}>
        {items.map((it, i) => {
          const s = springIn(frame, fps, delayOf(i), 16);
          const isActive = i === activeIdx;
          const glow = isActive ? interpolate(Math.sin(frame / 10), [-1, 1], [0.18, 0.42]) : 0;
          const Icon = iconByName(scene.icons?.[i], i);
          return (
            <div
              key={it}
              style={{
                flex: 1,
                maxWidth: 470,
                opacity: Math.min(1, s),
                transform: `translateY(${(1 - s) * 56}px) scale(${(0.88 + s * 0.12) * (isActive ? 1.035 : 1)})`,
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
                <Icon size={66} color={isActive ? ACCENT_SOFT : brand.primary} strokeWidth={1.7} />
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
