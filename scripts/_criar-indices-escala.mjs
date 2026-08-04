#!/usr/bin/env node
/**
 * Aplica migrations/197-indices-escala.sql (CREATE INDEX CONCURRENTLY).
 *
 * Não usa apply-migration.mjs porque ele envia o arquivo inteiro numa query
 * só — multi-statement vira transaction implícita e CONCURRENTLY é proibido
 * dentro de transaction. Aqui cada statement vai numa query separada.
 *
 * Uso:
 *   node --env-file=.env.local scripts/_criar-indices-escala.mjs
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ERRO: DATABASE_URL ausente. Rode com: node --env-file=.env.local scripts/_criar-indices-escala.mjs');
  process.exit(1);
}

const statements = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respostas_colaborador
     ON public.respostas (colaborador_id)`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_colaboradores_email_lower
     ON public.colaboradores (lower(email))`,
];

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log('✓ conectado');

for (const sql of statements) {
  const t0 = Date.now();
  await client.query(sql);
  console.log(`✓ ${sql.match(/idx_\w+/)[0]} (${Date.now() - t0}ms)`);
}

const { rows } = await client.query(
  `SELECT tablename, indexname FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('idx_respostas_colaborador', 'idx_colaboradores_email_lower')
   ORDER BY 1, 2`,
);
console.log('verificação:', rows);

// Sanidade: EXPLAIN de uma query quente de cada tabela deve usar Index Scan.
const colab = await client.query(`SELECT colaborador_id FROM respostas LIMIT 1`);
if (colab.rows[0]) {
  const plan = await client.query(
    `EXPLAIN SELECT 1 FROM respostas WHERE colaborador_id = $1`,
    [colab.rows[0].colaborador_id],
  );
  console.log('EXPLAIN respostas por colaborador_id:', plan.rows.map((r) => r['QUERY PLAN']).join(' | '));
}

await client.end();
console.log('✓ concluído');
