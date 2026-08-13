import { describe, it, expect } from 'vitest';
import { verificarEmCodigo } from '@/lib/check-ia4-core';

/**
 * A3 nasceu de um caso REAL (Macaé, 12/08): a avaliação listou
 * "O cenário informa que o Conselho existe formalmente, reúne-se com baixa
 * frequência…" como evidência do descritor. É o enunciado, não a resposta da
 * pessoa — sustentava nota com algo que ela não disse. O auditor pegou por
 * julgamento (item A2); o código pega sempre.
 */
const base = {
  consolidacao: {
    notas_por_descritor: { D1: { nome: 'a', nota_decimal: 2, nivel: 2 } },
    media_descritores: 2, nivel_geral: 2, gap: 1,
  },
};

const comEvidencias = (evidencias: any[]) => ({
  ...base,
  avaliacao_por_descritor: [{ numero: 1, nome: 'a', nivel_sugerido: 2, evidencias }],
});

describe('A3 — evidência tem que declarar a resposta de origem', () => {
  it('aceita o formato estruturado', () => {
    const a = comEvidencias([{ resposta: 'R1', trecho: 'assumo a responsabilidade' }]);
    expect(verificarEmCodigo(a).A3.ok).toBe(true);
  });

  it('aceita o formato textual "R2: ..." (o que o modelo produz na prática)', () => {
    const a = comEvidencias(["R2: 'A diretora poderá se reunir com o Conselho'"]);
    expect(verificarEmCodigo(a).A3.ok).toBe(true);
  });

  it('REPROVA o caso real: cenário citado como prova', () => {
    const a = comEvidencias([
      "R2: 'A diretora poderá se reunir com o Conselho'",
      'O cenário informa que o Conselho existe formalmente, reúne-se com baixa frequência',
    ]);
    const v = verificarEmCodigo(a).A3;
    expect(v.ok).toBe(false);
    expect(v.obs).toContain('sem origem');
  });

  it('REPROVA objeto sem resposta identificada', () => {
    expect(verificarEmCodigo(comEvidencias([{ trecho: 'algo' }])).A3.ok).toBe(false);
    expect(verificarEmCodigo(comEvidencias([{ resposta: 'cenário', trecho: 'algo' }])).A3.ok).toBe(false);
  });

  it('descritor sem evidências não reprova por A3 (é A1 que cobra isso)', () => {
    expect(verificarEmCodigo(comEvidencias([])).A3.ok).toBe(true);
  });
});
