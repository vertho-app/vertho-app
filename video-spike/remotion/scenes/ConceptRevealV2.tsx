import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, IconObserve, IconConnect, IconAct, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, staggerDelay } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK, ACCENT_SOFT } from '../theme-v2';
import { pickVariant } from '../utils/variant';
import type { ComputedScene } from '../data/load-scenes';

const ICONS = [IconObserve, IconConnect, IconAct];
const ROW_GAP = 132; // distância vertical entre bullets

export const ConceptRevealV2: React.FC<{ scene: ComputedScene; brand: Brand; audio?: boolean }> = ({ scene, brand, audio = true }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const title = reveal(frame, 8, 26);
  const underline = reveal(frame, 20, 30);
  const bullets = scene.bullets || [];
  const nb = Math.max(1, bullets.length);
  const delayOf = (i: number) => staggerDelay(durationInFrames, i, nb);

  // Variante de layout DETERMINÍSTICA por conteúdo (anti-fadiga, reprodutível):
  // 0 = lista vertical (original) · 1 = três colunas · 2 = escada diagonal.
  const variant = pickVariant(`${scene.id}|${scene.title || ''}`, 3);

  // Índice do bullet "ativo" (último que entrou) → recebe brilho sutil.
  const activeIdx = bullets.reduce((acc, _b, i) => (frame >= delayOf(i) + 6 ? i : acc), -1);

  const Header = (
    <>
      <EyebrowV2 brand={brand}>Conceito</EyebrowV2>
      <h1 style={{ margin: '24px 0 0', color: INK, fontSize: variant === 1 ? 86 : 96, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.8, opacity: title, transform: translateUp(title, 40) }}>
        {scene.title}
      </h1>
      <div style={{ height: 5, width: underline * 300, marginTop: 24, borderRadius: 3, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />
    </>
  );

  const iconBox = (i: number, p: number, isActive: boolean) => {
    const Icon = ICONS[i % ICONS.length];
    const glow = isActive ? interpolate(Math.sin(frame / 9), [-1, 1], [0.25, 0.55]) : 0;
    return (
      <div
        style={{
          width: 84, height: 84, borderRadius: 22, flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: withAlpha(brand.primary, isActive ? 0.18 : 0.10),
          border: `1.5px solid ${withAlpha(brand.primary, isActive ? 0.7 : 0.38)}`,
          boxShadow: isActive ? `0 0 ${30 + glow * 40}px ${withAlpha(brand.primary, glow)}` : 'none',
          transform: `scale(${0.72 + p * 0.28})`,
        }}
      >
        <Icon size={44} color={isActive ? ACCENT_SOFT : brand.primary} />
      </div>
    );
  };

  // ── Variante 1: TRÊS COLUNAS ──────────────────────────────────────────────
  if (variant === 1) {
    return (
      <AbsoluteFill>
        {audio && scene.src && <Audio src={scene.src} />}
        <BackgroundV2 brand={brand} tone="deep" />
        <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 150px', opacity: out }}>
          <div>{Header}</div>
          <div style={{ display: 'flex', gap: 44, marginTop: 96 }}>
            {bullets.map((b, i) => {
              const p = reveal(frame, delayOf(i), 22);
              const isActive = i === activeIdx;
              return (
                <div key={b} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30, textAlign: 'center', opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
                  {iconBox(i, p, isActive)}
                  <span style={{ color: INK, fontSize: 46, fontWeight: 600, lineHeight: 1.18, opacity: isActive ? 1 : 0.86 }}>{b}</span>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // ── Variantes 0 (LISTA, original) e 2 (ESCADA diagonal) ───────────────────
  const isStair = variant === 2;
  const lineProgress = interpolate(frame, [delayOf(0), delayOf(nb - 1) + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineHeight = (bullets.length - 1) * ROW_GAP;

  return (
    <AbsoluteFill>
      {audio && scene.src && <Audio src={scene.src} />}
      <BackgroundV2 brand={brand} tone="deep" />

      <div style={{ position: 'absolute', top: 196, left: 150, width: 1320, opacity: out }}>
        {Header}

        <div style={{ position: 'relative', marginTop: 78 }}>
          {/* linha-guia vertical (na escada os bullets deslocam, então some) */}
          {!isStair && <div style={{ position: 'absolute', left: 41, top: 56, width: 2, height: lineHeight * lineProgress, background: withAlpha(brand.primary, 0.35) }} />}

          {bullets.map((b, i) => {
            const p = reveal(frame, delayOf(i), 22);
            const isActive = i === activeIdx;
            return (
              <div key={b} style={{ position: 'absolute', top: i * ROW_GAP, left: isStair ? i * 150 : 0, display: 'flex', alignItems: 'center', gap: 30, opacity: p, transform: `translateX(${(1 - p) * -32}px)` }}>
                {iconBox(i, p, isActive)}
                <span style={{ color: INK, fontSize: 58, fontWeight: 600, opacity: isActive ? 1 : 0.86 }}>{b}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
