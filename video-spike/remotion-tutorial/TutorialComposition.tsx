import React from 'react';
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import { Background, ProgressBar, BRAND, withAlpha } from '../remotion/theme';

// ── Tipos da timeline (tutorial-active.json) ────────────────────────────────
type Box = { x: number; y: number; width: number; height: number };
type Cue = { text: string; fromFrame: number; durationInFrames: number };
type DragHint = { topLabel: string; bottomLabel: string };
export type TStep = {
  id: string; index: number; total: number; title: string;
  kind: 'screen' | 'cartela';
  cartela: { eyebrow?: string; title: string } | null;
  image: string | null; bbox: Box | null; label: string | null;
  dragHint: DragHint | null;
  fromFrame: number; durationInFrames: number;
  audio: string; audioFromFrame: number; audioDurationInFrames: number;
  captions: Cue[];
};
export type TutorialData = {
  flow: string; fps: number; width: number; height: number; totalFrames: number;
  intro: { title: string; subtitle: string; durationInFrames: number };
  // `titulo`/`subtitulo` só são usados quando marca==='nenhuma' (o fecho precisa
  // de alguma assinatura no lugar do wordmark, senão fica 3s de tela vazia).
  outro: { durationInFrames: number; fromFrame: number; titulo?: string; subtitulo?: string };
  /**
   * Marca do vídeo. 'vertho' (default) = wordmark no canto + logo no fecho.
   * 'nenhuma' = peça sem marca da plataforma, para quando o vídeo é distribuído
   * DENTRO de um projeto de terceiro (ex.: a secretaria envia aos professores em
   * nome do projeto — o selo da fornecedora ali cria ruído institucional).
   */
  marca?: 'vertho' | 'nenhuma';
  steps: TStep[];
};

// Geometria da "janela" do app dentro do frame 1920×1080.
const CARD_W = 1720;
const CARD_H = Math.round((CARD_W * 1080) / 1920); // 967
const CARD_X = (1920 - CARD_W) / 2; // 100
const CARD_Y = 96;
const S = CARD_W / 1920; // escala logical→card

const LOGO = 'assets/logo-vertho.png'; // V ciano + "vertho.ai" branco, fundo transparente

const Wordmark: React.FC<{ marca?: 'vertho' | 'nenhuma' }> = ({ marca }) => (
  marca === 'nenhuma' ? null
    : <Img src={staticFile(LOGO)} style={{ position: 'absolute', top: 50, right: 76, height: 40, opacity: 0.92, filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }} />
);

