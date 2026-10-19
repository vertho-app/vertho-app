import 'server-only';
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { confirmarPublicacoes } from '@/worker-hetzner/publicacao-bunny.mjs';

/**
 * Pool ÚNICO por instância (19/10/2026). Antes cada execução do cron `publicar_videos` (de 5 em 5
 * minutos) criava um pool e o encerrava: conexão TLS nova com o Postgres a cada rodada, até 4 por
 * rodada (o Sentry acusou o `pg-pool.connect` repetido como N+1). `attachDatabasePool` (Vercel) segura
 * a instância até as conexões ociosas saírem do pool, então nada fica pendurado quando a função
 * congela; `idleTimeoutMillis` curto é o que as solta.
 *
 * 🔴 O handler de `error` é obrigatório num pool de vida longa: conexão OCIOSA que cai (reinício do
 * Postgres, rede) emite `error` no pool, e evento `error` sem ouvinte derruba o processo.
 */
let pool: InstanceType<typeof pg.Pool> | null = null;

function poolDaPublicacao() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
      idleTimeoutMillis: 5000,
    });
    pool.on('error', (e: Error) => console.warn('[publicacoes-bunny] conexão ociosa do pool caiu:', e?.message));
    attachDatabasePool(pool);
  }
  return pool;
}

export async function publicarVideosProntos() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para publicação Bunny');
  return confirmarPublicacoes(poolDaPublicacao());
}
