import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, INK, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/**
 * Pergunta de reflexão no MEIO do vídeo — respiro que reengaja, espelhando o
 * conceito na rotina do espectador. NÃO substitui o avatar_outro (que fecha com
 * a pergunta acionável da semana); esta é leve e provocativa.
 */
export const ReflectionPromptV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 18, 22);
  const tagP = reveal(frame, 8, 20);
  const promptP = reveal(frame, 18, 44);
  const pulse = 0.5 + 0.5 * Math.sin(frame / 14);
  const texto = scene.prompt || scene.title || '';
  const tag = scene.tag || 'Pra pensar';

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 240px' }}>
        {/* motivo de sinal — pulso ciano */}
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: brand.primary, marginBottom: 54, opacity: tagP, boxShadow: `0 0 ${10 + pulse * 28}px ${withAlpha(brand.primary, 0.5 + pulse * 0.4)}` }} />
        <div style={{ color: ACCENT_SOFT, fontSize: 24, fontWeight: 800, letterSpacing: 6, marginBottom: 34, opacity: tagP, textTransform: 'uppercase' }}>{tag}</div>
        <p style={{ margin: 0, color: INK, fontSize: 82, fontWeight: 700, textAlign: 'center', maxWidth: 1440, lineHeight: 1.2, letterSpacing: -1, opacity: promptP, transform: translateUp(promptP, 28) }}>{texto}</p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
