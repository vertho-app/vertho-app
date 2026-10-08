import { describe, expect, it } from 'vitest';
import { computePerfilOrg, destaquesBipolares } from '@/lib/perfil-organizacional/aggregate';

function p(d: number, s: number, i = 40, c = 55) {
  return { nome_completo: 'Pessoa', cargo: 'X', d_natural: d, i_natural: i, s_natural: s, c_natural: c };
}
const rep = (n: number, d: number, s: number) => Array.from({ length: n }, () => p(d, s));
const par = (rows: any[], esquerda: string) => computePerfilOrg(rows).destaques.find((x) => x.esquerda === esquerda)!;

describe('Perfil Organizacional: destaques comportamentais do grupo', () => {
  it('traz o % de pessoas em cada lado, somando 100, nos 24 pares', () => {
    const r = computePerfilOrg([...rep(6, 60, 50), ...rep(8, 40, 70)]).destaques;
    expect(r).toHaveLength(24);
    for (const x of r) expect((x.pctEsquerda ?? -1) + (x.pctDireita ?? -1)).toBe(100);
  });

  it('Amazon Bowling: a média põe tudo à direita, mas 6 de 14 pendem à esquerda em D ≥ S, e o % mostra isso', () => {
    // 6 pessoas com D ≥ S, 8 com D < S: a média (D 48,6 × S 61,4) cairia à direita.
    const x = par([...rep(6, 60, 50), ...rep(8, 40, 70)], 'ESTILO AGRESSIVO');
    expect(x.pctEsquerda).toBe(43);
    expect(x.pctDireita).toBe(57);
    expect(x.ladoEsquerdo).toBe(false);
  });

  it('o marcador segue a MAIORIA das pessoas, mesmo quando a média aponta para o outro lado', () => {
    // 8 pessoas D ≥ S, 6 com S muito acima: média D 34,3 × S 71,4 (direita), maioria à esquerda.
    const x = par([...rep(8, 60, 50), ...rep(6, 0, 100)], 'ESTILO AGRESSIVO');
    expect(x.pctEsquerda).toBe(57);
    expect(x.ladoEsquerdo).toBe(true);
  });

  it('empate exato: vale o lado da média do grupo', () => {
    // 7 × 7. Média D 50 × S 60: direita.
    const dir = par([...rep(7, 60, 50), ...rep(7, 40, 70)], 'ESTILO AGRESSIVO');
    expect([dir.pctEsquerda, dir.pctDireita]).toEqual([50, 50]);
    expect(dir.ladoEsquerdo).toBe(false);
    // 7 × 7. Média D 50 × S 50: D ≥ S, esquerda.
    const esq = par([...rep(7, 90, 50), ...rep(7, 10, 50)], 'ESTILO AGRESSIVO');
    expect([esq.pctEsquerda, esq.pctDireita]).toEqual([50, 50]);
    expect(esq.ladoEsquerdo).toBe(true);
  });

  it('a função individual (reusada pelo scoring) continua sem percentual', () => {
    const [primeiro] = destaquesBipolares({ d: 50, i: 50, s: 50, c: 50 });
    expect(primeiro.pctEsquerda).toBeUndefined();
    expect(primeiro.pctDireita).toBeUndefined();
  });
});
