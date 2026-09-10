import { describe, it, expect } from 'vitest';
import { alignSteps, tokens } from '../../video-spike/tutorial/alignment';
import { captionGroups, setptsExpression } from '../../video-spike/tutorial/retime-core';

const steps = [
  { id: 'inicio', narration: 'Este é o Vertho.' },
  { id: 'fim', narration: 'Aqui começa a jornada.' },
];
const words = ['Este', 'é', 'o', 'Verto.', 'Aqui', 'começa', 'a', 'jornada.']
  .map((word, i) => ({ word, start: i, end: i + 0.5 }));
describe('tutorial: alinhamento sem reescrever o roteiro', () => {
  it('trata a soletração P D I como a sigla escrita pelo ASR', () => {
    expect(tokens('Este é o P D I.')).toEqual(tokens('Este é o PDI.'));
  });
  it('alinha os limites e tolera grafia fonética da marca', () => {
    const a = alignSteps(steps, words, 8);
    expect(a.map(s => [s.start,s.end])).toEqual([[0,3.5],[4,7.5]]);
    expect(a.every(s => s.coverage === 1)).toBe(true);
    expect(a[0].words.at(-1)?.word).toBe('vertho');
  });
  it('recusa fala divergente, etapa ausente e tempos inválidos', () => {
    expect(() => alignSteps(steps, words.slice(0,4), 8)).toThrow(/diverge/);
    expect(() => alignSteps(steps, [...words].reverse(), 8)).toThrow(/ordem/);
    expect(() => alignSteps(steps, words, 2)).toThrow(/inválidos/);
    expect(() => alignSteps(steps, [], 8)).toThrow(/vazia/);
  });
  it('reproduz os blocos de legenda antigos sem travessão', () => {
    expect(captionGroups('Este é o Vertho — a sua jornada.')).toEqual(['Este é o Vertho','a sua jornada.']);
  });
  it('tempo visual é contínuo e crescente; nunca inverte cenas', () => {
    expect(setptsExpression([{old:0,next:0},{old:2,next:3},{old:4,next:4}]))
      .toBe('(1.500000000*T+(-1.000000000)*max(0,T-2.000000))/TB');
    expect(() => setptsExpression([{old:0,next:0},{old:2,next:3},{old:1,next:4}])).toThrow(/ordem/);
  });
});
