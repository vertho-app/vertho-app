import { describe, it, expect } from 'vitest';
import { normalizarNiveisDaAvaliacao } from '@/lib/ia4-avaliacao';

/**
 * O nível é DERIVADO da nota; o que a IA escreveu não vale. Os casos abaixo são
 * reais (Macaé, 12/08/2026) — o modelo NÃO repete o mesmo rótulo entre as
 * seções, e era por isso que a contradição sobrevivia mesmo com a régua única.
 */
const notasPorDesc = {
  D1: { nome: 'D1 – Decisão proporcional com consciência do custo e critérios de sucesso por parte', nota_decimal: 2.03, nivel: 2 },
  D4: { nome: 'D4 – Proteção da aluna, gestão da relação com a família e acompanhamento ativo', nota_decimal: 1.95, nivel: 1 },
};

describe('normalizarNiveisDaAvaliacao', () => {
  it('sobrescreve o nivel_sugerido da IA pelo derivado', () => {
    const av: any = { avaliacao_por_descritor: [{ numero: 4, nivel_sugerido: 2 }] };
    normalizarNiveisDaAvaliacao(av, notasPorDesc);
    expect(av.avaliacao_por_descritor[0].nivel_sugerido).toBe(1);
  });

  it('casa pelo CÓDIGO quando o texto do rótulo difere entre seções', () => {
    // Rótulo do gap é mais curto que o da consolidação — casamento exato falha.
    const av: any = {
      descritores_destaque: {
        gaps_prioritarios: [{ descritor: 'D4 – Proteção da aluna, gestão da família e acompanhamento ativo', nivel: 2 }],
      },
      recomendacoes_pdi: [{ descritor_foco: 'D4 – Proteção da aluna, gestão da relação com a família', nivel_atual_sugerido: 2 }],
    };
    normalizarNiveisDaAvaliacao(av, notasPorDesc);
    expect(av.descritores_destaque.gaps_prioritarios[0].nivel).toBe(1);
    expect(av.recomendacoes_pdi[0].nivel_atual_sugerido).toBe(1);
  });

  it('casa pelo NOME quando não há código no rótulo', () => {
    const av: any = {
      descritores_destaque: {
        pontos_fortes: [{ descritor: 'Decisão proporcional com consciência do custo e critérios de sucesso por parte', nivel: 4 }],
      },
    };
    normalizarNiveisDaAvaliacao(av, notasPorDesc);
    expect(av.descritores_destaque.pontos_fortes[0].nivel).toBe(2);
  });

  it('NÃO inventa: descritor que não resolve fica como veio', () => {
    const av: any = {
      descritores_destaque: { pontos_fortes: [{ descritor: 'D9 – outro descritor qualquer', nivel: 3 }] },
      recomendacoes_pdi: [{ descritor_foco: 'assunto que não existe', nivel_atual_sugerido: 3 }],
    };
    normalizarNiveisDaAvaliacao(av, notasPorDesc);
    expect(av.descritores_destaque.pontos_fortes[0].nivel).toBe(3);
    expect(av.recomendacoes_pdi[0].nivel_atual_sugerido).toBe(3);
  });

  it('aguenta payload sem as seções opcionais', () => {
    const av: any = {};
    expect(() => normalizarNiveisDaAvaliacao(av, notasPorDesc)).not.toThrow();
  });
});
