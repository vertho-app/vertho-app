import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ComputedScene, SpikeProps, Brand } from './data/load-scenes';
import { AvatarClipV2 } from './scenes/AvatarClipV2';
import { ConceptRevealV2 } from './scenes/ConceptRevealV2';
import { ComparisonMotionV2 } from './scenes/ComparisonMotionV2';
import { IconStoryV2 } from './scenes/IconStoryV2';
import { CaptionsV2 } from './scenes/CaptionsV2';
import { BRAND } from './theme';
import { BackgroundV2, BrandMarkV2, ProgressBarV2 } from './theme-v2';

// Props da V2 = props do spike + flag de legenda queimada (preparada para no
// futuro usar SRT/VTT externo em vez de queimar a legenda no vídeo).
export type SpikePropsV2 = SpikeProps & { showBurnedCaptions: boolean };

function renderScene(scene: ComputedScene, brand: Brand) {
  switch (scene.type) {
    case 'avatar_intro':
      return <AvatarClipV2 scene={scene} brand={brand} kicker="Mentoria Vertho" />;
    case 'avatar_outro':
      return <AvatarClipV2 scene={scene} brand={brand} kicker="Para a sua prática" emphasizeSubtitle />;
    case 'concept_reveal':
      return <ConceptRevealV2 scene={scene} brand={brand} />;
    case 'comparison_motion':
      return <ComparisonMotionV2 scene={scene} brand={brand} />;
    case 'icon_story':
      return <IconStoryV2 scene={scene} brand={brand} />;
    default:
      return null;
  }
}

/** Fade premium de abertura/fecho do filme inteiro. */
const FilmFade: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [0, 18, durationInFrames - 18, durationInFrames], [1, 0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0.001) return null;
  return <AbsoluteFill style={{ backgroundColor: brand.background, opacity: o, pointerEvents: 'none' }} />;
};

export const VideoCompositionV2: React.FC<SpikePropsV2> = ({ scenes, captions, brand, showBurnedCaptions }) => {
  const b: Brand = { ...BRAND, ...brand };
  return (
    <AbsoluteFill style={{ backgroundColor: b.background, fontFamily: BRAND.font }}>
      {/* fundo contínuo por baixo de tudo → trocas de cena soam suaves, não cortes secos */}
      <BackgroundV2 brand={b} tone="deep" />

      {scenes.map((s) => (
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames} name={`${s.id} · ${s.type}`}>
          {renderScene(s, b)}
        </Sequence>
      ))}

      {/* Camadas globais */}
      {showBurnedCaptions && <CaptionsV2 cues={captions} brand={b} />}
      <BrandMarkV2 />
      <ProgressBarV2 brand={b} />
      <FilmFade brand={b} />
    </AbsoluteFill>
  );
};
