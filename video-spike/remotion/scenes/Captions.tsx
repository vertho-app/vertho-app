import React from 'react';
import { useCurrentFrame } from 'remotion';
import { activeCue, CaptionCue } from '../utils/captions';
import { Brand, BRAND, withAlpha } from '../theme';

/**
 * Legenda global: lê a linha do tempo de cues (frames absolutos) e mostra o
 * segmento ativo num painel translúcido na base, com fade suave de entrada/saída.
 * Fica acima da barra de progresso e abaixo da zona de título das cenas.
 */
export const Captions: React.FC<{ cues: CaptionCue[]; brand: Brand }> = ({ cues, brand }) => {
  const frame = useCurrentFrame();
  const cue = activeCue(cues, frame);
  if (!cue) return null;

  const local = frame - cue.fromFrame;
  const len = cue.toFrame - cue.fromFrame;
  const fadeIn = Math.min(1, local / 6);
  const fadeOut = Math.min(1, (len - local) / 6);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 70, display: 'flex', justifyContent: 'center', padding: '0 240px', pointerEvents: 'none' }}>
      <div
        style={{
          maxWidth: 1320,
          opacity,
          transform: `translateY(${(1 - fadeIn) * 14}px)`,
          background: withAlpha('#04101f', 0.74),
          border: `1px solid ${withAlpha(brand.primary, 0.24)}`,
          borderRadius: 20,
          padding: '20px 38px',
          textAlign: 'center',
          boxShadow: `0 18px 50px ${withAlpha('#000814', 0.5)}`,
        }}
      >
        <span style={{ color: BRAND.ink, fontSize: 41, lineHeight: 1.32, fontWeight: 600, fontFamily: BRAND.font }}>
          {cue.text}
        </span>
      </div>
    </div>
  );
};
