import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import type { ComputedScene, SpikeProps, Brand } from './data/load-scenes';
import { AvatarClip } from './scenes/AvatarClip';
import { ConceptReveal } from './scenes/ConceptReveal';
import { ComparisonMotion } from './scenes/ComparisonMotion';
import { IconStory } from './scenes/IconStory';
import { Captions } from './scenes/Captions';
import { BRAND, BrandMark, ProgressBar } from './theme';

function renderScene(scene: ComputedScene, brand: Brand) {
  switch (scene.type) {
    case 'avatar_intro':
      return <AvatarClip scene={scene} brand={brand} kicker="Mentoria Vertho" />;
    case 'avatar_outro':
      return <AvatarClip scene={scene} brand={brand} kicker="Para a sua prática" />;
    case 'concept_reveal':
      return <ConceptReveal scene={scene} brand={brand} />;
    case 'comparison_motion':
      return <ComparisonMotion scene={scene} brand={brand} />;
    case 'icon_story':
      return <IconStory scene={scene} brand={brand} />;
    default:
      return null;
  }
}

export const VideoComposition: React.FC<SpikeProps> = ({ scenes, captions, brand }) => {
  const b: Brand = { ...BRAND, ...brand };
  return (
    <AbsoluteFill style={{ backgroundColor: b.background, fontFamily: BRAND.font }}>
      {scenes.map((s) => (
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames} name={`${s.id} · ${s.type}`}>
          {renderScene(s, b)}
        </Sequence>
      ))}

      {/* Camadas globais (sobre todas as cenas) */}
      <Captions cues={captions} brand={b} />
      <BrandMark brand={b} />
      <ProgressBar brand={b} />
    </AbsoluteFill>
  );
};
