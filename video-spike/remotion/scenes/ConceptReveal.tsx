import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Background, Brand, BRAND, Eyebrow, IconObserve, IconConnect, IconAct, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import type { ComputedScene } from '../data/load-scenes';

const ICONS = [IconObserve, IconConnect, IconAct];

/** Motivo de "radar" no lado direito: anéis concêntricos + varredura girando. */
const RadarMotif: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const cx = 1430;
  const cy = height / 2;
  const appear = reveal(frame, 18, 40);
  const angle = (frame * 1.1) % 360;
  const rings = [120, 220, 320, 420];
  return (
    <AbsoluteFill style={{ opacity: appear * 0.55 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        {rings.map((r) => (
          <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={withAlpha(brand.primary, 0.18)} strokeWidth={2} />
        ))}
        <line x1={cx} y1={cy} x2={cx} y2={cy - 440} stroke={withAlpha(brand.primary, 0.5)} strokeWidth={3}
          transform={`rotate(${angle} ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={6} fill={brand.primary} />
        {/* pequenos "sinais" piscando nos anéis */}
        {[{ a: 40, r: 220 }, { a: 160, r: 320 }, { a: 290, r: 120 }].map((s, i) => {
          const rad = (s.a * Math.PI) / 180;
          const blink = interpolate(Math.sin((frame + i * 20) / 8), [-1, 1], [0.2, 1]);
          return <circle key={i} cx={cx + Math.cos(rad) * s.r} cy={cy + Math.sin(rad) * s.r} r={7} fill={brand.primary} opacity={blink} />;
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const ConceptReveal: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 14, 18);
  const title = reveal(frame, 6, 24);
  const underline = reveal(frame, 18, 28);
  const bullets = scene.bullets || [];

  return (
    <AbsoluteFill>
      {scene.src && <Audio src={scene.src} />}
      <Background brand={brand} />
      <RadarMotif brand={brand} />

      <div style={{ position: 'absolute', top: 188, left: 140, width: 980, opacity: out }}>
        <Eyebrow brand={brand}>Conceito</Eyebrow>
        <h1 style={{ margin: '26px 0 0', color: BRAND.ink, fontSize: 92, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1.5, opacity: title, transform: translateUp(title, 38) }}>
          {scene.title}
        </h1>
        <div style={{ height: 5, width: underline * 280, marginTop: 26, borderRadius: 3, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />

        <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 30 }}>
          {bullets.map((b, i) => {
            const delay = 44 + i * 18;
            const p = reveal(frame, delay, 20);
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 28, opacity: p, transform: `translateX(${(1 - p) * -36}px)` }}>
                <div style={{ width: 84, height: 84, borderRadius: 22, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: withAlpha(brand.primary, 0.12), border: `1.5px solid ${withAlpha(brand.primary, 0.4)}`, transform: `scale(${0.7 + p * 0.3})` }}>
                  <Icon size={44} color={brand.primary} />
                </div>
                <span style={{ color: BRAND.ink, fontSize: 56, fontWeight: 600 }}>{b}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
