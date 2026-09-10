import 'server-only';
import pg from 'pg';
import { confirmarPublicacoes } from '@/worker-hetzner/publicacao-bunny.mjs';

export async function publicarVideosProntos() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente para publicação Bunny');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
  try { return await confirmarPublicacoes(pool); }
  finally { await pool.end(); }
}
