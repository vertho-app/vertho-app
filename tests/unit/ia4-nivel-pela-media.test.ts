import { describe, it, expect } from 'vitest';
import { consolidarNotasIA4 } from '@/lib/ia4-avaliacao';
import { verificarEmCodigo } from '@/lib/check-ia4-core';
import { nivelDaNota } from '@/lib/nivel-regua';

/**
 * Decisão do dono (17/10/2026): o nível geral da IA4 é a média dos descritores pela régua, e nenhuma trava o sobe.
 * A antiga trava "evidência N3 → mínimo N2" levava a média 1,67 do Thiago (Rotina) e a 1,75 da Marisa (Simplicidade,
 * Amazon Bowling) a N2, e o PDI da Marisa, que lê o nível pela nota, mostrava N1. As travas de teto continuam.
 */
const descritores = (notas: number[]) => notas.map((nota_decimal, i) => ({ numero: i + 1, nome: `d${i + 1}`, nota_decimal }));

describe('nível geral da IA4 pela média', () => {
  it('casos reais da Amazon: um descritor em N3 não sobe a média N1 para N2', () => {
    const thiago = consolidarNotasIA4(descritores([3, 1.2, 2.28, 1.25, 1.3, 1]));
    expect(thiago.mediaDescritores).toBe(1.67);
    expect(thiago.nivelGeral).toBe(1);
    expect(thiago.gap).toBe(2);

    const marisa = consolidarNotasIA4(descritores([3, 1, 2, 2, 1.5, 1]));
    expect(marisa.mediaDescritores).toBe(1.75);
    expect(marisa.nivelGeral).toBe(1);
    expect(marisa.travasAplicadas.join(' ')).not.toMatch(/N3/);
  });

  it('as travas de teto seguem baixando', () => {
    // média 2,33 (N2), 4 descritores N1 → N1
    expect(consolidarNotasIA4(descritores([1.5, 1.5, 1.5, 1.5, 4, 4])).nivelGeral).toBe(1);
    // média 3,42 (N3), 1 descritor N1 → N2
    expect(consolidarNotasIA4(descritores([1.5, 3.8, 3.8, 3.8, 3.8, 3.8])).nivelGeral).toBe(2);
  });

  it('o nível geral nunca passa do nível da média', () => {
    const grade = [1, 1.5, 2, 2.5, 3, 3.5, 4];
    for (const a of grade) for (const b of grade) for (const c of grade) {
      const cons = consolidarNotasIA4(descritores([a, b, c, 1.2, 3.2, 2.1]));
      expect(cons.nivelGeral).toBeLessThanOrEqual(nivelDaNota(cons.mediaDescritores));
    }
  });
});

describe('C2 do check confere o nível pela média', () => {
  const avaliacao = (nivelGeral: number) => {
    const notas = [3, 1.2, 2.28, 1.25, 1.3, 1];
    const cons = consolidarNotasIA4(descritores(notas));
    return {
      consolidacao: { notas_por_descritor: cons.notasPorDesc, media_descritores: cons.mediaDescritores, nivel_geral: nivelGeral, gap: Math.max(0, 3 - nivelGeral) },
      avaliacao_por_descritor: notas.map((n, i) => ({ numero: i + 1, nivel_sugerido: nivelDaNota(n) })),
    };
  };

  it('aprova o nível da média mesmo com um descritor em N3', () => {
    expect(verificarEmCodigo(avaliacao(1)).C2).toEqual({ ok: true });
  });

  it('reprova nível acima do nível da média', () => {
    const c2 = verificarEmCodigo(avaliacao(2)).C2;
    expect(c2.ok).toBe(false);
    expect(c2.obs).toContain('acima do nível da média');
  });
});
