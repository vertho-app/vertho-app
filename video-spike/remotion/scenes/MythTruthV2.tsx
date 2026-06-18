import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Brand, withAlpha } from '../theme';
import { reveal, fadeInOut, translateUp } from '../utils/timing';
import { BackgroundV2, INK, INK_DIM, ACCENT_SOFT } from '../theme-v2';
import type { ComputedScene } from '../data/load-scenes';

/**
 * Quebra de equívoco: o MITO entra, é RISCADO, e a VERDADE assume logo após.
 * Segue a convenção dos V2 (negativo = esmaecido/riscado; positivo = ciano da
 * marca) — sem cor nova, mantendo a identidade visual atual.
 */
export const MythTruthV2: React.FC<{ scene: ComputedScene; brand: Brand }> = ({ scene, brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = fadeInOut(frame, durationInFrames, 16, 22);
  const myth = scene.myth || '';
  const truth = scene.truth || '';

  // Pacear com a fala: o MITO entra cedo; o "vira" (risco→verdade) acontece por
  // volta da metade da cena, quando a narração pivota.
  const mythD = Math.round(durationInFrames * 0.06);
  const pivotD = Math.round(durationInFrames * 0.46);
  const mythP = reveal(frame, mythD, 22);
  const strikeP = interpolate(frame, [pivotD - 26, pivotD], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const truthLabP = reveal(frame, pivotD, 18);
  const truthP = reveal(frame, pivotD + 6, 36);

  return (
    <AbsoluteFill>
      <BackgroundV2 brand={brand} tone="soft" />
      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 74, opacity: out, padding: '0 200px' }}>
        {/* MITO — esmaecido e riscado */}
        <div style={{ opacity: mythP, textAlign: 'center' }}>
          <div style={{ color: INK_DIM, fontSize: 23, fontWeight: 800, letterSpacing: 6, marginBottom: 20 }}>MITO</div>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <p style={{ color: INK_DIM, fontSize: 58, fontWeight: 600, lineHeight: 1.2, maxWidth: 1280, margin: 0 }}>{myth}</p>
            <div style={{ position: 'absolute', top: '52%', left: -10, height: 5, borderRadius: 3, width: `calc((100% + 20px) * ${strikeP})`, background: withAlpha('#ffffff', 0.55) }} />
          </div>
        </div>

        {/* VERDADE — ciano da marca, assume a tela */}
        <div style={{ textAlign: 'center', transform: translateUp(truthP, 26) }}>
          <div style={{ color: ACCENT_SOFT, fontSize: 23, fontWeight: 800, letterSpacing: 6, marginBottom: 20, opacity: truthLabP }}>VERDADE</div>
          <p style={{ color: INK, fontSize: 76, fontWeight: 800, lineHeight: 1.16, letterSpacing: -1, maxWidth: 1480, margin: 0, opacity: truthP }}>{truth}</p>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
