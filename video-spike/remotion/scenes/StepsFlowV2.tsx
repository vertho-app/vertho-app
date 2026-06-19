import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, cueDelay } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK } from '../theme-v2';
import { pickVariant } from '../utils/variant';
import type { ComputedScene } from '../data/load-scenes';

// Numeral fantasma — roxo claro e legível (não "apagado") sobre o fundo escuro.
const GHOST = '#a78bfa';

/**
 * Processo sequencial — tratamento EDITORIAL: índices em numeral fantasma grande
 * (não "bolinha numerada de PPT"), conectados por uma linha-acento que se desenha.
 * As entradas são DISTRIBUÍDAS ao longo da cena (staggerDelay) p/ acompanhar a fala.
 */
export const StepsFlowV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const steps = (scene.items || []).slice(0, 5);
  const n = Math.max(1, steps.length);
  const title = reveal(frame, 8, 24);
  // 0 = jornada horizontal · 1 = timeline vertical editorial.
  const variant = pickVariant(`${scene.id}|${scene.title || ''}`, 2);

  const cue = (i: number) => cueDelay(durationInFrames, i, n, scene.speechStartFrame, scene.speechEndFrame);
  const firstD = cue(0);
  const lastD = cue(n - 1);
  const lineP = interpolate(frame, [firstD, lastD + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // ── Variante 1: TIMELINE VERTICAL EDITORIAL ───────────────────────────────
  if (variant === 1) {
    return (
      <AbsoluteFill>
        <BackgroundV2 brand={brand} tone="deep" />
        <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 168px', opacity: out }}>
          <div style={{ opacity: title }}>
            <EyebrowV2 brand={brand}>Passo a passo</EyebrowV2>
            <h1 style={{ margin: '20px 0 52px', color: INK, fontSize: 74, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, transform: translateUp(title, 30) }}>{scene.title}</h1>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 2, top: 10, bottom: 10, width: 2, background: withAlpha('#ffffff', 0.08) }} />
            <div style={{ position: 'absolute', left: 2, top: 10, width: 2, height: `calc((100% - 20px) * ${lineP})`, background: brand.primary, boxShadow: `0 0 12px ${withAlpha(brand.primary, 0.5)}` }} />
            {steps.map((s, i) => {
              const p = reveal(frame, cue(i), 22);
              const last = i === steps.length - 1;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 44, padding: '24px 0 24px 56px', borderBottom: last ? 'none' : `1px solid ${withAlpha('#ffffff', 0.07)}`, opacity: p, transform: `translateX(${(1 - p) * 24}px)` }}>
                  <span style={{ flex: '0 0 auto', width: 116, fontSize: 100, fontWeight: 800, lineHeight: 0.8, letterSpacing: -3, color: withAlpha(GHOST, 0.72), fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: INK, fontSize: 50, fontWeight: 600, lineHeight: 1.14, opacity: 0.96 }}>{s}</span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // ── Variante 0: JORNADA HORIZONTAL EDITORIAL ──────────────────────────────
  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 140px', opacity: out }}>
        <div style={{ opacity: title }}>
          <EyebrowV2 brand={brand}>Passo a passo</EyebrowV2>
          <h1 style={{ margin: '20px 0 104px', color: INK, fontSize: 78, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, transform: translateUp(title, 30) }}>{scene.title}</h1>
        </div>

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ position: 'absolute', top: 46, left: '4%', right: '4%', height: 2, background: withAlpha('#ffffff', 0.08) }} />
          <div style={{ position: 'absolute', top: 46, left: '4%', height: 2, width: `calc(92% * ${lineP})`, background: brand.primary, boxShadow: `0 0 14px ${withAlpha(brand.primary, 0.5)}` }} />

          {steps.map((s, i) => {
            const p = reveal(frame, cue(i), 22);
            return (
              <div key={i} style={{ position: 'relative', width: `${100 / steps.length}%`, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: p, transform: `translateY(${(1 - p) * 22}px)` }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: brand.primary, marginTop: 38, boxShadow: `0 0 22px ${withAlpha(brand.primary, p * 0.7)}` }} />
                <span style={{ fontSize: 86, fontWeight: 800, lineHeight: 0.9, letterSpacing: -3, color: withAlpha(GHOST, 0.72), fontVariantNumeric: 'tabular-nums', marginTop: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ color: INK, fontSize: 35, fontWeight: 600, textAlign: 'center', marginTop: 16, maxWidth: 290, lineHeight: 1.2, opacity: 0.94 }}>{s}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
