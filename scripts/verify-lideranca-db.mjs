// Contrato real em transação com rollback: nenhum registro de teste persiste.
import pg from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { sslSupabase } from "./_pg-ssl.mjs";
const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslSupabase(),
});
await db.connect();
try {
  await db.query("BEGIN");
  await db.query(
    readFileSync("migrations/260-simulador-lideranca.sql", "utf8"),
  );
  await db.query(
    readFileSync("migrations/260-simulador-lideranca.sql", "utf8"),
  );
  const empresa = (
    await db.query(
      "select id from empresas where is_demo = true order by id limit 1",
    )
  ).rows[0]?.id;
  assert(empresa, "precisa de tenant demo");
  const id = randomUUID(),
    owner = `admin:${randomUUID()}`,
    token = randomUUID(),
    ep = randomUUID();
  await db.query(
    "insert into sim_lideranca_jornadas(id,empresa_id,owner_key,estado,lock_token,lock_until) values($1,$2,$3,$4,$5,now()+interval '330 seconds')",
    [id, empresa, owner, { versao: "teste" }, token],
  );
  const salvar = async (overrides = {}) => {
    const p = {
      id,
      empresa,
      owner,
      token,
      revisao: 0,
      estado: { versao: "teste", recebido: true },
      episodio: { id: ep, indice: 0, repeticao: false },
      ...overrides,
    };
    return (
      await db.query(
        "select sim_lideranca_salvar($1,$2,$3,$4,$5,$6,$7) as ok",
        Object.values(p),
      )
    ).rows[0].ok;
  };
  assert.equal(await salvar({ empresa: randomUUID() }), false);
  assert.equal(await salvar({ owner: `admin:${randomUUID()}` }), false);
  assert.equal(await salvar({ token: randomUUID() }), false);
  assert.equal(await salvar({ revisao: 1 }), false);
  assert.equal(await salvar(), true);
  assert.equal(await salvar(), false);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from sim_lideranca_episodios where jornada_id=$1",
        [id],
      )
    ).rows[0].n,
    1,
  );
  const r = (
    await db.query(
      "select revisao,lock_token,estado from sim_lideranca_jornadas where id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(r.revisao, 1);
  assert.equal(r.lock_token, null);
  assert.equal(r.estado.recebido, true);
  for (const tabela of [
    "sim_lideranca_jornadas",
    "sim_lideranca_episodios",
    "sim_lideranca_chamadas",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      const privilege = await db.query(
        "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as acesso",
        [role, `public.${tabela}`],
      );
      assert.equal(privilege.rows[0].acesso, false);
    }
  }
  console.log(
    "DB OK: migration idempotente, tenant/proprietário/token/revisão, commit atômico e acesso direto negado.",
  );
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
