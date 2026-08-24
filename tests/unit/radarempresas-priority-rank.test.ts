import { describe, it, expect } from 'vitest';
import { calcularPriorityRank, type ElegivelParaRank } from '@/lib/radarempresas/priority-rank';

/**
 * B7 (auditoria de 22/08) — quem entra no "top 10%" do Radar era decidido por
 * empate quebrado na ORDEM DE VARREDURA, não por critério.
 *
 * `Medido em 24/08` sobre as 74.285 linhas gravadas em `radarempresas_scores`:
 * o score de corte é 69,4 e **237 estabelecimentos empatam nele** — 185 entraram
 * e 52 idênticos ficaram de fora. E o corte é só a parte visível: há **461
 * scores distintos** para 74.285 linhas (99,97% empatam com alguém) e o maior
 * bloco tem **23.131 linhas no mesmo score**, que o percentil por índice
 * espalhava por ~31 pontos.
 */
describe('priority_rank: mesmo score, mesmo rank', () => {
  it('🔴 empate recebe UM rank só — não a posição dentro do bloco', () => {
    const eleg: ElegivelParaRank[] = [
      { id: 'a', score: 10 },
      { id: 'b', score: 50 }, { id: 'c', score: 50 }, { id: 'd', score: 50 },
      { id: 'e', score: 90 },
    ];

    const r = calcularPriorityRank(eleg);

    expect(
      new Set([r.get('b'), r.get('c'), r.get('d')]).size,
      'três empresas com score idêntico receberam ranks diferentes — a diferença é a ordem de varredura',
    ).toBe(1);
  });

  /**
   * A ordem de ENTRADA não pode mudar o resultado. Era exatamente por aqui que o
   * bug entrava: `.range()` sem `.order()` não garante a ordem entre páginas, e
   * o `sort` estável do JS preservava o que a varredura entregasse.
   */
  it('🔴 embaralhar a entrada não muda rank nenhum', () => {
    const base: ElegivelParaRank[] = Array.from({ length: 40 }, (_, i) => ({
      id: `id-${i}`,
      score: [10, 50, 50, 50, 90][i % 5],
    }));
    const invertida = [...base].reverse();

    const a = calcularPriorityRank(base);
    const b = calcularPriorityRank(invertida);

    for (const { id } of base) {
      expect(b.get(id), `o rank de ${id} depende da ordem em que a varredura o entregou`).toBe(a.get(id));
    }
  });

  /**
   * De que lado do corte o bloco fica é DECISÃO (ver o cabeçalho do módulo): o
   * rank é o do topo do bloco, então um corte nunca parte um empate — ele
   * inclui ou exclui o bloco inteiro.
   */
  it('o rank do bloco é o do TOPO (o corte inclui o bloco inteiro, nunca metade)', () => {
    // 11 elegíveis: 1 baixo, 9 empatados, 1 alto. O bloco vai dos índices 1..9.
    const eleg: ElegivelParaRank[] = [
      { id: 'baixo', score: 1 },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, score: 50 })),
      { id: 'alto', score: 99 },
    ];

    const r = calcularPriorityRank(eleg);

    // topo do bloco = índice 9 de 10 → 90.0 (regra base daria índice 1 → 10.0)
    expect(r.get('e0')).toBe(90);
    expect(r.get('e8')).toBe(90);
    expect(r.get('baixo')).toBe(0);
    expect(r.get('alto')).toBe(100);
  });

  /**
   * 🔑 O caso que motivou tudo, na proporção real: um bloco gigante empatado no
   * meio da distribuição. Antes, essas linhas idênticas recebiam ranks de ponta
   * a ponta do bloco; algumas cruzavam o corte de 90 e outras não.
   */
  it('🔴 bloco grande no meio da curva não é fatiado pelo corte de 90', () => {
    const eleg: ElegivelParaRank[] = [
      ...Array.from({ length: 100 }, (_, i) => ({ id: `baixo-${i}`, score: 10 })),
      ...Array.from({ length: 300 }, (_, i) => ({ id: `bloco-${i}`, score: 69.4 })),
      ...Array.from({ length: 20 }, (_, i) => ({ id: `alto-${i}`, score: 95 })),
    ];

    const r = calcularPriorityRank(eleg);
    const doBloco = eleg.filter((e) => e.id.startsWith('bloco-')).map((e) => r.get(e.id)!);
    const dentro = doBloco.filter((v) => v >= 90).length;

    expect(
      dentro === 0 || dentro === 300,
      `o bloco de 300 empatados foi partido: ${dentro} dentro e ${300 - dentro} fora, sem critério`,
    ).toBe(true);
  });

  it('a escala é 0–100 com uma casa, e os extremos existem', () => {
    const eleg: ElegivelParaRank[] = Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, score: i }));
    const r = calcularPriorityRank(eleg);
    expect(Math.min(...r.values())).toBe(0);
    expect(Math.max(...r.values())).toBe(100);
    for (const v of r.values()) expect(Math.round(v * 10)).toBe(v * 10);
  });

  it('lista vazia e lista de um só não quebram (1 elegível não tem percentil → 50)', () => {
    expect(calcularPriorityRank([]).size).toBe(0);
    expect(calcularPriorityRank([{ id: 'unico', score: 42 }]).get('unico')).toBe(50);
  });

  /**
   * Reprodução do achado com o formato do dado real: os 237 empatados no score
   * de corte 69,4, com 74.285 elegíveis. O que se prova aqui é a INVARIANTE —
   * nenhum dos 237 fica em lado diferente dos outros 236.
   */
  it('🔴 os 237 empatados no score de corte ficam todos do MESMO lado', () => {
    const N_ABAIXO = 66_800;
    const N_EMPATE = 237;
    const N_ACIMA = 74_285 - N_ABAIXO - N_EMPATE;

    const eleg: ElegivelParaRank[] = [
      ...Array.from({ length: N_ABAIXO }, (_, i) => ({ id: `b${i}`, score: 40 + (i % 290) / 10 })),
      ...Array.from({ length: N_EMPATE }, (_, i) => ({ id: `corte${i}`, score: 69.4 })),
      ...Array.from({ length: N_ACIMA }, (_, i) => ({ id: `a${i}`, score: 70 + (i % 300) / 10 })),
    ];

    const r = calcularPriorityRank(eleg);
    const ranks = new Set(Array.from({ length: N_EMPATE }, (_, i) => r.get(`corte${i}`)));

    expect(
      ranks.size,
      'os 237 idênticos receberam ranks diferentes — é o achado B7 na forma original',
    ).toBe(1);
  });
});
