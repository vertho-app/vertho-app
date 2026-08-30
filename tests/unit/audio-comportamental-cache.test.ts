import { describe, expect, it } from 'vitest';
import { isAudioArtifactReady } from '@/lib/relatorio-comportamental/audio-cache';

const NOW = Date.parse('2026-08-30T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('cache imediato da devolutiva comportamental', () => {
  it('libera somente um MP3 atual, posterior ao relatório e dentro da validade', () => {
    expect(isAudioArtifactReady({
      path: 'tenant/devolutiva.mp3',
      audioAt: '2026-08-29T12:00:00Z',
      reportAt: '2026-08-20T12:00:00Z',
      reportIsFresh: true,
    }, NOW, 30 * DAY)).toBe(true);
  });

  it.each([
    ['sem arquivo', { path: null, audioAt: '2026-08-29T12:00:00Z', reportAt: '2026-08-20T12:00:00Z', reportIsFresh: true }],
    ['relatório vencido', { path: 'x.mp3', audioAt: '2026-08-29T12:00:00Z', reportAt: '2026-08-20T12:00:00Z', reportIsFresh: false }],
    ['áudio anterior ao relatório', { path: 'x.mp3', audioAt: '2026-08-19T12:00:00Z', reportAt: '2026-08-20T12:00:00Z', reportIsFresh: true }],
    ['áudio vencido', { path: 'x.mp3', audioAt: '2026-07-01T12:00:00Z', reportAt: '2026-06-30T12:00:00Z', reportIsFresh: true }],
  ])('não anuncia disponibilidade %s', (_label, state) => {
    expect(isAudioArtifactReady(state, NOW, 30 * DAY)).toBe(false);
  });
});
