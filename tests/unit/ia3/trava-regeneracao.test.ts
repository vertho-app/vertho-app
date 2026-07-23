import { describe, it, expect, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));
vi.mock('@/actions/utils', () => ({ extractJSON: vi.fn() }));

import { travaRegeneracao, normalizarResultadoCheckIA3, validarRespostaIA3 } from '@/lib/ia3-cenarios';

describe('travaRegeneracao — regeneração NUNCA piora a nota', () => {
  it('candidata pior que a atual → DESCARTA (o bug real: 88 → 58)', () => {
    expect(travaRegeneracao(88, 58)).toBe(false);
    expect(travaRegeneracao(90, 89)).toBe(false);
  });

  it('candidata igual ou melhor → aplica', () => {
    expect(travaRegeneracao(88, 88)).toBe(true);
    expect(travaRegeneracao(60, 88)).toBe(true);
  });

  it('sem nota atual medida (nunca checado) → aplica', () => {
    expect(travaRegeneracao(null, 40)).toBe(true);
    expect(travaRegeneracao(undefined, 40)).toBe(true);
  });
});

describe('normalizarResultadoCheckIA3 — veredito EM CÓDIGO', () => {
  it('erro_grave clampa a 60; status derivado da nota', () => {
    const r = normalizarResultadoCheckIA3({ nota: 85, erro_grave: true });
    expect(r?.resultado.nota).toBe(60);
    expect(r?.statusCheck).toBe('revisar');
    expect(normalizarResultadoCheckIA3({ nota: 92 })?.statusCheck).toBe('aprovado');
    expect(normalizarResultadoCheckIA3({ nota: 85 })?.statusCheck).toBe('aprovado_com_ressalvas');
  });
  it('sem nota → null (caller aborta sem escrever nada)', () => {
    expect(normalizarResultadoCheckIA3(null)).toBeNull();
    expect(normalizarResultadoCheckIA3({})).toBeNull();
  });
});

describe('validarRespostaIA3 — normalização da geração', () => {
  it('4 perguntas + cobertura completa → sem erros', () => {
    const r = validarRespostaIA3({
      cenario: { titulo: 'T', contexto: 'C' },
      perguntas: [1, 2, 3, 4].map((n) => ({ numero: n, descritores_primarios: [n, ((n % 4) + 1)] })),
    }, 4);
    expect(r?.errors).toEqual([]);
  });
  it('3 perguntas / descritor descoberto → erros listados', () => {
    const r = validarRespostaIA3({
      cenario: { titulo: 'T', contexto: 'C' },
      perguntas: [1, 2, 3].map((n) => ({ numero: n, descritores_primarios: [1] })),
    }, 4);
    expect(r?.errors.some((e) => e.includes('4 perguntas'))).toBe(true);
    expect(r?.errors.some((e) => e.includes('sem cobertura'))).toBe(true);
  });
});
