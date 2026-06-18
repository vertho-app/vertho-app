import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './VideoComposition';
import { VideoCompositionV2, type SpikePropsV2 } from './VideoCompositionV2';
import { VideoCompositionV3 } from './VideoCompositionV3';
import { loadComputed, type SpikeProps } from './data/load-scenes';
import { loadComputedV3, type SpikePropsV3 } from './data/load-scenes-v3';
import { AvatarGreeting, type GreetingProps } from './AvatarGreeting';

const GREETING_BRAND = { primary: '#6D28D9', secondary: '#0EA5E9', background: '#0B1020', font: 'Inter, system-ui, sans-serif' };

// Calcula a partir das durações reais (probe) + offsets. defaultProps cobre o
// estado inicial; calculateMetadata recomputa (durations.json pode ter mudado).
const initial = loadComputed();
const initialV3 = loadComputedV3();

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

      {/* V3 — legendas sincronizadas por timestamps reais (mesma timeline do SRT/VTT) */}
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
        defaultProps={{ nome: 'Bárbara', brand: GREETING_BRAND } as GreetingProps}
        calculateMetadata={({ props }) => {
          const p = props as GreetingProps & { durationInFrames?: number; fps?: number; width?: number; height?: number };
          return { props, durationInFrames: p.durationInFrames || 100, fps: p.fps || 30, width: p.width || 1920, height: p.height || 1080 };
        }}
      />
    </>
  );
};
