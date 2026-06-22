import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
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
import { MaturityLadderV2 } from './scenes/MaturityLadderV2';
import { MythTruthV2 } from './scenes/MythTruthV2';
import { DefinitionCardV2 } from './scenes/DefinitionCardV2';
import { ReflectionPromptV2 } from './scenes/ReflectionPromptV2';
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
    case 'maturity_ladder':
      return <MaturityLadderV2 scene={scene} brand={brand} />;
    case 'myth_truth':
      return <MythTruthV2 scene={scene} brand={brand} />;
    case 'definition_card':
      return <DefinitionCardV2 scene={scene} brand={brand} />;
    case 'reflection_prompt':
      return <ReflectionPromptV2 scene={scene} brand={brand} />;
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
  // Avatar: áudio = mp3 da narração (vídeo mp4 entra mutado) → lip-sync preciso,
  // sem o offset do áudio embutido do OffthreadVideo. Demais cenas: mp3 da cena.
  const url = scene.type.startsWith('avatar') ? scene.audioSrc : scene.src;
  if (!url) return null;
  return <Audio src={url} trimAfter={Math.max(1, Math.round(scene.seconds * fps))} />;
};

// ARCO — a cena de pico (is_peak) "incha" sutilmente ao entrar: a restrição
// quebra UMA vez (escala maior) pra o pico ler como pico por contraste. Tudo o
// mais permanece em escala 1. Frame é relativo à Sequence da cena (reseta a 0).
const PeakScale: React.FC<{ active?: boolean; children: React.ReactNode }> = ({ active, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!active) return <>{children}</>;
  const grow = interpolate(frame, [0, Math.min(28, durationInFrames)], [1, 1.06], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <AbsoluteFill style={{ transform: `scale(${grow})`, transformOrigin: 'center center' }}>{children}</AbsoluteFill>;
};

const FilmFade: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(frame, [0, 18, durationInFrames - 18, durationInFrames], [1, 0, 0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0.001) return null;
  return <AbsoluteFill style={{ backgroundColor: brand.background, opacity: o, pointerEvents: 'none' }} />;
};

// ── CAMADA DE SOM (archetype-level) — só os SFX por template vivem no Remotion.
// A TRILHA (beds), o ducking sidechain e o master -14 LUFS rodam no passo de
// áudio (ffmpeg, lib/video/masterizar-audio), portável p/ a worker Hetzner.
// SFX = pacote do caderno de produção sonora (sintetizados em D maior).
const SFX = {
  logo: 'audio/logo.mp3',
  tick: 'audio/pack/sfx_sinal_tick.wav',
  transicao: 'audio/pack/sfx_transicao_suave.wav',
  countup: 'audio/pack/sfx_stat_countup.wav',
  mito: 'audio/pack/sfx_mito_risco.wav',
  verdade: 'audio/pack/sfx_verdade_chime.wav',
  seta: 'audio/pack/sfx_seta_transformacao.wav',
  pad: 'audio/pack/sfx_tela_limpa_pad.wav',
};
const TICK_TYPES = new Set(['concept_reveal', 'steps_flow', 'maturity_ladder']);
const PAD_TYPES = new Set(['quote_spotlight', 'scenario_card']);
const VOL = { logo: 0.5, transicao: 0.4, tick: 0.5, countup: 0.5, mito: 0.5, verdade: 0.55, seta: 0.45, pad: 0.4 };

const SoundLayer: React.FC<{ scenes: ComputedScene[]; fps: number }> = ({ scenes, fps }) => {
  const f = (s: number) => Math.max(1, Math.round(s * fps));
  // o gatilho do SFX casa com o início da FALA da cena (janela Whisper); senão, o começo.
  const cue = (s: ComputedScene) => s.fromFrame + Math.max(0, s.speechStartFrame ?? 0);
  return (
    <>
      {scenes.flatMap((s) => {
        const out: React.ReactNode[] = [];
        // (sem whoosh de transição entre cenas — removido a pedido; soava ruim)
        if (s.type === 'avatar_intro')
          out.push(<Sequence key={s.id + '-lg'} from={s.fromFrame} durationInFrames={f(2.31)}><Audio src={staticFile(SFX.logo)} volume={VOL.logo} /></Sequence>);
        if (s.type === 'avatar_outro')
          out.push(<Sequence key={s.id + '-lg'} from={Math.max(s.fromFrame, s.fromFrame + s.durationInFrames - f(2.31))} durationInFrames={f(2.31)}><Audio src={staticFile(SFX.logo)} volume={VOL.logo} /></Sequence>);
        if (TICK_TYPES.has(s.type))
          out.push(<Sequence key={s.id + '-tk'} from={cue(s) + f(0.2)} durationInFrames={f(0.5)}><Audio src={staticFile(SFX.tick)} volume={VOL.tick} /></Sequence>);
        if (s.type === 'stat_highlight')
          out.push(<Sequence key={s.id + '-cu'} from={cue(s)} durationInFrames={f(2)}><Audio src={staticFile(SFX.countup)} volume={VOL.countup} /></Sequence>);
        if (s.type === 'myth_truth') {
          out.push(<Sequence key={s.id + '-mi'} from={cue(s)} durationInFrames={f(0.8)}><Audio src={staticFile(SFX.mito)} volume={VOL.mito} /></Sequence>);
          out.push(<Sequence key={s.id + '-ve'} from={s.fromFrame + Math.round(s.durationInFrames * 0.55)} durationInFrames={f(1.2)}><Audio src={staticFile(SFX.verdade)} volume={VOL.verdade} /></Sequence>);
        }
        if (s.type === 'comparison_motion')
          out.push(<Sequence key={s.id + '-se'} from={cue(s)} durationInFrames={f(1)}><Audio src={staticFile(SFX.seta)} volume={VOL.seta} /></Sequence>);
        if (PAD_TYPES.has(s.type))
          out.push(<Sequence key={s.id + '-pd'} from={s.fromFrame} durationInFrames={f(2)}><Audio src={staticFile(SFX.pad)} volume={VOL.pad} /></Sequence>);
        return out;
      })}
    </>
  );
};

/** V3 = visual da V2 + legendas sincronizadas por timestamps (CaptionsV3). */
export const VideoCompositionV3: React.FC<SpikePropsV3> = ({ scenes, captions, brand, fps, showBurnedCaptions, wordHighlight }) => {
  const b: Brand = { ...BRAND, ...brand };
  return (
    <AbsoluteFill style={{ backgroundColor: b.background, fontFamily: BRAND.font }}>
      <BackgroundV2 brand={b} tone="deep" />

      {scenes.map((s) => (
        <Sequence key={s.id} from={s.fromFrame} durationInFrames={s.durationInFrames} name={`${s.id} · ${s.type}${s.is_peak ? ' · PICO' : ''}`}>
          <PeakScale active={s.is_peak}>{renderSceneVisual(s, b)}</PeakScale>
          <SceneAudio scene={s} fps={fps} />
        </Sequence>
      ))}

      <SoundLayer scenes={scenes} fps={fps} />

      {showBurnedCaptions && <CaptionsV3 captions={captions} scenes={scenes} brand={b} wordHighlight={wordHighlight} />}
      <BrandMarkV2 />
      <ProgressBarV2 brand={b} />
      <FilmFade brand={b} />
    </AbsoluteFill>
  );
};
