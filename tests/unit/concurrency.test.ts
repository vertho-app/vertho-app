import { describe, it, expect } from 'vitest';
import { mapComLimite } from '@/lib/concurrency';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('mapComLimite', () => {
  it('preserva a ordem dos resultados independente da ordem de término', async () => {
    const r = await mapComLimite([50, 5, 20], 3, async (ms) => { await sleep(ms); return ms * 2; });
    expect(r).toEqual([100, 10, 40]);
  });

  it('nunca excede o limite de concorrência', async () => {
    let ativos = 0, pico = 0;
    await mapComLimite(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      ativos++; pico = Math.max(pico, ativos);
      await sleep(10);
      ativos--;
    });
    expect(pico).toBeLessThanOrEqual(4);
    expect(pico).toBeGreaterThan(1); // realmente paralelo
  });

  it('erro de fn propaga (tolerância é responsabilidade do caller)', async () => {
    await expect(
      mapComLimite([1, 2, 3], 2, async (n) => { if (n === 2) throw new Error('boom'); return n; }),
    ).rejects.toThrow('boom');
  });

  it('caller tolerante: try/catch dentro de fn preserva contadores ok/erro', async () => {
    const r = await mapComLimite([1, 2, 3, 4], 2, async (n) => {
      try { if (n % 2 === 0) throw new Error('x'); return 'ok'; } catch { return 'erro'; }
    });
    expect(r.filter(x => x === 'ok').length).toBe(2);
    expect(r.filter(x => x === 'erro').length).toBe(2);
  });

  it('lista vazia e limite maior que a lista', async () => {
    expect(await mapComLimite([], 5, async () => 1)).toEqual([]);
    expect(await mapComLimite([7], 10, async (n) => n)).toEqual([7]);
  });
});
