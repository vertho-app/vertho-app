import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ComputedScene, Brand } from './data/load-scenes';
import type { SpikePropsV3 } from './data/load-scenes-v3';
import { AvatarClipV2 } from './scenes/AvatarClipV2';
import { ConceptRevealV2 } from './scenes/ConceptRevealV2';
import { ComparisonMotionV2 } from './scenes/ComparisonMotionV2';
import { IconStoryV2 } from './scenes/IconStoryV2';
import { StatHighlightV2 } from './scenes/StatHighlightV2';
import { QuoteSpotlightV2 } from './scenes/QuoteSpotlightV2';
import { StepsFlowV2 } from './scenes/StepsFlowV2';
import { ScenarioCardV2 } from './scenes/ScenarioCardV2';
import { CaptionsV3 } from './scenes/CaptionsV3';
import { BRAND } from './theme';
import { BackgroundV2, BrandMarkV2, ProgressBarV2 } from './theme-v2';

// VISUAL apenas — o áudio é controlado de forma centralizada por <SceneAudio>.
// (As cenas de áudio recebem audio={false} para não emitir <Audio> internamente.)
function renderSceneVisual(scene: ComputedScene, brand: Brand) {
  switch (scene.type) {
    case 'avatar_intro':
      return <AvatarClipV2 scene={scene} brand={brand} kicker="Mentoria Vertho" />;
    case 'avatar_outro':
      return <AvatarClipV2 scene={scene} brand={brand} kicker="Para a sua prática" emphasizeSubtitle />;
    case 'concept_reveal':
      return <ConceptRevealV2 scene={scene} brand={brand} audio={false} />;
    case 'comparison_motion':
      return <ComparisonMotionV2 scene={scene} brand={brand} audio={false} />;
    case 'icon_story':
      return <IconStoryV2 scene={scene} brand={brand} audio={false} />;
    case 'stat_highlight':
      return <StatHighlightV2 scene={scene} brand={brand} />;
    case 'quote_spotlight':
      return <QuoteSpotlightV2 scene={scene} brand={brand} />;
    case 'steps_flow':
      return <StepsFlowV2 scene={scene} brand={brand} />;
    case 'scenario_card':
      return <ScenarioCardV2 scene={scene} brand={brand} />;
    default:
      return null;
  }
}

/**
 * POLÍTICA DE ÁUDIO V3 — exatamente UMA fonte ativa por cena, sempre DENTRO da
 * Sequence da cena (corte limpo por cena, sem crossfade de áudio):
 *  - avatar_intro / avatar_outro: a VOZ vem do MP4 (OffthreadVideo no AvatarClipV2).
 *    NENHUM <Audio> adicional.
 *  - concept / comparison / icon: UM <Audio> do MP3, recortado ao tamanho real do
 *    áudio (trimAfter) e ainda limitado pela durationInFrames da Sequence.
 */
const SceneAudio: React.FC<{ scene: ComputedScene; fps: number }> = ({ scene, fps }) => {
  if (scene.type.startsWith('avatar')) return null;
  if (!scene.src) return null;
  return <Audio src={scene.src} trimAfter={Math.max(1, Math.round(scene.seconds * fps))} />;
};

const FilmFade: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [0, 18, durationInFrames - 18, durationInFrames], [1, 0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0.001) return null;
  return <AbsoluteFill style={{ backgroundColor: brand.background, opacity: o, pointerEvents: 'none' }} />;
};

/** V3 = visual da V2 + legendas sincronizadas por timestamps (CaptionsV3). */
export const VideoCompositionV3: React.FC<SpikePropsV3> = ({ scenes, captions, brand, fps, showBurnedCaptions, wordHighlight }) => {
  const b: Brand = { ...BRAND, ...brand };
  return (
    <AbsoluteFill style={{ backgroundColor: b.background, fontFamily: BRAND.font }}>
      <BackgroundV2 brand={b} tone="deep" />

      {scenes.map((s) => (
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames} name={`${s.id} · ${s.type}`}>
          {renderSceneVisual(s, b)}
          <SceneAudio scene={s} fps={fps} />
        </Sequence>
      ))}

      {showBurnedCaptions && <CaptionsV3 captions={captions} scenes={scenes} brand={b} wordHighlight={wordHighlight} />}
      <BrandMarkV2 />
      <ProgressBarV2 brand={b} />
      <FilmFade brand={b} />
    </AbsoluteFill>
  );
};
