import { describe, expect, it } from 'vitest';
import { lerTudoPaginado, PAGINA_POSTGREST } from '@/lib/paginacao';

/**
 * `lerTudoPaginado`: o PostgREST corta cada consulta em 1.000 linhas sem avisar. O
 * helper lê em páginas e, com `max`, para no teto sem pedir a mais. O `total` é o
 * `count` da PRIMEIRA página (o denominador que diz se o teto cortou algo).
 *
 * `fonte(N)` finge um banco de N linhas que respeita o `range` pedido e registra
 * cada pedido, para provar QUAIS intervalos foram pedidos, e não só o que voltou.
 */
function fonte(n: number, opcoes: { count?: boolean; falharNoPedido?: number } = {}) {
  const pedidos: Array<[number, number]> = [];
  const fabrica = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    if (opcoes.falharNoPedido === pedidos.length) return { data: null, error: { message: 'timeout no pool' } };
    const data = Array.from({ length: Math.max(0, Math.min(ate, n - 1) - de + 1) }, (_, i) => ({ i: de + i }));
    // o servidor corta em 1.000 mesmo que o intervalo pedido seja maior
    return { data: data.slice(0, PAGINA_POSTGREST), error: null, count: opcoes.count && de === 0 ? n : undefined };
  };
  return { fabrica, pedidos };
}

describe('lerTudoPaginado', () => {
  it('sem max lê tudo, em páginas de 1.000 (o comportamento de sempre)', async () => {
    const f = fonte(2300);
    const r = await lerTudoPaginado(f.fabrica);
    expect(r.data).toHaveLength(2300);
    expect(r.data.map((x: any) => x.i)).toEqual(Array.from({ length: 2300 }, (_, i) => i));
    expect(f.pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(r.error).toBeUndefined();
  });

  it('número exato de páginas cheias: a página seguinte vem vazia e fecha', async () => {
    const f = fonte(2000);
    const r = await lerTudoPaginado(f.fabrica);
    expect(r.data).toHaveLength(2000);
    expect(f.pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('max corta no teto e o último pedido só pede o que falta', async () => {
    const f = fonte(5000);
    const r = await lerTudoPaginado(f.fabrica, { max: 2500 });
    expect(r.data).toHaveLength(2500);
    expect(f.pedidos).toEqual([[0, 999], [1000, 1999], [2000, 2499]]);
  });

  it('max menor que uma página é um pedido só, do tamanho do teto', async () => {
    const f = fonte(5000);
    const r = await lerTudoPaginado(f.fabrica, { max: 500 });
    expect(r.data).toHaveLength(500);
    expect(f.pedidos).toEqual([[0, 499]]);
  });

  it('max maior que o que existe: para na página curta, sem pedir mais', async () => {
    const f = fonte(1200);
    const r = await lerTudoPaginado(f.fabrica, { max: 10000 });
    expect(r.data).toHaveLength(1200);
    expect(f.pedidos).toEqual([[0, 999], [1000, 1999]]);
  });

  it('total é o count da PRIMEIRA página; sem count pedido é null', async () => {
    const comCount = await lerTudoPaginado(fonte(2300, { count: true }).fabrica, { max: 1000 });
    expect(comCount.total).toBe(2300);
    expect(comCount.data).toHaveLength(1000);
    const semCount = await lerTudoPaginado(fonte(2300).fabrica, { max: 1000 });
    expect(semCount.total).toBeNull();
  });

  it('erro numa página devolve o que já veio e a mensagem (quem chama decide)', async () => {
    const f = fonte(5000, { falharNoPedido: 2 });
    const r = await lerTudoPaginado(f.fabrica);
    expect(r.error).toBe('timeout no pool');
    expect(r.data).toHaveLength(1000);
    expect(f.pedidos).toHaveLength(2);
  });

  it('banco vazio: uma página, zero linhas, sem erro', async () => {
    const f = fonte(0, { count: true });
    const r = await lerTudoPaginado(f.fabrica, { max: 100 });
    expect(r.data).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.error).toBeUndefined();
    expect(f.pedidos).toEqual([[0, 99]]);
  });
});
