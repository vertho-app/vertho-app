import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * B6 (auditoria de 22/08) — a tela de Módulos-Base mostrava 200 de 283, sem
 * dizer, e as ações em lote reportavam contra a fatia.
 *
 * `Medido em 24/08:` `modulos_base_conteudo` tem **283 linhas** e o `.limit(200)`
 * era fixo — **83 módulos (29% do acervo) não apareciam** e não tinham como ser
 * alcançados por essa tela. E o corte era `updated_at DESC`, então os 83
 * excluídos eram os mais ANTIGOS: os que mais precisam de reauditoria.
 *
 * Pior que a invisibilidade: "selecionar tudo" + "aprovar e publicar" reportava
 * **"200/200 publicado(s)"** — o denominador do aviso era a fatia, e a mensagem
 * ensinava que o lote cobriu o acervo.
 */

const TOTAL_NO_BANCO = 283;

const mocks = vi.hoisted(() => ({ sb: null as any }));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mocks.sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => ({ email: 'a@b.c', userId: 'u1' }),
  requireUserAction: async () => ({ email: 'a@b.c', userId: 'u1' }),
}));

/** Linhas fabricadas na quantidade que a página pediu (o mock não fatia). */
function paginaDe(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i}`, titulo: `Módulo ${i}`, competencia_id: null }));
}

let pedidoDeRange: any[] = [];
let tamanhoDaPagina = 200;

beforeEach(() => {
  pedidoDeRange = [];
  tamanhoDaPagina = 200;
  mocks.sb = criarSupabaseMock({
    lista: (tabela) => (tabela === 'modulos_base_conteudo' ? paginaDe(tamanhoDaPagina) : []),
    contagem: (tabela) => (tabela === 'modulos_base_conteudo' ? TOTAL_NO_BANCO : null),
  });
  // O helper registra a cadeia; guardamos os argumentos de `.range()`.
  const origFrom = mocks.sb.client.from;
  mocks.sb.client.from = (t: string) => {
    const b = origFrom(t);
    const origRange = b.range;
    b.range = (...args: any[]) => { pedidoDeRange.push(args); return origRange(...args); };
    return b;
  };
});

async function listar(filtros: any = {}) {
  const mod = await import('@/actions/modulos-base');
  return (mod as any).listarModulos(filtros);
}

describe('B6 · listarModulos devolve o TOTAL, não só a fatia', () => {
  it('🔴 o total é o do conjunto filtrado, não o que veio na página', async () => {
    const r = await listar();

    expect(r.modulos).toHaveLength(200);
    expect(
      r.total,
      'a tela não tem como saber que existem 283 — sem isso "200 de 283" é indistinguível de "283 de 283"',
    ).toBe(TOTAL_NO_BANCO);
    expect(r.temMais, 'não avisou que há mais fora da tela').toBe(true);
  });

  it('🔴 pede `count: exact` — senão o total viria da própria fatia', async () => {
    await listar();

    const chamadas = mocks.sb.chamadas.filter((c: any) => c.metodo === 'select');
    const pediuCount = chamadas.some((c: any) => c.args?.[1]?.count === 'exact');
    expect(
      pediuCount,
      'sem count exact o denominador volta a ser o número de linhas carregadas — o próprio B6',
    ).toBe(true);
  });

  it('o offset chega ao banco (é o que torna a 2ª página possível)', async () => {
    await listar({ offset: 200 });

    expect(pedidoDeRange[0], 'a segunda página pediu o mesmo trecho da primeira').toEqual([200, 399]);
  });

  it('quando a última página fecha o conjunto, `temMais` é falso', async () => {
    tamanhoDaPagina = 83; // o resto de 283 depois de 200
    const r = await listar({ offset: 200 });

    expect(r.temMais, 'a tela continuaria oferecendo "carregar mais" sem ter mais').toBe(false);
    expect(r.total).toBe(TOTAL_NO_BANCO);
  });

  /**
   * ⚠️ Paginar por coluna que empata tem o mesmo defeito do B7: entre duas
   * páginas a ordem dentro do bloco empatado não é garantida, e a linha some ou
   * vem duas vezes. Hoje os 283 `updated_at` são distintos, mas o lote do
   * manuscrito grava vários módulos no mesmo instante.
   */
  it('🔴 a ordenação tem desempate por `id`', async () => {
    await listar();

    const orders = mocks.sb.chamadas.filter((c: any) => c.metodo === 'order').map((c: any) => c.args?.[0]);
    expect(orders[0]).toBe('updated_at');
    expect(
      orders,
      'sem desempate, dois módulos gravados no mesmo instante podem trocar de página entre uma leitura e outra',
    ).toContain('id');
  });

  /**
   * `_` e `%` são curinga no ILIKE. Os `%` das pontas são intencionais (busca
   * parcial); o que o operador digitou, não.
   */
  it('a busca escapa curinga do termo digitado', async () => {
    await listar({ busca: 'gestao_escolar' });

    const ilike = mocks.sb.chamadas.find((c: any) => c.metodo === 'ilike');
    expect(ilike?.args?.[1]).toBe('%gestao\\_escolar%');
  });

  it('erro de leitura não vira lista vazia silenciosa', async () => {
    mocks.sb.falharEm({ tabela: 'modulos_base_conteudo', op: 'select', mensagem: 'timeout no pool' });
    const r = await listar();
    expect(r.error, 'a falha virou "nenhum módulo encontrado" na tela').toMatch(/timeout no pool/);
  });
});
