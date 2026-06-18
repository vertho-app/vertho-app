import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from './theme';
import { reveal, translateUp } from './utils/timing';
import { BackgroundV2, BrandMarkV2, EyebrowV2, INK } from './theme-v2';

/**
 * Cena de SAUDAÇÃO nominal (Rota A) — renderizada POR PESSOA e prependada ao deck
 * genérico pelo worker. "Olá, {nome}" entra à esquerda; a FOTO da mentora desliza
 * pela direita (estática → reuso total, sem lip-sync nem custo HeyGen). A voz-over
 * (TTS Callirrhoe "Olá, {nome}!") vem por `audioSrc`. O avatar que FALA é o intro,
 * na cena seguinte. Mesmo padrão visual do deck (fundo, logo, eyebrow, tipografia).
 */
export interface GreetingProps {
  nome: string;
  audioSrc?: string;
  brand: Brand;
  photo?: string;
}

const DEFAULT_BRAND: Brand = { primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif' };

export const AvatarGreeting: React.FC<GreetingProps> = ({ nome, audioSrc, brand = DEFAULT_BRAND, photo }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const out = interpolate(frame, [0, 12, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nameIn = reveal(frame, 8, 26);

  // Foto desliza da direita (spring suave) + fade.
  const slide = spring({ frame: frame - 12, fps, config: { damping: 200, mass: 0.9 } });
  const photoX = interpolate(slide, [0, 1], [64, 0]);
  const photoOp = interpolate(frame, [12, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const AVATAR_W = 0.6;
  const src = photo || staticFile('assets/mentora.png');

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, opacity: out }}>
      <BackgroundV2 brand={brand} tone="deep" />
      <BrandMarkV2 />

      {/* Foto da mentora deslizando pela direita */}
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${AVATAR_W * 100}%`, overflow: 'hidden', transform: `translateX(${photoX}%)`, opacity: photoOp }}>
        <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '78% 34%' }} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 480, background: `linear-gradient(90deg, ${brand.background} 0%, ${withAlpha(brand.background, 0.55)} 48%, transparent 100%)` }} />
      </div>

      {/* "Olá, {nome}" à esquerda */}
      <div style={{ position: 'absolute', left: 132, top: 0, bottom: 0, width: '46%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ opacity: nameIn, transform: translateUp(nameIn, 30) }}>
          <EyebrowV2 brand={brand}>Mentoria Vertho</EyebrowV2>
          <h1 style={{ margin: '26px 0 0', color: INK, fontSize: 108, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2.6 }}>Olá, {nome}</h1>
          <div style={{ height: 4, width: nameIn * 150, marginTop: 28, borderRadius: 2, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />
        </div>
      </div>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
