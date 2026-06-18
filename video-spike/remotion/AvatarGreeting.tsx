import React from 'react';
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from './theme';
import { reveal, translateUp } from './utils/timing';
import { BackgroundV2, BrandMarkV2, EyebrowV2, INK } from './theme-v2';

/**
 * Cena de SAUDAÇÃO nominal (Rota A) — renderizada POR PESSOA e prependada ao deck.
 * Usa o MESMO layout do avatar_intro (logo + eyebrow + título grande à ESQUERDA),
 * só que com "Olá, {nome}" no lugar do título e SEM avatar — assim o corte pro
 * avatar_intro é contínuo (o nome vira título e a mentora entra à direita). A
 * voz-over (TTS Callirrhoe "Olá, {nome}!") vem por `audioSrc`. Duração justa (a
 * personalização dimensiona ≈ áudio + folga curta).
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

  // Só fade-IN da cena; a SAÍDA é feita por crossfade (xfade) com o avatar_intro
  // na personalização — por isso não há fade-out aqui (evita flash/duplo-fade).
  const out = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nameIn = reveal(frame, 4, 22);
  const ruleIn = reveal(frame, 14, 26);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, opacity: out }}>
      <BackgroundV2 brand={brand} tone="deep" />
      <BrandMarkV2 />

      {/* Mesma coluna de texto do avatar_intro (esquerda, centralizada na vertical) */}
      <div style={{ position: 'absolute', left: 132, top: 0, bottom: 0, width: '52%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ opacity: nameIn, transform: translateUp(nameIn, 40) }}>
          <EyebrowV2 brand={brand}>Mentoria Vertho</EyebrowV2>
          <h1 style={{ margin: '28px 0 0', color: INK, fontSize: 104, fontWeight: 800, lineHeight: 1.0, letterSpacing: -2.2 }}>Olá, {nome}</h1>
          <div style={{ height: 4, width: ruleIn * 150, marginTop: 28, borderRadius: 2, background: `linear-gradient(90deg, ${brand.primary}, ${withAlpha(brand.primary, 0)})` }} />
        </div>
      </div>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