// ── Callout: anel pulsante sobre a bbox (coords logical 1920×1080) ───────────
const Callout: React.FC<{ bbox: Box; label: string | null; localFrame: number }> = ({ bbox, label, localFrame }) => {
  const pad = 16;
  const appear = interpolate(localFrame, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = 0.5 + 0.5 * Math.sin((localFrame - 24) / 7);
  const glow = interpolate(pulse, [0, 1], [0.35, 0.85]);
  const x = bbox.x - pad, y = bbox.y - pad;
  const w = bbox.width + pad * 2, h = bbox.height + pad * 2;
  const labelBelow = y < 96;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: appear }}>
      <div
        style={{
          position: 'absolute', left: x, top: y, width: w, height: h,
          border: `4px solid ${BRAND.primary}`, borderRadius: 16,
          boxShadow: `0 0 ${18 + glow * 26}px ${withAlpha(BRAND.primary, glow)}, inset 0 0 0 1px ${withAlpha('#ffffff', 0.15)}`,
          transform: `scale(${interpolate(appear, [0, 1], [1.06, 1])})`, transformOrigin: 'center',
        }}
      />
      {label && (
        <div
          style={{
            position: 'absolute', left: x, top: labelBelow ? y + h + 12 : y - 52,
            background: BRAND.primary, color: '#04212a', fontWeight: 700, fontSize: 26,
            padding: '8px 16px', borderRadius: 10, whiteSpace: 'nowrap',
            boxShadow: `0 8px 24px ${withAlpha('#000814', 0.5)}`,
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

// ── Setas de direção sobre o ranking (mecânica de arrastar) ─────────────────
const DragHintOverlay: React.FC<{ localFrame: number }> = ({ localFrame }) => {
  const op = interpolate(localFrame, [14, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bob = Math.sin(localFrame / 9) * 12;
  const arrow = (y: number, dir: 'up' | 'down', color: string): React.CSSProperties => ({
    position: 'absolute', left: 1338, top: y + (dir === 'up' ? -bob : bob),
    fontSize: 64, fontWeight: 900, color, lineHeight: 1,
    textShadow: `0 0 20px ${withAlpha(color, 0.7)}`,
  });
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity: op }}>
      <div style={arrow(360, 'up', '#34d399')}>▲</div>
      <div style={arrow(600, 'down', '#fbbf24')}>▼</div>
    </div>
  );
};

// ── Uma etapa: janela do app + Ken Burns + callout + eyebrow + legenda ──────
const Step: React.FC<{ step: TStep }> = ({ step }) => {
  const frame = useCurrentFrame(); // relativo à Sequence
  const { durationInFrames, fps } = useVideoConfig();

  const enter = interpolate(frame, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const kb = interpolate(frame, [0, durationInFrames], [1.02, 1.07], { extrapolateRight: 'clamp' });
  const hx = step.bbox ? step.bbox.x + step.bbox.width / 2 : 960;
  const hy = step.bbox ? step.bbox.y + step.bbox.height / 2 : 540;

  const cue = step.captions.find((c) => frame >= c.fromFrame && frame < c.fromFrame + c.durationInFrames);

  // ── Fecho / cartela (sem janela, texto centralizado) ──────────────────────
  if (step.kind === 'cartela' && step.cartela) {
    const s = spring({ frame, fps, config: { damping: 200 } });
    return (
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: enter }}>
        <div style={{ transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`, opacity: s, textAlign: 'center' }}>
          {step.cartela.eyebrow && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ width: 40, height: 3, borderRadius: 2, background: BRAND.primary }} />
              <span style={{ color: BRAND.primary, fontSize: 24, letterSpacing: 5, fontWeight: 700, textTransform: 'uppercase' }}>{step.cartela.eyebrow}</span>
              <div style={{ width: 40, height: 3, borderRadius: 2, background: BRAND.primary }} />
            </div>
          )}
          <div style={{ color: BRAND.ink, fontSize: 84, fontWeight: 700, letterSpacing: -1, maxWidth: 1400 }}>{step.cartela.title}</div>
        </div>
        <Sequence from={step.audioFromFrame} durationInFrames={step.audioDurationInFrames + fps}>
          <Audio src={staticFile(step.audio)} />
        </Sequence>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ opacity: enter }}>
      {/* eyebrow da etapa */}
      <div style={{ position: 'absolute', left: CARD_X, top: 44, display: 'flex', alignItems: 'center', gap: 14, opacity: interpolate(frame, [4, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: BRAND.primary }} />
        <span style={{ color: BRAND.primary, fontSize: 23, letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase' }}>
          Etapa {step.index}/{step.total}
        </span>
        <span style={{ color: BRAND.ink, fontSize: 23, letterSpacing: 1, fontWeight: 600 }}>· {step.title}</span>
      </div>

      {/* janela do app */}
      <div
        style={{
          position: 'absolute', left: CARD_X, top: CARD_Y, width: CARD_W, height: CARD_H,
          borderRadius: 20, overflow: 'hidden',
          boxShadow: `0 40px 120px ${withAlpha('#000814', 0.6)}, 0 0 0 1px ${withAlpha('#ffffff', 0.08)}`,
          transform: `scale(${interpolate(enter, [0, 1], [0.992, 1])})`, transformOrigin: 'center',
        }}
      >
        {/* palco logical 1920×1080 escalado para caber na janela */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${S})`, transformOrigin: '0 0' }}>
          {/* camada Ken Burns (imagem + callout zoom juntos, origem no highlight) */}
          <div style={{ position: 'absolute', width: 1920, height: 1080, transform: `scale(${kb})`, transformOrigin: `${hx}px ${hy}px` }}>
            {step.image && <Img src={staticFile(step.image)} style={{ width: 1920, height: 1080, display: 'block' }} />}
            {step.bbox && <Callout bbox={step.bbox} label={step.label} localFrame={frame} />}
            {step.dragHint && <DragHintOverlay localFrame={frame} />}
          </div>
        </div>
      </div>

      {/* legenda (burned) */}
      {cue && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 240, background: `linear-gradient(to top, ${withAlpha('#03101f', 0.92)} 0%, ${withAlpha('#03101f', 0.55)} 55%, transparent 100%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 72, display: 'flex', justifyContent: 'center', padding: '0 240px' }}>
            <span style={{ color: BRAND.ink, fontSize: 44, lineHeight: 1.28, fontWeight: 600, textAlign: 'center', textShadow: `0 2px 14px ${withAlpha('#000814', 0.8)}`, maxWidth: 1440 }}>
              {cue.text}
            </span>
          </div>
        </>
      )}

      {/* áudio da narração (após o lead) */}
      <Sequence from={step.audioFromFrame} durationInFrames={step.audioDurationInFrames + fps}>
        <Audio src={staticFile(step.audio)} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Cartela de abertura ─────────────────────────────────────────────────────
const Intro: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: out }}>
      <div style={{ transform: `translateY(${interpolate(s, [0, 1], [24, 0])}px)`, opacity: s, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 26 }}>
          <div style={{ width: 46, height: 3, borderRadius: 2, background: BRAND.primary }} />
          <span style={{ color: BRAND.primary, fontSize: 26, letterSpacing: 6, fontWeight: 700, textTransform: 'uppercase' }}>Tutorial · Vertho</span>
          <div style={{ width: 46, height: 3, borderRadius: 2, background: BRAND.primary }} />
        </div>
        <div style={{ color: BRAND.ink, fontSize: 88, fontWeight: 700, letterSpacing: -1, maxWidth: 1500 }}>{title}</div>
        <div style={{ color: BRAND.inkDim, fontSize: 38, marginTop: 22, fontWeight: 400 }}>{subtitle}</div>
      </div>
    </AbsoluteFill>
  );
};

// ── Cartela de fecho ────────────────────────────────────────────────────────
const Outro: React.FC<{ marca?: 'vertho' | 'nenhuma'; titulo?: string; subtitulo?: string }> = ({ marca, titulo, subtitulo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200 } });
  const semMarca = marca === 'nenhuma';
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [0.94, 1])})`, opacity: s, textAlign: 'center' }}>
        {semMarca ? (
          <div style={{ color: BRAND.ink, fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>{titulo || ''}</div>
        ) : (
          <Img src={staticFile(LOGO)} style={{ width: 680, filter: `drop-shadow(0 8px 40px ${withAlpha('#000814', 0.6)})` }} />
        )}
        <div style={{ color: BRAND.inkDim, fontSize: 34, marginTop: 30 }}>
          {semMarca ? (subtitulo || '') : 'Desenvolvimento de competências por IA'}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const TutorialComposition: React.FC<TutorialData> = (data) => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.background, fontFamily: BRAND.font }}>
      <Background brand={BRAND} />
      <Wordmark marca={data.marca} />

      {data.intro.durationInFrames > 0 && (
        <Sequence from={0} durationInFrames={data.intro.durationInFrames} name="intro">
          <Intro title={data.intro.title} subtitle={data.intro.subtitle} />
        </Sequence>
      )}

      {data.steps.map((step) => (
        <Sequence key={step.id} from={step.fromFrame} durationInFrames={step.durationInFrames} name={`${step.index}·${step.id}`}>
          <Step step={step} />
        </Sequence>
      ))}

      <Sequence from={data.outro.fromFrame} durationInFrames={data.outro.durationInFrames} name="outro">
        <Outro marca={data.marca} titulo={data.outro.titulo} subtitulo={data.outro.subtitulo} />
      </Sequence>

      <ProgressBar brand={BRAND} />
    </AbsoluteFill>
  );
};
