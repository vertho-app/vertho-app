import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { activeCue, CaptionCue } from '../utils/captions';
import { Brand, withAlpha } from '../theme';
import { INK, FONT } from '../theme-v2';

/**
 * Legendas V2 — discretas: fonte ~18% menor que a V1, fundo bem mais translúcido,
 * largura limitada a ~66% da tela e margem inferior segura. Pensada para no
 * futuro ser substituída por SRT/VTT externo (ver cuesToSrt em utils/captions).
 */
export const CaptionsV2: React.FC<{ cues: CaptionCue[]; brand: Brand }> = ({ cues, brand }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const cue = activeCue(cues, frame);
  if (!cue) return null;

  const local = frame - cue.fromFrame;
  const len = cue.toFrame - cue.fromFrame;
  const opacity = Math.max(0, Math.min(Math.min(1, local / 7), Math.min(1, (len - local) / 7)));

  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 84, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        style={{
          maxWidth: Math.round(width * 0.66),
          opacity,
          transform: `translateY(${(1 - Math.min(1, local / 7)) * 10}px)`,
          background: withAlpha('#04101f', 0.44),
          border: `1px solid ${withAlpha(brand.primary, 0.16)}`,
          borderRadius: 14,
          padding: '12px 26px',
          textAlign: 'center',
          backdropFilter: 'blur(3px)',
        }}
      >
        <span style={{ color: INK, fontSize: 33, lineHeight: 1.34, fontWeight: 500, fontFamily: FONT, opacity: 0.92 }}>
          {cue.text}
        </span>
      </div>
    </div>
  );
};
