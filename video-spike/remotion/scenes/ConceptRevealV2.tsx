import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, IconObserve, IconConnect, IconAct, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

const ICONS = [IconObserve, IconConnect, IconAct];
const ROW_GAP = 132; // distância vertical entre bullets
const FIRST_DELAY = 46;
const STEP = 22;

export const ConceptRevealV2: React.FC<{ scene: ComputedScene; brand: Brand; audio?: boolean }> = ({ scene, brand, audio = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const title = reveal(frame, 8, 26);
  const underline = reveal(frame, 20, 30);
  const bullets = scene.bullets || [];

  // Índice do bullet "ativo" (último que entrou) → recebe brilho sutil.
  const activeIdx = bullets.reduce((acc, _b, i) => (frame >= FIRST_DELAY + i * STEP + 6 ? i : acc), -1);

  // Linha-guia vertical que liga os bullets (desenha conforme eles entram).
  const lineProgress = interpolate(frame, [FIRST_DELAY, FIRST_DELAY + (bullets.length - 1) * STEP + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineTop = 56;
  const lineHeight = (bullets.length - 1) * ROW_GAP;

  return (
    <AbsoluteFill>
      {audio && scene.src && <Audio src={scene.src} />}
      <BackgroundV2 brand={brand} tone="deep" />

      <div style={{ position: 'absolute', top: 196, left: 150, width: 1180, opacity: out }}>
        <EyebrowV2 brand={brand}>Conceito</EyebrowV2>
        <h1 style={{ margin: '24px 0 0', color: INK, fontSize: 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.8, opacity: title, transform: translateUp(title, 40) }}>
          {scene.title}
        </h1>
        <div style={{ height: 5, width: underline * 300, marginTop: 24, borderRadius: 3, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />

        <div style={{ position: 'relative', marginTop: 78 }}>
          {/* linha-guia */}
          <div style={{ position: 'absolute', left: 41, top: lineTop, width: 2, height: lineHeight * lineProgress, background: withAlpha(brand.primary, 0.35) }} />

          {bullets.map((b, i) => {
            const p = reveal(frame, FIRST_DELAY + i * STEP, 22);
            const Icon = ICONS[i % ICONS.length];
            const isActive = i === activeIdx;
            const glow = isActive ? interpolate(Math.sin(frame / 9), [-1, 1], [0.25, 0.55]) : 0;
            return (
              <div key={b} style={{ position: 'absolute', top: i * ROW_GAP, left: 0, display: 'flex', alignItems: 'center', gap: 30, opacity: p, transform: `translateX(${(1 - p) * -32}px)` }}>
                <div
                  style={{
                    width: 84, height: 84, borderRadius: 22, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: withAlpha(brand.primary, isActive ? 0.18 : 0.10),
                    border: `1.5px solid ${withAlpha(brand.primary, isActive ? 0.7 : 0.38)}`,
                    boxShadow: isActive ? `0 0 ${30 + glow * 40}px ${withAlpha(brand.primary, glow)}` : 'none',
                    transform: `scale(${0.72 + p * 0.28})`,
                    transition: 'none',
                  }}
                >
                  <Icon size={44} color={isActive ? ACCENT_SOFT : brand.primary} />
                </div>
                <span style={{ color: INK, fontSize: 58, fontWeight: 600, opacity: isActive ? 1 : 0.86 }}>{b}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
