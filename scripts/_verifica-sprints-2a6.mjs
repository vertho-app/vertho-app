// Verificação pós-Sprints 2-6 (auditoria 22/08). SOMENTE LEITURA.
// Confere no banco vivo: mig 222 (idempotência chat), 223 (colab_key),
// 224 (relatorios_tipo_check com 9 tipos) e a vigília gate.forbidden.
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (label, sql) => {
  try {
    const r = await client.query(sql);
    console.log(`\n=== ${label} ===`);
    console.table(r.rows);
  } catch (e) {
    console.log(`\n=== ${label} === ERRO: ${e.message}`);
  }
};

await q('mig 224 — constraint relatorios_tipo_check',
  `select pg_get_constraintdef(oid) as def from pg_constraint where conname='relatorios_tipo_check'`);

await q('mig 222 — coluna client_turn_id + índice',
  `select
     (select count(*) from information_schema.columns where table_name='mensagens_chat' and column_name='client_turn_id') as coluna,
     (select count(*) from pg_indexes where indexname='uq_mensagens_chat_turno_cliente') as indice`);

await q('mig 223 — coluna gerada colab_key',
  `select count(*) as colab_key from information_schema.columns where table_name='relatorios' and column_name='colab_key'`);

await q('tipos em relatorios (os 4 da fase 5 devem ser 0 — nunca gravaram)',
  `select tipo, count(*) as n from relatorios group by tipo order by n desc`);

await q("vigília gate.forbidden desde 23/08",
  `select detalhes->>'motivo' as motivo, detalhes->>'mesmo_tenant' as mesmo_tenant,
          alvo as action, count(*) as n, max(criado_em) as ultimo
   from admin_audit_log
   where acao='gate.forbidden' and criado_em > '2026-08-23'::timestamptz
   group by 1,2,3 order by n desc`);

await client.end();
