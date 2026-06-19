import React from 'react';
import { Composition } from 'remotion';
import { VideoCompositionV3 } from './VideoCompositionV3';
import { loadComputedV3, type SpikePropsV3 } from './data/load-scenes-v3';
import { AvatarGreeting, DEFAULT_BRAND, type GreetingProps } from './AvatarGreeting';

// Estado inicial p/ abrir o Studio; calculateMetadata recomputa em runtime.
const initialV3 = loadComputedV3();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* V3 — preview de dev no Studio (lê assets estáticos via loadComputedV3) */}
      <Composition
        id="VerthoVideoSpikeV3"
        component={VideoCompositionV3}
        durationInFrames={initialV3.totalFrames}
        fps={initialV3.fps}
        width={initialV3.width}
        height={initialV3.height}
        defaultProps={initialV3 as SpikePropsV3}
        calculateMetadata={({ props }) => {
          const d = loadComputedV3();
          return {
            durationInFrames: d.totalFrames,
            fps: d.fps,
            width: d.width,
            height: d.height,
            props: { ...d, showBurnedCaptions: (props as SpikePropsV3).showBurnedCaptions ?? true, wordHighlight: (props as SpikePropsV3).wordHighlight ?? d.wordHighlight },
          };
        }}
      />

      {/* PRODUTO — recebe TUDO via inputProps (URLs remotas + timeline já computada).
          Não lê assets estáticos: calculateMetadata confia nos props injetados pelo
          orquestrador (montar-inputprops.ts). defaultProps = V3 só pra abrir o Studio. */}
      <Composition
        id="VerthoVideo"
        component={VideoCompositionV3}
        durationInFrames={initialV3.totalFrames}
        fps={initialV3.fps}
        width={initialV3.width}
        height={initialV3.height}
        defaultProps={initialV3 as SpikePropsV3}
        calculateMetadata={({ props }) => {
          const p = props as SpikePropsV3;
          return {
            durationInFrames: p.totalFrames || initialV3.totalFrames,
            fps: p.fps || initialV3.fps,
            width: p.width || initialV3.width,
            height: p.height || initialV3.height,
            props: p,
          };
        }}
      />

      {/* SAUDAÇÃO nominal (Rota A) — renderizada por pessoa e prependada ao deck.
          duração vem por props (≈ áudio do nome + folga). */}
      <Composition
        id="AvatarGreeting"
        component={AvatarGreeting}
        durationInFrames={100}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ nome: 'Bárbara', brand: DEFAULT_BRAND } as GreetingProps}
        calculateMetadata={({ props }) => {
          const p = props as GreetingProps & { durationInFrames?: number; fps?: number; width?: number; height?: number };
          return { props, durationInFrames: p.durationInFrames || 100, fps: p.fps || 30, width: p.width || 1920, height: p.height || 1080 };
        }}
      />
    </>
  );
};
