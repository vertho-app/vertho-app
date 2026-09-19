/** Migração 265: contratos reais em transação revertida. --aplicar faz backup e aplica após validar. */
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sslSupabase } from './_pg-ssl.mjs';
const ssl = sslSupabase();
assert(
  ssl.rejectUnauthorized,
  'Configure SUPABASE_CA_CERT antes de validar/aplicar.',
);
assert(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('xwuqrgrvakxtphbmudwj'),
  'Projeto inesperado',
);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl });
await db.connect();
const sql = readFileSync(
  'migrations/265-simuladores-revisoes-snapshot.sql',
  'utf8',
)
  .replace(/^BEGIN;\s*/, '')
  .replace(/COMMIT;\s*$/, '');
const nomes = [
  'sim_vendas_exclusao_snapshot',
  'sim_vendas_backup_sessao',
  'sim_vendas_retencao_lote',
  'sim_vendas_expurgar',
];
try {
  const backup = {
    em: new Date().toISOString(),
    funcoes: (
      await db.query(
        "select proname,pg_get_functiondef(oid) definicao from pg_proc where pronamespace='public'::regnamespace and proname=any($1)",
        [nomes],
      )
    ).rows,
    vendas: (await db.query('select * from sim_vendas_revisoes order by id'))
      .rows,
    lideranca: (
      await db.query('select * from sim_lideranca_revisoes order by id')
    ).rows,
  };
  mkdirSync('backups', { recursive: true });
  writeFileSync(
    'backups/antes-migracao-265-' + Date.now() + '.json',
    JSON.stringify(backup, null, 2),
  );
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query(sql);
  await db.query(sql);
  const empresa = randomUUID(),
    outra = randomUUID(),
    sessao = randomUUID(),
    jornada = randomUUID();
  for (const id of [empresa, outra])
    await db.query(
      "insert into empresas(id,nome,slug,segmento) values($1,'Verificação temporária',$2,'corporativo')",
      [id, 'verificacao-' + id],
    );
  await db.query(
    "insert into sim_vendas_sessoes(id,empresa_id,owner_key,estado,updated_at) values($1,$2,$3,$4,now()-interval '7 months')",
    [
      sessao,
      empresa,
      'admin:' + randomUUID(),
      { id: sessao, status: 'concluida', encerradoEm: '2025-01-01T00:00:00Z' },
    ],
  );
  await db.query(
    'insert into sim_lideranca_jornadas(id,empresa_id,owner_key,estado) values($1,$2,$3,$4)',
    [jornada, empresa, 'admin:' + randomUUID(), { concluidos: [] }],
  );
  const snapshot = async () =>
    (
      await db.query('select sim_vendas_exclusao_snapshot($1,null) s', [
        empresa,
      ])
    ).rows[0].s;
  const antes = await snapshot();
  const contexto = {
    referencia: 'a'.repeat(64),
    encontros: [
      { id: randomUUID(), indice: 0, avaliacao: { sintese: 'Revisado' } },
    ],
  };
  await db.query(
    "insert into sim_vendas_revisoes(id,empresa_id,sessao_id,revisor_key,revisor_nome,parecer,motivo) values($1,$2,$3,$4,'Revisor fictício','discordo','Conferir evidência')",
    [randomUUID(), empresa, sessao, 'admin:' + randomUUID()],
  );
  await db.query(
    "insert into sim_lideranca_revisoes(id,empresa_id,jornada_id,revisor_key,revisor_nome,parecer,motivo,contexto) values($1,$2,$3,$4,'Revisor fictício','parcialmente','Conferir recorte',$5)",
    [randomUUID(), empresa, jornada, 'admin:' + randomUUID(), contexto],
  );
  const depois = await snapshot();
  assert.notEqual(antes.hash, depois.hash);
  assert.equal(depois.documento.vendas_revisoes.length, 1);
  assert.deepEqual(depois.documento.lideranca_revisoes[0].contexto, contexto);
  const b = (
    await db.query('select sim_vendas_backup_sessao($1,$2) b', [
      empresa,
      sessao,
    ])
  ).rows[0].b;
  assert.equal(b.revisoes.length, 1);
  const separado = (
    await db.query('select sim_vendas_exclusao_snapshot($1,null) s', [outra])
  ).rows[0].s;
  assert.equal(separado.documento.vendas_revisoes.length, 0);
  assert.equal(separado.documento.lideranca_revisoes.length, 0);
  assert.equal(
    (await db.query('select sim_vendas_retencao_lote($1,5) l', [empresa]))
      .rows[0].l.length,
    0,
    'Revisão recente preserva sessão',
  );
  await db.query(
    "update sim_vendas_revisoes set created_at=now()-interval '7 months' where empresa_id=$1",
    [empresa],
  );
  const lote = (
    await db.query('select sim_vendas_retencao_lote($1,5) l', [empresa])
  ).rows[0].l;
  assert.equal(lote.length, 1);
  assert.equal(lote[0].documento.revisoes.length, 1);
  const restauravel = lote[0].documento;
  await db.query(
    "insert into sim_vendas_revisoes(id,empresa_id,sessao_id,revisor_key,revisor_nome,parecer,motivo,created_at) values($1,$2,$3,$4,'Revisor fictício','concordo','Segunda revisão',now()-interval '7 months')",
    [randomUUID(), empresa, sessao, 'admin:' + randomUUID()],
  );
  assert.equal(
    (
      await db.query('select sim_vendas_expurgar($1,$2,$3) ok', [
        empresa,
        sessao,
        lote[0].hash,
      ])
    ).rows[0].ok,
    false,
    'Hash antigo não autoriza expurgo',
  );
  const atual = (
    await db.query('select sim_vendas_retencao_lote($1,5) l', [empresa])
  ).rows[0].l[0];
  assert.equal(
    (
      await db.query('select sim_vendas_expurgar($1,$2,$3) ok', [
        empresa,
        sessao,
        atual.hash,
      ])
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query(
        'select count(*)::int n from sim_vendas_revisoes where sessao_id=$1',
        [sessao],
      )
    ).rows[0].n,
    0,
  );
  // Restauração a partir do documento salvo; coluna gerada resumo é excluída da inserção.
  const cols = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='sim_vendas_sessoes' and is_generated='NEVER' order by ordinal_position",
    )
  ).rows.map((r) => r.column_name);
  await db.query(
    'insert into sim_vendas_sessoes(' +
      cols.join(',') +
      ') select ' +
      cols.join(',') +
      ' from jsonb_populate_record(null::sim_vendas_sessoes,$1)',
    [restauravel.sessao],
  );
  await db.query(
    'insert into sim_vendas_revisoes select * from jsonb_populate_recordset(null::sim_vendas_revisoes,$1)',
    [JSON.stringify(restauravel.revisoes)],
  );
  assert.equal(
    (
      await db.query('select sim_vendas_backup_sessao($1,$2) b', [
        empresa,
        sessao,
      ])
    ).rows[0].b.revisoes[0].motivo,
    'Conferir evidência',
  );
  for (const role of ['anon', 'authenticated'])
    for (const table of ['sim_vendas_revisoes', 'sim_lideranca_revisoes'])
      assert.equal(
        (
          await db.query(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') acesso",
            [role, table],
          )
        ).rows[0].acesso,
        false,
      );
  await db.query('ROLLBACK');
  console.log(
    'Validação OK: idempotência, hash, tenant, retenção, restauração e permissões. Transação revertida.',
  );
  if (process.argv.includes('--aplicar')) {
    await db.query('BEGIN');
    await db.query("SET LOCAL lock_timeout='5s'");
    await db.query(sql);
    await db.query('COMMIT');
    console.log('Migração 265 aplicada.');
  }
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
