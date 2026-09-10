import { createHash } from 'node:crypto';
import { ELENCO } from '../../lib/tts/elenco';

/** Tutorial é o Beto explicando o produto, sem personalização por participante. */
export function perfilTutorial(flow: string) {
  const p = ELENCO.beto;
  return {
    personagem: 'beto', voice: p.voz, backend: 'vertex', model: p.modeloVertex,
    versao: p.versao, alvoF0Hz: p.alvoF0Hz, tolSt: p.tolSt,
    mode: 'continuous', tentativas: p.tentativas,
    style: p.direcao + (flow === 'macae'
      ? '. Neste convite, comece acolhedor e termine com convicção e otimismo, sem soar festivo.'
      : flow === 'aplicacao'
        ? '. Leia este tutorial com voz clara, luminosa e em registro médio-alto, como um instrutor entusiasmado explicando algo simples. Sustente o mesmo registro do início ao fim; não faça voz grave, solene ou de locutor.'
      : ['jornada', 'boasvindas'].includes(flow)
        ? '. Para esta explicação prática, fale com leveza no registro médio, sem engrossar a voz nem adotar tom solene. Mantenha clareza didática e energia de conversa.' : ''),
  };
}

export type TutorialProfile = ReturnType<typeof perfilTutorial>;
export type TutorialClip = {
  id: string; audio: string; seconds: number; key: string; sha256: string;
  sourceSha256: string; sourceStart: number; sourceEnd: number;
  // QA do take contínuo de origem, não uma medição independente da fatia.
  qa: { ok: boolean; motivos: string[]; tentativas: number; metricas: unknown };
  createdAt: string;
};
export type TutorialNarration = {
  schema: 3; flow: string; profile: TutorialProfile; key: string; text: string;
  audio: string; seconds: number; sha256: string; qa: TutorialClip['qa']; createdAt: string;
};
export type TutorialAudioManifest = {
  schema: 3; flow: string; profile: TutorialProfile; source: TutorialNarration; clips: TutorialClip[];
};

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** Texto, voz, backend, modelo, direção e régua invalidam um take congelado. */
export function chaveNarracao(flow: string, stepId: string, text: string, profile = perfilTutorial(flow)): string {
  return sha256(JSON.stringify({ schema: 3, flow, stepId, text, profile }));
}

export function clipAtual(clip: TutorialClip | undefined, key: string, bytes?: Buffer): boolean {
  return !!clip && clip.key === key && clip.qa?.ok === true
    && Number.isFinite(clip.seconds) && clip.seconds > 0 && !!clip.sha256
    && (!bytes || sha256(bytes) === clip.sha256);
}

export function validarClipsTutorial(
  flow: { id: string; steps: Array<{ id: string; narration: string }> },
  manifest: TutorialAudioManifest,
): Map<string, TutorialClip> {
  if (manifest.schema !== 3 || manifest.flow !== flow.id) throw new Error('Manifesto de áudio legado ou de outro tutorial; gere a narração atual');
  if (!manifest.source?.qa?.ok || manifest.source.flow !== flow.id
    || manifest.source.key !== chaveNarracao(flow.id, 'continuous', manifest.source.text)
    || JSON.stringify(manifest.source.profile) !== JSON.stringify(perfilTutorial(flow.id))) {
    throw new Error('Take contínuo de origem ausente, desatualizado ou reprovado');
  }
  const clips = new Map(manifest.clips.map(c => [c.id, c]));
  if (clips.size !== manifest.clips.length) throw new Error('Manifesto com etapas duplicadas');
  for (const step of flow.steps) {
    const clip = clips.get(step.id);
    if (!clipAtual(clip, chaveNarracao(flow.id, step.id, step.narration))
      || clip!.sourceSha256 !== manifest.source.sha256
      || !(clip!.sourceStart >= 0 && clip!.sourceEnd > clip!.sourceStart && clip!.sourceEnd <= manifest.source.seconds + 0.05)) {
      throw new Error(`Narração ausente, desatualizada ou reprovada: ${flow.id}/${step.id}`);
    }
  }
  return clips;
}
