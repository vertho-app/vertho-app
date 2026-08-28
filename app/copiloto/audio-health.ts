import type { CaptureAudioLevels } from './audio-capture';

export type AudioInputEvidence = {
  systemHeard: boolean;
  microphoneHeard: boolean;
};

export type AudioInputHealth = 'checking' | 'ready' | 'microphone-only' | 'system-only' | 'silent';

export const EMPTY_AUDIO_EVIDENCE: AudioInputEvidence = {
  systemHeard: false,
  microphoneHeard: false,
};

// É o mesmo limiar absoluto usado pelo VAD do sidecar local. Abaixo dele o
// Whisper tampouco consideraria o bloco uma fala útil.
const AUDIBLE_RMS = 0.004;
const HEALTH_GRACE_MS = 10_000;

export function addAudioEvidence(
  previous: AudioInputEvidence,
  levels: CaptureAudioLevels,
): AudioInputEvidence {
  return {
    systemHeard: previous.systemHeard || levels.system >= AUDIBLE_RMS,
    microphoneHeard: previous.microphoneHeard || levels.microphone >= AUDIBLE_RMS,
  };
}

export function assessAudioInputHealth(
  evidence: AudioInputEvidence,
  elapsedMs: number,
): AudioInputHealth {
  if (evidence.systemHeard && evidence.microphoneHeard) return 'ready';
  if (elapsedMs < HEALTH_GRACE_MS) return 'checking';
  if (evidence.microphoneHeard) return 'microphone-only';
  if (evidence.systemHeard) return 'system-only';
  return 'silent';
}
