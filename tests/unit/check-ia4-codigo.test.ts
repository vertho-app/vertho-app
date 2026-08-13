import { describe, it, expect } from 'vitest';
import { verificarEmCodigo, processCheckResult } from '@/lib/check-ia4-core';

/**
 * Os itens objetivos saíram do prompt: o código os responde. Medido no A/B de
 * 12/08 — B2 foi reprovado 19 vezes em 45 rodadas, discordando de uma
 * normalização determinística que o próprio código já tinha aplicado.
 */
const avaliacaoOk = {
  consolidacao: {
    notas_por_descritor: {
      D1: { nome: 'a', nota_decimal: 2.5, nivel: 2 },
      D2: { nome: 'b', nota_decimal: 1.5, nivel: 1 },
    },
    media_descritores: 2, nivel_geral: 2, gap: 1,
  },
  avaliacao_por_descritor: [{ numero: 1, nivel_sugerido: 2 }, { numero: 2, nivel_sugerido: 1 }],
  recomendacoes_pdi: [{ descritor_foco: 'D2 — algo', nivel_atual_sugerido: 1 }],
};

const clonar = (o: any) => JSON.parse(JSON.stringify(o));

describe('verificarEmCodigo', () => {
  it('avaliação coerente passa em todos os itens verificados por código', () => {
    const v = verificarEmCodigo(avaliacaoOk);
    expect(Object.keys(v).sort()).toEqual(['A3', 'B1', 'B2', 'C1', 'C2']);
    expect(Object.values(v).every((x) => x.ok)).toBe(true);
  });

  it('B1 pega nível fora da régua (3,6 é N4, não N3)', () => {
    const a = clonar(avaliacaoOk);
    a.consolidacao.notas_por_descritor.D1 = { nome: 'a', nota_decimal: 3.6, nivel: 3 };
    expect(verificarEmCodigo(a).B1.ok).toBe(false);
  });

  it('B2 pega nível divergente entre seções — inclusive no PDI', () => {
    const a = clonar(avaliacaoOk);
    a.avaliacao_por_descritor[1].nivel_sugerido = 2; // consolidação diz 1
    expect(verificarEmCodigo(a).B2.ok).toBe(false);

    const b = clonar(avaliacaoOk);
    b.recomendacoes_pdi[0].nivel_atual_sugerido = 3;
    expect(verificarEmCodigo(b).B2.ok).toBe(false);
  });

  it('C1 pega média que não confere', () => {
    const a = clonar(avaliacaoOk);
    a.consolidacao.media_descritores = 2.9;
    const v = verificarEmCodigo(a);
    expect(v.C1.ok).toBe(false);
    expect(v.C1.obs).toContain('2.9');
  });

  it('C2 pega trava não aplicada e gap errado', () => {
    const a = clonar(avaliacaoOk);
    a.consolidacao.nivel_geral = 3; // há descritor N1 → máximo N2
    expect(verificarEmCodigo(a).C2.ok).toBe(false);

    const b = clonar(avaliacaoOk);
    b.consolidacao.gap = 2; // 3 − 2 = 1
    expect(verificarEmCodigo(b).C2.ok).toBe(false);
  });

  it('payload sem consolidação não inventa veredito — devolve vazio', () => {
    expect(verificarEmCodigo({})).toEqual({});
    expect(verificarEmCodigo(null)).toEqual({});
  });

  it('o código SOBRESCREVE o que a IA respondeu nesses itens', () => {
    // A IA diz que a média está errada; o código verifica que está certa.
    const daIA = { verificacoes: { B2: { ok: false, obs: 'acho que divergiu' }, C1: { ok: false, obs: 'média errada' } } };
    const { check } = processCheckResult(daIA, avaliacaoOk);
    expect(check.verificacoes.C1.ok).toBe(true);
    expect(check.verificacoes.C1.fonte).toBe('codigo');
    expect(check.verificacoes.B2.ok).toBe(true);
  });
});
