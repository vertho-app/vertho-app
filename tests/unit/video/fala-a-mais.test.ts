import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fimDoTextoNaFala, normalizarToken, SOBRA_MIN_PALAVRAS } from '@/lib/video/narracao-unica';

/**
 * Fala A MAIS no fim de uma cena narrada sozinha (25/09/2026).
 *
 * A fixture são as transcrições REAIS (Whisper) dos 6 fechos medidos nesse dia: 5 com
 * o TTS repetindo a pergunta final ou inventando uma frase (3 deles em vídeos de
 * produção servidos a professores), 1 limpo. Não é texto montado à mão: a forma que o
 * ASR devolve (pontuação, palavra partida, tempo) é o que a régua precisa aguentar.
 */
const { casos } = JSON.parse(readFileSync('tests/fixtures/video/fala-a-mais-reais.json', 'utf-8')) as {
  casos: { rotulo: string; texto: string; duracaoS: number; sobra: boolean; words: { word: string; start: number; end: number }[] }[];
};

describe('fimDoTextoNaFala · os fechos reais de 25/09', () => {
  it('a fixture tem os 6 casos, 5 com sobra', () => {
    expect(casos).toHaveLength(6);
    expect(casos.filter((c) => c.sobra)).toHaveLength(5);
  });

  for (const c of casos.filter((x) => x.sobra)) {
    it(`corta: ${c.rotulo}`, () => {
      const r = fimDoTextoNaFala(c.words, c.texto, c.duracaoS);
      expect(r).not.toBeNull();
      const n = c.texto.split(/\s+/).length;
      // O que fica é o texto do roteiro: as palavras antes do corte são tantas quantas
      // o texto tem (±2 do ASR), e a última delas é a última do texto.
      const ficam = c.words.filter((w) => w.start < r!.fimS);
      expect(Math.abs(ficam.length - n)).toBeLessThanOrEqual(2);
      const ultimaDoTexto = normalizarToken(c.texto.trim().split(/\s+/).at(-1)!);
      expect(normalizarToken(ficam.at(-1)!.word)).toBe(ultimaDoTexto);
      // E o corte cai no silêncio depois dela, antes da primeira palavra que sobra.
      const primeiraQueSobra = c.words.find((w) => w.start >= r!.fimS)!;
      expect(r!.fimS).toBeGreaterThan(ficam.at(-1)!.end);
      expect(r!.fimS).toBeLessThanOrEqual(primeiraQueSobra.start);
      expect(r!.palavrasDepois).toBe(c.words.length - ficam.length);
    });
  }

  it('não corta o fecho limpo', () => {
    const limpo = casos.find((c) => !c.sobra)!;
    expect(fimDoTextoNaFala(limpo.words, limpo.texto, limpo.duracaoS)).toBeNull();
  });
});

describe('fimDoTextoNaFala · bordas', () => {
  const W = (s: string, t0 = 0) => s.split(' ').map((w, i) => ({ word: w, start: t0 + i * 0.4, end: t0 + i * 0.4 + 0.3 }));
  const TEXTO = 'Qual tarefa você vai proteger esta semana e com que critério?';

  it(`uma palavra solta depois do texto (ruído que o ASR leu) não corta: o mínimo é ${SOBRA_MIN_PALAVRAS}`, () => {
    const w = [...W(TEXTO), { word: 'Obrigado.', start: 6.5, end: 6.9 }];
    expect(fimDoTextoNaFala(w, TEXTO, 7.5)).toBeNull();
    const w2 = [...w, { word: 'tchau', start: 7.0, end: 7.3 }];
    expect(fimDoTextoNaFala(w2, TEXTO, 7.5)).toMatchObject({ palavrasDepois: 2 });
  });

  it('texto que o ASR não casa: não mexe no áudio (null), mesmo com fala sobrando', () => {
    expect(fimDoTextoNaFala(W('palavras que não têm nada a ver com o roteiro desta cena aqui'), TEXTO, 6)).toBeNull();
  });

  it('sem timing do ASR ou sem texto: null', () => {
    expect(fimDoTextoNaFala([], TEXTO, 5)).toBeNull();
    expect(fimDoTextoNaFala(W(TEXTO), '  ', 5)).toBeNull();
  });
});
