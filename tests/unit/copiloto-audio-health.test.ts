import { describe, expect, it } from 'vitest';
import {
  addAudioEvidence,
  assessAudioInputHealth,
  EMPTY_AUDIO_EVIDENCE,
} from '@/app/copiloto/audio-health';

describe('saúde dos dois canais do Copiloto', () => {
  it('mantém uma janela de observação antes de alertar', () => {
    const evidence = addAudioEvidence(EMPTY_AUDIO_EVIDENCE, { system: 0, microphone: 0.02 });
    expect(assessAudioInputHealth(evidence, 9_999)).toBe('checking');
  });

  it('identifica a falha real da reunião: só o microfone está audível', () => {
    const evidence = addAudioEvidence(EMPTY_AUDIO_EVIDENCE, { system: 0.0002, microphone: 0.02 });
    expect(assessAudioInputHealth(evidence, 10_000)).toBe('microphone-only');
  });

  it('libera o alerta assim que os dois lados já produziram fala', () => {
    const afterSeller = addAudioEvidence(EMPTY_AUDIO_EVIDENCE, { system: 0, microphone: 0.02 });
    const afterClient = addAudioEvidence(afterSeller, { system: 0.015, microphone: 0 });
    expect(assessAudioInputHealth(afterClient, 2_000)).toBe('ready');
  });

  it('não confunde ruído abaixo do VAD com fala do cliente', () => {
    const evidence = addAudioEvidence(EMPTY_AUDIO_EVIDENCE, { system: 0.0039, microphone: 0 });
    expect(assessAudioInputHealth(evidence, 10_000)).toBe('silent');
  });
});
