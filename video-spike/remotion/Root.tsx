import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { VideoCompositionV2, type SpikePropsV2 } from './VideoCompositionV2';
import { loadComputed, type SpikeProps } from './data/load-scenes';

// Calcula a partir das durações reais (probe) + offsets. defaultProps cobre o
// estado inicial; calculateMetadata recomputa (durations.json pode ter mudado).
const initial = loadComputed();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* V1 — preservada */}
      <Composition
        id="VerthoVideoSpike"
        component={VideoComposition}
        durationInFrames={initial.totalFrames}
        fps={initial.fps}
        width={initial.width}
        height={initial.height}
        defaultProps={initial as SpikeProps}
        calculateMetadata={() => {
          const d = loadComputed();
          return { durationInFrames: d.totalFrames, fps: d.fps, width: d.width, height: d.height, props: d };
        }}
      />

      {/* V2 — acabamento profissional (safe area do avatar, legendas discretas, cenas mais vivas) */}
      <Composition
        id="VerthoVideoSpikeV2"
        component={VideoCompositionV2}
        durationInFrames={initial.totalFrames}
        fps={initial.fps}
        width={initial.width}
        height={initial.height}
        defaultProps={{ ...initial, showBurnedCaptions: true } as SpikePropsV2}
        calculateMetadata={({ props }) => {
          const d = loadComputed();
          return {
            durationInFrames: d.totalFrames,
            fps: d.fps,
            width: d.width,
            height: d.height,
            props: { ...d, showBurnedCaptions: (props as SpikePropsV2).showBurnedCaptions ?? true },
          };
        }}
      />
    </>
  );
};
