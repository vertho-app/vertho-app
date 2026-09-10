/**
 * Funde storyboard + out/disc.frames.json + out/disc.audio.json numa timeline
 * (30fps, 1920×1080) para UM corte ('app' | 'ajuda'), e fatia as legendas.
 * Grava em remotion-tutorial/tutorial-active.json (importado pela composição).
 *
 * Rodar:  npx tsx video-spike/tutorial/build.mts app   |   ...build.mts ajuda
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS, type Flow, type Cut } from './storyboard';
import { validarClipsTutorial, clipAtual, sha256, type TutorialAudioManifest } from './narration-config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(process.env.TUTORIAL_OUT_DIR || path.join(HERE, 'out'));
const FRAMES_DIR = path.resolve(process.env.TUTORIAL_FRAMES_DIR || OUT_DIR);
const PUBLIC_DIR = path.resolve(process.env.TUTORIAL_PUBLIC_DIR || path.join(HERE, '../..', 'public', 'video-spike'));

const FPS = 30, W = 1920, H = 1080;
const LEAD = 0.4, TAIL = 0.8, INTRO_S = 0, OUTRO_S = 3.0, MAX_WORDS = 9; // sem cartela silenciosa: a abertura narrada (beat) abre
// Folgas por flow. O `boasvindas` tem TETO DURO de 2 min (12 beats): 0,45s a
// menos por beat + 0,5s no outro é o que faz a soma caber sem espremer o texto.
const RITMO: Record<string, { lead: number; tail: number; outro: number }> = {
  boasvindas: { lead: 0.35, tail: 0.45, outro: 2.5 },
};

// Marca por flow. Default = 'vertho' (wordmark no canto + logo no fecho).
// `macae`: a peça é enviada pela Secretaria/Foresea aos professores em nome do
// projeto — o selo da plataforma ali cria ruído institucional (decisão do dono,
// 06/08). Sem marca, o fecho precisa de assinatura própria, senão fica vazio.
const MARCA_POR_FLOW: Record<string, { marca: 'vertho' | 'nenhuma'; outroTitulo?: string; outroSub?: string }> = {
  macae: {
    marca: 'nenhuma',
    outroTitulo: 'Projeto Educação Integral',
    outroSub: 'Secretaria Municipal de Educação de Macaé',
  },
};
const f = (s: number) => Math.round(s * FPS);

type Box = { x: number; y: number; width: number; height: number };

function toCues(text: string, audioSec: number, leadFrames: number) {
  const segs = text
    .split(/(?<=[.!?;:—])\s+|\s+(?=—)/)
    .flatMap((s) => {
      const w = s.trim().split(/\s+/).filter(Boolean);
      const out: string[] = [];
      for (let i = 0; i < w.length; i += MAX_WORDS) out.push(w.slice(i, i + MAX_WORDS).join(' '));
      return out;
    })
    .map((s) => s.replace(/—/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean); // sem travessão no lettering
  const total = segs.reduce((a, s) => a + s.length, 0) || 1;
  let acc = 0;
  return segs.map((text) => {
    const dur = (text.length / total) * audioSec;
    const fromFrame = leadFrames + f(acc);
    acc += dur;
    return { text, fromFrame, durationInFrames: Math.max(f(0.7), f(dur)) };
  });
}

function build(flow: Flow, cut: Cut) {
  const framesRaw = JSON.parse(readFileSync(path.join(FRAMES_DIR, `${flow.id}.frames.json`), 'utf8')) as {
    frames: Record<string, { image: string; bbox: Box | null }>;
  };
  const audioRaw = JSON.parse(readFileSync(path.join(OUT_DIR, `${flow.id}.audio.json`), 'utf8')) as TutorialAudioManifest;
  const chosen = flow.steps.filter((s) => s.cuts.includes(cut));
  if (!chosen.length) throw new Error(`Corte sem etapas: ${flow.id}/${cut}`);
  const audioBy = validarClipsTutorial({ id: flow.id, steps: chosen }, audioRaw);
  if (sha256(readFileSync(path.join(PUBLIC_DIR, audioRaw.source.audio))) !== audioRaw.source.sha256) throw new Error('Take contínuo alterado após QA');

  const ritmo = RITMO[flow.id] || { lead: LEAD, tail: TAIL, outro: OUTRO_S };
  const introFrames = f(INTRO_S), outroFrames = f(ritmo.outro);
  let cursor = introFrames;

  const steps = chosen.map((step, i) => {
    const au = audioBy.get(step.id)!;
    if (!clipAtual(au, au.key, readFileSync(path.join(PUBLIC_DIR, au.audio)))) throw new Error(`MP3 alterado após QA: ${step.id}`);
    const leadFrames = f(ritmo.lead);
    const audioFrames = f(au.seconds);
    const durationInFrames = leadFrames + audioFrames + f(ritmo.tail);
    const fromFrame = cursor;
    cursor += durationInFrames;

    const isCartela = step.kind === 'cartela';
    const fr = !isCartela ? framesRaw.frames[step.captureId!] : undefined;
    if (!isCartela && !fr?.image) throw new Error(`Captura ausente: ${flow.id}/${step.captureId}`);
    if (fr?.image) readFileSync(path.join(PUBLIC_DIR, fr.image)); // falhar antes de gastar render

    return {
      id: step.id, index: i + 1, total: chosen.length,
      title: step.title,
      kind: step.kind || 'screen',
      cartela: step.cartela || null,
      image: fr?.image || null,
      bbox: fr?.bbox || null,
      label: step.highlight?.label || null,
      dragHint: step.dragHint || null,
      fromFrame, durationInFrames,
      audio: au.audio, audioFromFrame: leadFrames, audioDurationInFrames: audioFrames,
      captions: toCues(step.narration, au.seconds, leadFrames),
    };
  });

  const totalFrames = cursor + outroFrames;
  const m = MARCA_POR_FLOW[flow.id];
  const data = {
    flow: flow.id, cut, fps: FPS, width: W, height: H, totalFrames,
    intro: { title: flow.title, subtitle: flow.subtitle, durationInFrames: introFrames },
    outro: { durationInFrames: outroFrames, fromFrame: cursor, titulo: m?.outroTitulo, subtitulo: m?.outroSub },
    marca: m?.marca ?? 'vertho',
    steps,
  };

  const dest = process.env.TUTORIAL_TIMELINE_DIR
    ? path.resolve(process.env.TUTORIAL_TIMELINE_DIR, `${flow.id}.${cut}.timeline.json`)
    : path.join(HERE, '..', 'remotion-tutorial', 'tutorial-active.json');
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(data, null, 2));
  console.log(`build "${flow.id}" corte "${cut}" → ${steps.length} beats · ${totalFrames}f (${(totalFrames / FPS).toFixed(1)}s)`);
}

const flowId = process.argv[2] || 'disc';
const cut = (process.argv[3] as Cut) || 'ajuda';
const flow = FLOWS[flowId];
if (!flow) throw new Error(`flow inválido: ${flowId} (disponíveis: ${Object.keys(FLOWS).join(', ')})`);
if (!['app', 'ajuda', 'full'].includes(cut)) throw new Error(`corte inválido: ${cut} (use app|ajuda|full)`);
build(flow, cut);
