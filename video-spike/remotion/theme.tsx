import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export interface Brand {
  primary: string;
  secondary: string;
  background: string;
  font?: string;
}

// Defaults (mesclados com o brand vindo do JSON).
export const BRAND = {
  primary: '#34c5cc',
  secondary: '#142f57',
  background: '#071A33',
  ink: '#EAF6FB',
  inkDim: 'rgba(234,246,251,0.60)',
  font: 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif',
};

export function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/**
 * Fundo profundo e vivo (não chapado): dois "blobs" radiais (ciano + navy) que
 * derivam lentamente, uma grade de pontos sutil e um vinhetado. Dá sensação de
 * peça audiovisual, não slide.
 */
export const Background: React.FC<{ brand: Brand; intensity?: number }> = ({ brand, intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const t = frame / 90;
  const bx = interpolate(Math.sin(t), [-1, 1], [width * 0.12, width * 0.30]);
  const by = interpolate(Math.cos(t * 0.8), [-1, 1], [height * 0.18, height * 0.42]);
  const cx = interpolate(Math.cos(t * 0.6 + 1), [-1, 1], [width * 0.62, width * 0.86]);
  const cy = interpolate(Math.sin(t * 0.7 + 2), [-1, 1], [height * 0.55, height * 0.82]);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${bx}px ${by}px, ${withAlpha(brand.primary, 0.20 * intensity)} 0%, transparent 42%),
                       radial-gradient(circle at ${cx}px ${cy}px, ${withAlpha(brand.secondary, 0.55 * intensity)} 0%, transparent 50%)`,
        }}
      />
      {/* grade de pontos sutil */}
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${withAlpha(brand.primary, 0.06)} 1.2px, transparent 1.2px)`,
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse at center, black 35%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 35%, transparent 78%)',
          opacity: 0.7,
        }}
      />
      {/* vinheta */}
      <AbsoluteFill
        style={{ boxShadow: `inset 0 0 ${height * 0.5}px ${withAlpha('#000814', 0.65)}` }}
      />
    </AbsoluteFill>
  );
};

/** Rótulo "eyebrow" — pequeno, caixa-alta, ciano, com um traço curto. */
export const Eyebrow: React.FC<{ children: React.ReactNode; brand: Brand; style?: React.CSSProperties }> = ({ children, brand, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...style }}>
    <div style={{ width: 46, height: 3, borderRadius: 2, background: brand.primary }} />
    <span style={{ color: brand.primary, fontSize: 26, letterSpacing: 5, fontWeight: 700, textTransform: 'uppercase' }}>
      {children}
    </span>
  </div>
);

/** Logo discreto no canto superior direito. */
export const BrandMark: React.FC<{ brand: Brand }> = () => (
  <Img
    src={staticFile('assets/logo-vertho.png')}
    style={{ position: 'absolute', top: 56, right: 72, height: 44, opacity: 0.9, filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }}
  />
);

/** Barra de progresso global, fina e discreta, na base. */
export const ProgressBar: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = Math.min(1, frame / Math.max(1, durationInFrames - 1));
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: withAlpha('#ffffff', 0.06) }}>
      <div style={{ width: `${p * 100}%`, height: '100%', background: `linear-gradient(90deg, ${brand.secondary}, ${brand.primary})`, boxShadow: `0 0 18px ${withAlpha(brand.primary, 0.7)}` }} />
    </div>
  );
};

// ── Ícones (SVG stroke, sem imagens raster) ─────────────────────────────────
type IconProps = { size?: number; color?: string; style?: React.CSSProperties };
const S: React.FC<IconProps & { children: React.ReactNode }> = ({ size = 40, color = 'currentColor', style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={style}>{children}</svg>
);

export const IconObserve: React.FC<IconProps> = (p) => (<S {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" /><circle cx="12" cy="12" r="2.6" /></S>);
export const IconConnect: React.FC<IconProps> = (p) => (<S {...p}><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M7.7 7.7 16.3 16.3M8.4 6h7.2M18 8.4v7.2" /></S>);
export const IconAct: React.FC<IconProps> = (p) => (<S {...p}><path d="M5 12h12" /><path d="m13 6 6 6-6 6" /><path d="M3 7v10" /></S>);
export const IconClock: React.FC<IconProps> = (p) => (<S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></S>);
export const IconChat: React.FC<IconProps> = (p) => (<S {...p}><path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8l-4 3V7a2 2 0 0 1 0-2Z" /><path d="M9 9.5h5M9 12h3" /></S>);
export const IconHourglass: React.FC<IconProps> = (p) => (<S {...p}><path d="M7 3h10M7 21h10" /><path d="M7 3c0 4 3 5 5 7 2-2 5-3 5-7" /><path d="M7 21c0-4 3-5 5-7 2 2 5 3 5 7" /></S>);
