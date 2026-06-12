import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from './theme';

// Acentos V2: um ciano um pouco mais claro para destaques/ativos (mais "vivo"
// que o primário em fundos escuros) sem fugir da paleta.
export const ACCENT = '#34c5cc';
export const ACCENT_SOFT = '#62dbe1';
export const INK = '#F1FAFE';
export const INK_DIM = 'rgba(241,250,254,0.66)';
export const FONT = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

/**
 * Fundo V2: mais limpo e com mais luz que a V1. `tone='soft'` levanta a
 * luminância (usado na IconStory, que na V1 ficava escura). Glow ciano que
 * deriva devagar + grade de pontos fina + vinheta LEVE (não escurece os cards).
 */
export const BackgroundV2: React.FC<{ brand: Brand; tone?: 'deep' | 'soft' }> = ({ brand, tone = 'deep' }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 110;
  const gx = interpolate(Math.sin(t), [-1, 1], [width * 0.58, width * 0.86]);
  const gy = interpolate(Math.cos(t * 0.8), [-1, 1], [height * 0.12, height * 0.4]);
  const topColor = tone === 'soft' ? '#11335c' : '#0a2444';
  const glow = tone === 'soft' ? 0.26 : 0.18;
  const vignette = tone === 'soft' ? 0.28 : 0.45;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `linear-gradient(165deg, ${topColor} 0%, ${brand.background} 62%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${gx}px ${gy}px, ${withAlpha(brand.primary, glow)} 0%, transparent 46%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${withAlpha(brand.primary, 0.05)} 1.1px, transparent 1.1px)`,
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 82%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 82%)',
          opacity: 0.6,
        }}
      />
      <AbsoluteFill style={{ boxShadow: `inset 0 0 ${height * 0.55}px ${withAlpha('#000814', vignette)}` }} />
    </AbsoluteFill>
  );
};

/** Eyebrow V2 — um pouco menor e mais elegante. */
export const EyebrowV2: React.FC<{ children: React.ReactNode; brand: Brand; center?: boolean; style?: React.CSSProperties }> = ({ children, brand, center, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: center ? 'center' : 'flex-start', ...style }}>
    <div style={{ width: 38, height: 2.5, borderRadius: 2, background: brand.primary }} />
    <span style={{ color: brand.primary, fontSize: 23, letterSpacing: 5, fontWeight: 700, textTransform: 'uppercase' }}>{children}</span>
  </div>
);

/** Logo discreto no topo-ESQUERDA (na V2 o avatar fica à direita; logo não compete com o rosto). */
export const BrandMarkV2: React.FC = () => (
  <Img src={staticFile('assets/logo-vertho.png')} style={{ position: 'absolute', top: 54, left: 72, height: 40, opacity: 0.82, filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }} />
);

/** Barra de progresso V2 — fininha e bem discreta na base (não compete com a legenda). */
export const ProgressBarV2: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: withAlpha('#ffffff', 0.04) }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: withAlpha(brand.primary, 0.55) }} />
    </div>
  );
};
