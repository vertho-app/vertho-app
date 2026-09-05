// Verifica a migration e as leases dentro de uma transação sempre revertida.
// Uso: npx tsx --env-file=.env.local scripts/_recepcao-db-check.mjs
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sslSupabase } from './_pg-ssl.mjs';
import { abrirSessao } from '../lib/recepcao/core.ts';
import { cenario } from '../lib/recepcao/cenario.mjs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase() });
await db.connect();
try {
  await db.query('BEGIN');
  const sql = readFileSync(new URL('../migrations/240-recepcao-treinamento.sql', import.meta.url), 'utf8')
    .replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, '');
  await db.query(sql);
  const { rows: empresas } = await db.query('select id from empresas limit 1');
  assert.ok(empresas.length, 'É necessário um tenant existente para conferir a FK');
  const empresa = empresas[0].id, owner = 'recepcao-smoke@example.test', id = randomUUID(), token = randomUUID();
  const estado = abrirSessao(cenario); estado.id = id;
  await db.query('insert into recepcao_sessoes(id,empresa_id,owner_email,estado) values($1,$2,$3,$4)', [id, empresa, owner, estado]);
  const claim = async (emp, who, rev, tok) => (await db.query('select recepcao_claim($1,$2,$3,$4,$5) ok', [id, emp, who, rev, tok])).rows[0].ok;
  assert.equal(await claim(randomUUID(), owner, 0, token), false, 'outro tenant');
  assert.equal(await claim(empresa, 'outro@example.test', 0, token), false, 'outro proprietário');
  assert.equal(await claim(empresa, owner, 1, token), false, 'revisão divergente');
  assert.equal(await claim(empresa, owner, 0, token), true, 'lease inicial');
  assert.equal(await claim(empresa, owner, 0, randomUUID()), false, 'lease concorrente');
  const next = { ...estado, revisao: 1 };
  const commit = async tok => (await db.query('select recepcao_commit($1,$2,$3,$4,$5,$6,$7) ok', [id, empresa, owner, 0, tok, next, '[]'])).rows[0].ok;
  assert.equal(await commit(randomUUID()), false, 'token não pode sobrescrever');
  assert.equal(await commit(token), true, 'gravação atômica');
  assert.equal(await commit(token), false, 'commit repetido');
  const { rows: acl } = await db.query(`select
    has_table_privilege('authenticated','recepcao_sessoes','SELECT') as leitura,
    has_table_privilege('anon','recepcao_sessoes','INSERT') as escrita,
    has_function_privilege('authenticated','recepcao_claim(uuid,uuid,text,integer,uuid)','EXECUTE') as rpc,
    (select relrowsecurity from pg_class where oid='recepcao_sessoes'::regclass) as rls`);
  assert.deepEqual(acl[0], { leitura: false, escrita: false, rpc: false, rls: true });
  console.log('DB OK: migration, FK, isolamento, lease, revisão, commit único, RLS e ACL. Transação revertida.');
} finally {
  await db.query('ROLLBACK'); await db.end();
}
