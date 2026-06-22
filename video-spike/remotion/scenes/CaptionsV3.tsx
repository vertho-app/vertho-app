import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { INK, FONT } from '../theme-v2';
import type { AbsCaption } from '../captions/captions-core';
import type { ComputedScene } from '../data/load-scenes';

function activeCaption(caps: AbsCaption[], frame: number): AbsCaption | null {
  return caps.find((c) => frame >= c.startFrame && frame < c.endFrame) || null;
}

/**
 * Legendas V3: dirigidas por timestamps reais (start/endFrame absolutos). Estilo
 * discreto (V2 refinado), 2 linhas no máx, largura ≤66%. Word-highlight ciano
 * opcional (sutil, sem piscar). Em cena de avatar, desloca à esquerda para nunca
 * cobrir o rosto (que fica à direita).
 */
export const CaptionsV3: React.FC<{
  captions: AbsCaption[];
  scenes: ComputedScene[];
  brand: Brand;
  wordHighlight: boolean;
}> = ({ captions, scenes, brand, wordHighlight }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const cue = activeCaption(captions, frame);
  if (!cue) return null;

  const local = frame - cue.startFrame;
  const len = cue.endFrame - cue.startFrame;
  const opacity = Math.max(0, Math.min(Math.min(1, local / 7), Math.min(1, (len - local) / 7)));

  // Cena atual é avatar? → desloca a legenda para a esquerda (rosto à direita).
  const sc = scenes.find((s) => frame >= s.fromFrame && frame < s.fromFrame + s.durationInFrames);
  const isAvatar = !!sc && String(sc.type).startsWith('avatar');

  const tokens = cue.text.split(/\s+/);
  const useHighlight = wordHighlight && Array.isArray(cue.words) && cue.words.length === tokens.length;
  const activeWordIdx = useHighlight ? cue.words!.findIndex((w) => frame >= w.startFrame && frame < w.endFrame) : -1;

  const box = (
    <div
      style={{
        maxWidth: Math.round(width * 0.66),
        opacity,
        transform: `translateY(${(1 - Math.min(1, local / 7)) * 10}px)`,
        background: withAlpha('#04101f', 0.46),
        border: `1px solid ${withAlpha(brand.primary, 0.16)}`,
        borderRadius: 14,
        padding: '12px 26px',
        textAlign: 'center',
        // SEM backdrop-filter blur: é caríssimo no software rasterizer (readback+blur
        // por frame) e fica invisível sob o scrim de 46% → removido (corte de custo).
      }}
    >
      <span style={{ fontSize: 32, lineHeight: 1.34, fontWeight: 500, fontFamily: FONT }}>
        {useHighlight
          ? tokens.map((tk, i) => (
              <span key={i} style={{ color: i === activeWordIdx ? brand.primary : INK, opacity: i === activeWordIdx ? 1 : 0.9 }}>
                {tk}{i < tokens.length - 1 ? ' ' : ''}
              </span>
            ))
          : <span style={{ color: INK, opacity: 0.92 }}>{cue.text}</span>}
      </span>
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 84,
        display: 'flex',
        justifyContent: isAvatar ? 'flex-start' : 'center',
        paddingLeft: isAvatar ? 130 : 0,
        pointerEvents: 'none',
      }}
    >
      {box}
    </div>
  );
};
