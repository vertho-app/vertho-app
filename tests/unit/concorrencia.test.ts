import { describe, expect, it } from 'vitest';
import { mapComTeto } from '@/lib/concorrencia';

/**
 * Pool com teto usado pela narração da devolutiva (8 a 12 chamadas de TTS que
 * antes iam em série, 231s a 267s de ponta a ponta).
 *
 * Os dois riscos da paralelização não aparecem num teste de "funcionou": a
 * ORDEM (áudio remontado por ordem de chegada sai com as frases embaralhadas) e
 * o TETO (sem ele, 12 chamadas simultâneas derrubam o Vertex com 429). É o que
 * está aqui.
 */
describe('mapComTeto', () => {
  it('devolve na ordem dos ITENS, mesmo quando o último termina primeiro', async () => {
    const itens = ['a', 'b', 'c', 'd', 'e'];
    // 'e' resolve quase imediatamente; 'a' é o mais lento
    const atrasos: Record<string, number> = { a: 40, b: 30, c: 20, d: 10, e: 0 };

    const saida = await mapComTeto(itens, 5, async (item) => {
      await new Promise((r) => setTimeout(r, atrasos[item]));
      return item.toUpperCase();
    });

    expect(saida).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('nunca passa do teto de execuções simultâneas', async () => {
    let simultaneas = 0;
    let pico = 0;

    await mapComTeto(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
    });

    expect(pico).toBe(4);
  });

  it('usa todos os trabalhadores permitidos — não vira série disfarçada', async () => {
    let simultaneas = 0;
    let pico = 0;

    await mapComTeto(Array.from({ length: 8 }, (_, i) => i), 4, async () => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 10));
      simultaneas--;
    });

    // com teto 4 e 8 itens, um pool que rodasse em série marcaria pico 1
    expect(pico).toBeGreaterThan(1);
  });

  it('não cria mais trabalhadores do que itens', async () => {
    let pico = 0;
    let simultaneas = 0;

    await mapComTeto(['x', 'y'], 10, async (item) => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
      return item;
    });

    expect(pico).toBeLessThanOrEqual(2);
  });

  it('lista vazia não chama nada e devolve vazio', async () => {
    let chamou = false;
    const saida = await mapComTeto([], 4, async () => { chamou = true; });
    expect(saida).toEqual([]);
    expect(chamou).toBe(false);
  });

  it('teto inválido não vira zero trabalhador (travaria para sempre)', async () => {
    const saida = await mapComTeto([1, 2, 3], 0, async (n) => n * 2);
    expect(saida).toEqual([2, 4, 6]);
  });

  it('falha de um item rejeita o conjunto: meia narração não se entrega', async () => {
    await expect(mapComTeto([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('TTS 400');
      return n;
    })).rejects.toThrow('TTS 400');
  });
});
