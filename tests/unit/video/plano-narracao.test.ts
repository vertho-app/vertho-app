import { describe, it, expect } from 'vitest';
import { planoDeNarracao } from '@/lib/video/avatar-grupo';

/**
 * `planoDeNarracao` substituiu o `nadaGerado` do trigger (25/09/2026) para que o
 * avatar compartilhado por grupo possa entrar pronto sem desligar a narração única.
 * O que este arquivo tranca:
 *   1. SEM cenas fixas, a decisão é EXATAMENTE a de antes (take único só quando nada
 *      foi gerado e há mais de uma cena) — provado contra a regra antiga em todos os
 *      recortes de um roteiro de 5 cenas;
 *   2. com o avatar do grupo como fixo, o take único sai sobre o RESTO;
 *   3. qualquer outro áudio já existente (resume, retake) volta ao caminho por cena.
 */

const cenas = [
  { id: 'scene-1', narration: 'intro' },
  { id: 'scene-2', narration: 'miolo a' },
  { id: 'scene-3', narration: '   ' }, // sem texto: não conta
  { id: 'scene-4', narration: 'miolo b' },
  { id: 'scene-5', narration: 'outro' },
];

/** A regra que o trigger usava até 25/09 (L306-311). */
function regraAntiga(cs: typeof cenas, tem: (id: string) => boolean) {
  const comTexto = cs.filter((s) => s.narration?.trim());
  const nadaGerado = comTexto.every((s) => !tem(s.id));
  return nadaGerado && comTexto.length > 1;
}

describe('planoDeNarracao', () => {
  it('sem fixas, decide igual à regra antiga em TODOS os 32 recortes de áudio já gerado', () => {
    for (let mascara = 0; mascara < 32; mascara++) {
      const tem = (id: string) => ((mascara >> (Number(id.split('-')[1]) - 1)) & 1) === 1;
      const p = planoDeNarracao(cenas, tem);
      expect(p.usarTakeUnico, `máscara ${mascara.toString(2)}`).toBe(regraAntiga(cenas, tem));
      expect(p.pendentes.map((s) => s.id)).toEqual(p.cenasComTexto.filter((s) => !tem(s.id)).map((s) => s.id));
    }
  });

  it('nada gerado: take único sobre todas as cenas com texto (a vazia fica de fora)', () => {
    const p = planoDeNarracao(cenas, () => false);
    expect(p.usarTakeUnico).toBe(true);
    expect(p.pendentes.map((s) => s.id)).toEqual(['scene-1', 'scene-2', 'scene-4', 'scene-5']);
  });

  it('avatar do grupo pronto (fixo): take único sobre o miolo, sem as cenas de avatar', () => {
    const fixas = new Set(['scene-1', 'scene-5']);
    const p = planoDeNarracao(cenas, (id) => fixas.has(id), { fixas });
    expect(p.usarTakeUnico).toBe(true);
    expect(p.pendentes.map((s) => s.id)).toEqual(['scene-2', 'scene-4']);
  });

  it('avatar fixo + outra cena já gerada (resume): volta ao caminho por cena', () => {
    const fixas = new Set(['scene-1', 'scene-5']);
    const tem = (id: string) => fixas.has(id) || id === 'scene-2';
    expect(planoDeNarracao(cenas, tem, { fixas }).usarTakeUnico).toBe(false);
  });

  it('retake de UMA cena (as outras têm áudio): caminho por cena, como antes', () => {
    const p = planoDeNarracao(cenas, (id) => id !== 'scene-4');
    expect(p.usarTakeUnico).toBe(false);
    expect(p.pendentes.map((s) => s.id)).toEqual(['scene-4']);
  });

  it('uma única cena pendente nunca é "take único"', () => {
    const fixas = new Set(['scene-1', 'scene-2', 'scene-5']);
    expect(planoDeNarracao(cenas, (id) => fixas.has(id), { fixas }).usarTakeUnico).toBe(false);
  });
});
