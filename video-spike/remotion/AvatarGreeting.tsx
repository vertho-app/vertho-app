import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from './theme';
import { reveal, translateUp } from './utils/timing';
import { BackgroundV2, BrandMarkV2, EyebrowV2, INK } from './theme-v2';

/**
 * Cena de SAUDAÇÃO nominal (Rota A) — renderizada POR PESSOA e prependada ao deck
 * genérico pelo worker. Mostra APENAS o texto "Olá, {nome}" enquanto toca a
 * voz-over (TTS Callirrhoe "Olá, {nome}!"). NÃO tem avatar/foto — o avatar (que
 * fala) entra junto com o título na cena seguinte (avatar_intro). Mesmo padrão
 * visual do deck (fundo, logo, eyebrow, tipografia).
 */
export interface GreetingProps {
  nome: string;
  audioSrc?: string;
  brand: Brand;
}

const DEFAULT_BRAND: Brand = { primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif' };

export const AvatarGreeting: React.FC<GreetingProps> = ({ nome, audioSrc, brand = DEFAULT_BRAND }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const out = interpolate(frame, [0, 12, durationInFrames - 12, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nameIn = reveal(frame, 6, 26);
  const ruleIn = reveal(frame, 18, 30);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, opacity: out }}>
      <BackgroundV2 brand={brand} tone="deep" />
      <BrandMarkV2 />

      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ opacity: nameIn, transform: translateUp(nameIn, 30), textAlign: 'center' }}>
          <EyebrowV2 brand={brand} center>Mentoria Vertho</EyebrowV2>
          <h1 style={{ margin: '30px 0 0', color: INK, fontSize: 120, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2.8 }}>Olá, {nome}</h1>
        </div>
        <div style={{ height: 4, width: ruleIn * 200, marginTop: 34, borderRadius: 2, background: `linear-gradient(90deg, ${withAlpha(brand.primary, 0)}, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />
      </AbsoluteFill>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
