import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, INK, INK_DIM, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

const Dash: React.FC<{ color: string }> = ({ color }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round"><path d="M6 12h12" /></svg>
);
const Check: React.FC<{ color: string; p: number }> = ({ color, p }) => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17l9-10" strokeDasharray={26} strokeDashoffset={26 * (1 - p)} />
  </svg>
);

const LEFT_DELAY = 26;
const RIGHT_DELAY = 70;

export const ComparisonMotionV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const title = reveal(frame, 6, 24);

  const left = scene.left || { title: 'Reagir', items: [] };
  const right = scene.right || { title: 'Antecipar', items: [] };

  const leftEnter = reveal(frame, LEFT_DELAY, 26);
  const rightEnter = reveal(frame, RIGHT_DELAY, 28);
  // Destaque progressivo do lado "Antecipar": cresce do surgimento ao fim.
  const rise = reveal(frame, RIGHT_DELAY + 10, 60);
  const emphasis = reveal(frame, durationInFrames - 80, 44);
  const positive = Math.max(rise, emphasis);
  // O lado "Reagir" esmaece conforme "Antecipar" ganha força.
  const leftDim = interpolate(positive, [0, 1], [1, 0.4]);
  // Seta de evolução (esquerda → direita) aparece quando "Antecipar" entra.
  const arrow = reveal(frame, RIGHT_DELAY - 6, 24);

  return (
    <AbsoluteFill>
      {scene.src && <Audio src={scene.src} />}
      <BackgroundV2 brand={brand} tone="deep" />

      <div style={{ position: 'absolute', top: 122, left: 0, right: 0, textAlign: 'center', opacity: out }}>
        <h1 style={{ color: INK, fontSize: 82, fontWeight: 800, letterSpacing: -1.5, opacity: title, transform: translateUp(title, 30) }}>{scene.title}</h1>
      </div>

      {/* Seta de evolução no centro */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: `translate(-50%,-50%) translateX(${(1 - arrow) * -20}px)`, opacity: arrow * 0.9 }}>
        <svg width="92" height="48" viewBox="0 0 92 48" fill="none" stroke={brand.primary} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 24h66" />
          <path d="m62 11 18 13-18 13" />
        </svg>
      </div>

      <div style={{ position: 'absolute', top: 300, left: 140, right: 140, bottom: 240, display: 'flex', gap: 120, opacity: out }}>
        {/* Reagir — neutro */}
        <div style={{ flex: 1, opacity: leftEnter * leftDim, transform: `translateX(${(1 - leftEnter) * -54}px)`, background: withAlpha('#0a2240', 0.42), border: `1.5px solid ${withAlpha('#ffffff', 0.07)}`, borderRadius: 26, padding: '44px 46px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: withAlpha('#ffffff', 0.3) }} />
            <span style={{ color: INK_DIM, fontSize: 42, fontWeight: 800, letterSpacing: -0.5 }}>{left.title}</span>
          </div>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {left.items.map((it, i) => {
              const p = reveal(frame, LEFT_DELAY + 14 + i * 12, 18);
              return (
                <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: p, transform: translateUp(p, 14) }}>
                  <Dash color={withAlpha('#ffffff', 0.45)} />
                  <span style={{ color: INK_DIM, fontSize: 40, fontWeight: 500 }}>{it}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Antecipar — ganha destaque progressivo */}
        <div
          style={{
            flex: 1,
            opacity: rightEnter,
            transform: `translateX(${(1 - rightEnter) * 54}px) scale(${1 + positive * 0.045})`,
            background: `linear-gradient(160deg, ${withAlpha(brand.primary, 0.06 + positive * 0.07)}, ${withAlpha('#0a2240', 0.4)})`,
            border: `1.5px solid ${withAlpha(brand.primary, 0.3 + positive * 0.5)}`,
            borderRadius: 26,
            padding: '44px 46px',
            boxShadow: `0 26px 64px ${withAlpha(brand.primary, 0.06 + positive * 0.22)}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: brand.primary, boxShadow: `0 0 ${10 + positive * 16}px ${withAlpha(brand.primary, 0.7)}` }} />
            <span style={{ color: positive > 0.5 ? ACCENT_SOFT : brand.primary, fontSize: 42, fontWeight: 800, letterSpacing: -0.5 }}>{right.title}</span>
          </div>
          <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {right.items.map((it, i) => {
              const p = reveal(frame, RIGHT_DELAY + 14 + i * 12, 18);
              return (
                <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: p, transform: translateUp(p, 14) }}>
                  <Check color={brand.primary} p={p} />
                  <span style={{ color: INK, fontSize: 40, fontWeight: 600 }}>{it}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
