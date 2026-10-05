import { describe, expect, it } from 'vitest';
import { speechTranscript } from '@/lib/speech-transcript';

const result = (transcript: string, isFinal = true) => ({ 0: { transcript }, isFinal });

describe('transcrição por voz', () => {
  it('não acumula os finais cumulativos do Android que produziram o print', () => {
    const updates = [
      'quem', 'quem', 'quem fala', 'quem fala é',
      'quem fala é o', 'quem fala é o supervisor',
      'quem fala é o supervisor ou', 'quem fala é o supervisor ou',
    ].map(text => speechTranscript('', [result(text)]));
    expect(updates).toEqual([
      'quem', 'quem', 'quem fala', 'quem fala é',
      'quem fala é o', 'quem fala é o supervisor',
      'quem fala é o supervisor ou', 'quem fala é o supervisor ou',
    ]);
  });

  it('preserva a base digitada sem reanexar finais reenviados', () => {
    const results = [result('Vou conversar.'), result('Com o supervisor.', false)];
    const first = speechTranscript('Minha resposta:\nEu escuto.  ', results);
    expect(first).toBe('Minha resposta:\nEu escuto. Vou conversar. Com o supervisor.');
    expect(speechTranscript('Minha resposta:\nEu escuto.  ', results)).toBe(first);
  });

  it('substitui hipóteses parciais e mantém os segmentos anteriores', () => {
    const base = 'Primeiro:';
    expect(speechTranscript(base, [result('Vou ouvir.'), result('eu fala', false)]))
      .toBe('Primeiro: Vou ouvir. eu fala');
    expect(speechTranscript(base, [result('Vou ouvir.'), result('Eu falo com a equipe.')]))
      .toBe('Primeiro: Vou ouvir. Eu falo com a equipe.');
    expect(speechTranscript(base, [result('Vou ouvir.')]))
      .toBe('Primeiro: Vou ouvir.');
  });

  it('preserva repetições realmente faladas em posições diferentes', () => {
    expect(speechTranscript('', [result('não'), result('não'), result('vou aceitar')]))
      .toBe('não não vou aceitar');
  });

  it('anexa uma nova sessão ao texto já transcrito apenas uma vez', () => {
    const base = speechTranscript('Eu escuto.', [result('Vou conversar.')]);
    expect(speechTranscript(base, [result('Depois acompanho.')]))
      .toBe('Eu escuto. Vou conversar. Depois acompanho.');
  });

  it('tolera listas nativas e não modifica o texto sem transcrição', () => {
    expect(speechTranscript('', { 0: result('  Eu  escuto. '), length: 1 }))
      .toBe('Eu escuto.');
    expect(speechTranscript('Minha resposta.  ', [])).toBe('Minha resposta.  ');
  });
});
