import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Pool único por instância no cron `publicar_videos` (19/10/2026): antes, um pool novo (e conexão TLS
 * nova) a cada 5 minutos, encerrado no fim. O Sentry acusou o `pg-pool.connect` repetido como N+1.
 */
const h = vi.hoisted(() => ({
  pools: [] as any[],
  attach: vi.fn(),
  confirmar: vi.fn(async (_pool: unknown) => ({ examinados: 0 })),
}));

vi.mock('pg', () => {
  class Pool {
    opcoes: any;
    on = vi.fn();
    end = vi.fn();
    constructor(opcoes: any) { this.opcoes = opcoes; h.pools.push(this); }
  }
  return { default: { Pool } };
});
vi.mock('@vercel/functions', () => ({ attachDatabasePool: h.attach }));
vi.mock('@/worker-hetzner/publicacao-bunny.mjs', () => ({ confirmarPublicacoes: h.confirmar }));

describe('publicarVideosProntos: um pool por instância', () => {
  beforeEach(() => { vi.stubEnv('DATABASE_URL', 'postgres://x'); });

  it('🔴 duas rodadas reaproveitam o MESMO pool, preso ao ciclo da instância, e não o encerram', async () => {
    const { publicarVideosProntos } = await import('@/lib/video/publicacoes-bunny');
    await publicarVideosProntos();
    await publicarVideosProntos();
    expect(h.pools).toHaveLength(1);
    expect(h.attach).toHaveBeenCalledTimes(1);
    expect(h.attach).toHaveBeenCalledWith(h.pools[0]);
    expect(h.pools[0].end).not.toHaveBeenCalled();
    expect(h.confirmar).toHaveBeenCalledTimes(2);
    expect(h.confirmar.mock.calls[0][0]).toBe(h.confirmar.mock.calls[1][0]);
    // ociosas saem rápido (é o que deixa a instância congelar) e o teto é pequeno
    expect(h.pools[0].opcoes).toMatchObject({ max: 2, idleTimeoutMillis: 5000 });
  });

  it('🔴 o pool tem ouvinte de `error` (conexão ociosa que cai sem ouvinte derruba o processo)', async () => {
    const { publicarVideosProntos } = await import('@/lib/video/publicacoes-bunny');
    await publicarVideosProntos();
    expect(h.pools[0].on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
