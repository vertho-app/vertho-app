import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp, cueDelay } from '../utils/timing';
import { BackgroundV2, EyebrowV2, INK } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/**
 * DIAGRAMA DE DADOS — painel geométrico (estilo dashboard) que transforma uma
 * lista de dimensões/fatores/sinais em CARDS, em vez de texto corrido. Cada card:
 * índice em chip Cyan/Teal + label + caption opcional + uma barra-acento decorativa
 * que se desenha. Fundo Dark Navy. NÃO é gráfico estatístico — sem números
 * inventados: as barras são acento visual, não valor. Entradas DISTRIBUÍDAS ao
 * longo da fala (cueDelay) para acompanhar a narração.
 */
export const DataDiagramV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 20);
  const cells = (scene.cells || []).slice(0, 4);
  const n = Math.max(1, cells.length);
  const title = reveal(frame, 8, 24);
  const cols = n <= 2 ? n : n === 4 ? 2 : 3;

  const cue = (i: number) => cueDelay(durationInFrames, i, n, scene.speechStartFrame, scene.speechEndFrame);

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="deep" />
      <AbsoluteFill style={{ flexDirection: 'column', justifyContent: 'center', padding: '0 140px', opacity: out }}>
        <div style={{ opacity: title }}>
          <EyebrowV2 brand={brand}>Em síntese</EyebrowV2>
          <h1 style={{ margin: '20px 0 64px', color: INK, fontSize: 76, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05, transform: translateUp(title, 30) }}>{scene.title}</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 30 }}>
          {cells.map((cell, i) => {
            const p = reveal(frame, cue(i), 22);
            const barP = reveal(frame, cue(i) + 6, 26);
            return (
              <div key={i} style={{
                position: 'relative', display: 'flex', flexDirection: 'column', minHeight: 232,
                background: withAlpha('#ffffff', 0.035), border: `1px solid ${withAlpha(brand.primary, p * 0.28)}`,
                borderRadius: 24, padding: '34px 36px 30px', opacity: p, transform: `translateY(${(1 - p) * 26}px)`,
              }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 13, flexShrink: 0,
                  background: withAlpha(brand.primary, 0.16), color: brand.primary,
                  display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 26, fontVariantNumeric: 'tabular-nums',
                }}>{i + 1}</div>
                <div style={{ color: INK, fontSize: 42, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>{cell.label}</div>
                {cell.caption && (
                  <div style={{ color: withAlpha(INK, 0.62), fontSize: 27, marginTop: 12, lineHeight: 1.3 }}>{cell.caption}</div>
                )}
                <div style={{
                  marginTop: 'auto', height: 6, borderRadius: 99, width: interpolate(barP, [0, 1], [0, 88]),
                  background: brand.primary, boxShadow: `0 0 16px ${withAlpha(brand.primary, 0.5)}`,
                }} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
