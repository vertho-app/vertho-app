import { describe, expect, it } from 'vitest';
import { aferir, type AvaliacaoRepetida } from '@/lib/prontidao-lideranca/aferir';

const rodada = (respostaId: string, r: number, notas: Record<string, number>): AvaliacaoRepetida =>
  ({ respostaId, rodada: r, notasPorDescritor: notas });

describe('aferir — test-retest do instrumento', () => {
  it('entrada idêntica devolvendo notas idênticas = ruído zero e nenhum nível instável', () => {
    const a = aferir([
      rodada('r1', 1, { D1: 3.0, D2: 2.5 }), rodada('r1', 2, { D1: 3.0, D2: 2.5 }), rodada('r1', 3, { D1: 3.0, D2: 2.5 }),
    ]);
    expect(a).toMatchObject({ respostas: 1, repeticoes: 3, pares: 2, dpPorDescritor: 0, dpPorResposta: 0, amplitudeMaximaPorResposta: 0, paresComNivelInstavel: 0, bandaSugerida: 0 });
  });

  it('mede dp amostral, amplitude e instabilidade de NÍVEL na fronteira 3,00', () => {
    // D1 oscila em volta do corte N2/N3: 2,99 → N2, 3,01 → N3 — nível instável com amplitude 0,02.
    const a = aferir([
      rodada('r1', 1, { D1: 2.99, D2: 3.5 }),
      rodada('r1', 2, { D1: 3.01, D2: 3.5 }),
      rodada('r1', 3, { D1: 3.0, D2: 3.5 }),
    ]);
    const d1 = a.detalhePares.find((p) => p.descritor === 'D1')!;
    expect(d1.niveis).toEqual([2, 3, 3]);
    expect(d1.nivelInstavel).toBe(true);
    expect(d1.amplitude).toBe(0.02);
    expect(a.paresComNivelInstavel).toBe(1);
    // média da resposta por rodada: (2,99+3,5)/2=3,245 · 3,255 · 3,25 → amplitude 0,01
    expect(a.detalheRespostas[0].medias).toEqual([3.25, 3.26, 3.25]);
    expect(a.amplitudeMaximaPorResposta).toBe(0.01);
    expect(a.bandaSugerida).toBe(0.01);
  });

  it('banda sugerida é a PIOR amplitude entre as respostas', () => {
    const a = aferir([
      rodada('r1', 1, { D1: 3.0 }), rodada('r1', 2, { D1: 3.1 }),
      rodada('r2', 1, { D1: 2.0 }), rodada('r2', 2, { D1: 2.5 }),
    ]);
    expect(a.respostas).toBe(2);
    expect(a.amplitudeMaximaPorResposta).toBe(0.5);
    expect(a.bandaSugerida).toBe(0.5);
  });

  it('descritor omitido em uma rodada NÃO vira par (omissão não é ruído); resposta com 1 rodada fica fora', () => {
    const a = aferir([
      rodada('r1', 1, { D1: 3, D2: 3 }), rodada('r1', 2, { D1: 3 }),
      rodada('r2', 1, { D1: 4 }),
    ]);
    expect(a.pares).toBe(1);
    expect(a.detalhePares[0].descritor).toBe('D1');
    expect(a.respostas).toBe(1);
  });

  it('grafias diferentes do mesmo descritor entre rodadas casam pela chave', () => {
    const a = aferir([
      rodada('r1', 1, { 'COO03_D6 — Busca de apoio': 3 }),
      rodada('r1', 2, { 'Busca de apoio (COO03_D6)': 3.2 }),
    ]);
    expect(a.pares).toBe(1);
    expect(a.detalhePares[0].amplitude).toBe(0.2);
  });
});
