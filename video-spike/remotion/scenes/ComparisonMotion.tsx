import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Background, Brand, BRAND, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import type { ComputedScene } from '../data/load-scenes';

const MarkX: React.FC<{ color: string }> = ({ color }) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
);
const MarkCheck: React.FC<{ color: string }> = ({ color }) => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-10" /></svg>
);

const Column: React.FC<{
  title: string; items: string[]; brand: Brand; frame: number;
  delay: number; side: 'left' | 'right'; accent: boolean; emphasis: number;
}> = ({ title, items, brand, frame, delay, side, accent, emphasis }) => {
  const enter = reveal(frame, delay, 24);
  const dir = side === 'left' ? -1 : 1;
  const dim = accent ? 1 : interpolate(emphasis, [0, 1], [1, 0.45]);
  const scale = accent ? 1 + emphasis * 0.035 : 1;
  const glow = accent ? emphasis : 0;
  return (
    <div
      style={{
        flex: 1,
        opacity: enter * dim,
        transform: `translateX(${(1 - enter) * dir * 60}px) scale(${scale})`,
        background: accent ? withAlpha(brand.primary, 0.08) : withAlpha('#0a2240', 0.55),
        border: `1.5px solid ${accent ? withAlpha(brand.primary, 0.45 + glow * 0.35) : withAlpha('#ffffff', 0.08)}`,
        borderRadius: 28,
        padding: '46px 48px',
        boxShadow: accent ? `0 24px 60px ${withAlpha(brand.primary, 0.10 + glow * 0.22)}` : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: accent ? brand.primary : withAlpha('#ffffff', 0.35) }} />
        <span style={{ color: accent ? brand.primary : BRAND.inkDim, fontSize: 44, fontWeight: 800, letterSpacing: -0.5 }}>{title}</span>
      </div>
      <div style={{ marginTop: 38, display: 'flex', flexDirection: 'column', gap: 26 }}>
        {items.map((it, i) => {
          const p = reveal(frame, delay + 16 + i * 12, 18);
          return (
            <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: p, transform: translateUp(p, 16) }}>
              {accent ? <MarkCheck color={brand.primary} /> : <MarkX color={withAlpha('#ffffff', 0.5)} />}
              <span style={{ color: accent ? BRAND.ink : BRAND.inkDim, fontSize: 42, fontWeight: 500 }}>{it}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ComparisonMotion: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 14, 18);
  const title = reveal(frame, 6, 22);
  const divider = reveal(frame, 22, 36);
  // Ênfase final no lado "Antecipar".
  const emphasis = reveal(frame, durationInFrames - 70, 34);

  const left = scene.left || { title: 'Reagir', items: [] };
  const right = scene.right || { title: 'Antecipar', items: [] };

  return (
    <AbsoluteFill>
      {scene.src && <Audio src={scene.src} />}
      <Background brand={brand} intensity={0.85} />

      <div style={{ position: 'absolute', top: 120, left: 0, right: 0, textAlign: 'center', opacity: out }}>
        <h1 style={{ color: BRAND.ink, fontSize: 84, fontWeight: 800, letterSpacing: -1.5, opacity: title, transform: translateUp(title, 32) }}>
          {scene.title}
        </h1>
      </div>

      {/* divisória central que "desenha" */}
      <div style={{ position: 'absolute', top: 300, bottom: 230, left: '50%', width: 2, transform: 'translateX(-50%)', overflow: 'hidden' }}>
        <div style={{ width: '100%', height: `${divider * 100}%`, background: `linear-gradient(180deg, ${withAlpha(brand.primary, 0)}, ${withAlpha(brand.primary, 0.5)}, ${withAlpha(brand.primary, 0)})` }} />
      </div>

      <div style={{ position: 'absolute', top: 300, left: 140, right: 140, bottom: 240, display: 'flex', gap: 72, opacity: out }}>
        <Column title={left.title} items={left.items} brand={brand} frame={frame} delay={28} side="left" accent={false} emphasis={emphasis} />
        <Column title={right.title} items={right.items} brand={brand} frame={frame} delay={64} side="right" accent emphasis={emphasis} />
      </div>
    </AbsoluteFill>
  );
};
