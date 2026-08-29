import React from 'react';
import { Composition } from 'remotion';
import { TutorialComposition, type TutorialData } from './TutorialComposition';
import data from './tutorial-active.json';

// A timeline é gerada por video-spike/tutorial/build.mts (tutorial-active.json).
// Cada flow re-escreve esse arquivo antes do render.
export const RemotionRoot: React.FC = () => {
  const d = data as unknown as TutorialData;
  return (
    <Composition
      id="VerthoTutorial"
      component={TutorialComposition}
      durationInFrames={d.totalFrames}
      fps={d.fps}
      width={d.width}
      height={d.height}
      defaultProps={d as unknown as Record<string, unknown> as TutorialData}
    />
  );
};
