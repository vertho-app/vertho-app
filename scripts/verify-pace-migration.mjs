// Verificação transacional no banco configurado; SEM commit, cadastro ou cobrança.
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { sslSupabase } from './_pg-ssl.mjs';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase() });
await db.connect();
let checks = 0;
const check = (v, m) => {
  assert.ok(v, m);
  checks++;
};
async function falha(sql, args, codigo) {
  await db.query('SAVEPOINT falha_esperada');
  let erro;
  try {
    await db.query(sql, args);
  } catch (e) {
    erro = e;
  } finally {
    await db.query('ROLLBACK TO SAVEPOINT falha_esperada');
  }
  check(erro && (erro.message.includes(codigo) || erro.code === codigo), `esperado ${codigo}`);
}
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout='5s'");
  const migration = readFileSync('migrations/250-simulador-vendas-prazo-versoes.sql', 'utf8');
  const antes = (await db.query("select id,estado-'prompts' estado from sim_vendas_sessoes order by id"))
    .rows;
  await db.query(migration);
  await db.query(migration);
  checks++;
  assert.deepEqual(
    (await db.query("select id,estado-'prompts' estado from sim_vendas_sessoes order by id")).rows,
    antes,
  );
  checks++;
  for (const role of ['anon', 'authenticated']) {
    const funcs = (
      await db.query(
        "select p.oid::regprocedure::text nome,has_function_privilege($1,p.oid,'EXECUTE') acesso from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'sim_vendas_%'",
        [role],
      )
    ).rows;
    check(
      funcs.every((f) => !f.acesso),
      `${role} não executa RPCs`,
    );
    const tabs = (
      await db.query(
        "select c.relname,c.relrowsecurity,has_table_privilege($1,c.oid,'SELECT') acesso from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'sim_vendas_%'",
        [role],
      )
    ).rows;
    check(tabs.length === 4 && tabs.every((t) => t.relrowsecurity && !t.acesso), 'RLS/acesso direto');
  }
  check(
    (
      await db.query(
        "select count(*)::int n from pg_constraint where conrelid in ('sim_vendas_sessoes'::regclass,'sim_vendas_config'::regclass,'sim_vendas_tentativas'::regclass) and contype='f' and confdeltype='c'",
      )
    ).rows[0].n === 5,
    '5 FKs CASCADE',
  );
  for (const [base, esperado] of [
    ['2026-08-31T12:00:00Z', '2027-02-28T12:00:00.000Z'],
    ['2023-08-31T12:00:00Z', '2024-02-29T12:00:00.000Z'],
    ['2026-03-13T15:00:00Z', '2026-09-13T15:00:00.000Z'],
  ]) {
    check(
      (await db.query('select sim_vendas_retencao_expira($1) em', [base])).rows[0].em.toISOString() ===
        esperado,
      '6 meses com fim de mês/ano bissexto',
    );
  }
  const tenants = (await db.query('select id from empresas order by is_demo desc nulls last,id limit 2'))
    .rows;
  check(tenants.length === 2, 'duas empresas para isolamento');
  const a = tenants[0].id,
    b = tenants[1].id,
    owner = `admin:${randomUUID()}`,
    id = randomUUID();
  const briefing = 'Contexto exclusivamente fictício para a verificação transacional do PACE.';
  const revisao =
    (await db.query('select revisao from sim_vendas_config where empresa_id=$1', [a])).rows[0]?.revisao || 0;
  const cfg = 'select sim_vendas_configurar($1,$2,false,$3,null,null,$4) r';
  check(
    (await db.query(cfg, [a, revisao, briefing, 'verificacao@example.test'])).rows[0].r === revisao + 1,
    'CAS configuração',
  );
  await falha(cfg, [a, revisao, briefing, 'verificacao@example.test'], 'SIM_REVISAO');
  await falha(cfg, [randomUUID(), 0, briefing, 'verificacao@example.test'], 'SIM_EMPRESA');
  const colab = (await db.query('select id from colaboradores where empresa_id=$1 limit 1', [a])).rows[0];
  check(!!colab, 'colaborador para validar prazo no banco');
  await db.query(
    "update sim_vendas_config set habilitado=true,periodo_inicio=now()-interval '1 hour',periodo_fim=now()+interval '1 hour',limite_sessoes=1 where empresa_id=$1",
    [a],
  );
  for (let i = 0; i < 4; i++) {
    const treino = randomUUID();
    await db.query('select sim_vendas_criar($1,$2,$3,$4,$5,false)', [
      treino,
      a,
      `colab:${colab.id}`,
      colab.id,
      { id: treino, revisao: 0, status: 'preparando', cenario: null },
    ]);
    await db.query(
      "update sim_vendas_sessoes set estado=jsonb_set(estado,'{status}','\"abandonada\"') where id=$1",
      [treino],
    );
  }
  checks++; // Uso ilimitado mesmo com o campo legado limite_sessoes=1.
  await db.query(
    "update sim_vendas_config set periodo_inicio=now()-interval '2 hours',periodo_fim=now()-interval '1 hour' where empresa_id=$1",
    [a],
  );
  const fora = randomUUID();
  await falha(
    'select sim_vendas_criar($1,$2,$3,$4,$5,false)',
    [fora, a, `colab:${colab.id}`, colab.id, { id: fora, revisao: 0, status: 'preparando', cenario: null }],
    'SIM_PERIODO',
  );
  const estado = {
    id,
    revisao: 0,
    status: 'preparando',
    cenario: null,
    prompts: {},
    criadoEm: new Date().toISOString(),
  };
  await db.query('select sim_vendas_criar($1,$2,$3,null,$4,true)', [id, a, owner, estado]);
  check(
    (await db.query('select sim_vendas_criar($1,$2,$3,null,$4,true) id', [id, a, owner, estado])).rows[0]
      .id === id,
    'criação idempotente',
  );
  const outra = randomUUID();
  await falha(
    'select sim_vendas_criar($1,$2,$3,null,$4,true)',
    [outra, a, owner, { ...estado, id: outra }],
    'SIM_ABERTA',
  );
  await db.query("update sim_vendas_sessoes set updated_at=now()-interval '2 hours' where id=$1", [id]);
  check(
    (await db.query('select sim_vendas_recuperar($1,$2) n', [a, owner])).rows[0].n === 1,
    'preparação zumbi recuperada',
  );
  await db.query('select sim_vendas_criar($1,$2,$3,null,$4,true)', [
    outra,
    a,
    owner,
    { ...estado, id: outra },
  ]);
  const resumo = (await db.query('select resumo from sim_vendas_sessoes where id=$1', [outra])).rows[0]
    .resumo;
  check(resumo.status === 'preparando' && !JSON.stringify(resumo).includes('prompts'), 'projeção enxuta');
  const prompt = randomUUID(),
    literal = 'template fictício sem insumo de cliente',
    hash = createHash('sha256').update(literal).digest('hex');
  await db.query(
    "insert into sim_vendas_prompt_versions(id,etapa,versao,hash,conteudo) values($1,'gerente','verificacao',$2,$3)",
    [prompt, hash, literal],
  );
  await falha(
    'update sim_vendas_prompt_versions set conteudo=$2 where id=$1',
    [prompt, 'outro'],
    'SIM_PROMPT_IMUTAVEL',
  );
  await falha('delete from sim_vendas_prompt_versions where id=$1', [prompt], 'SIM_PROMPT_IMUTAVEL');
  const tentativa = randomUUID();
  await db.query(
    "update sim_vendas_sessoes set estado=jsonb_set(estado,'{encerradoEm}',to_jsonb((now()-interval '7 months')::text)),updated_at=now()-interval '7 months' where id=$1",
    [id],
  );
  await db.query(
    "insert into sim_vendas_tentativas(id,empresa_id,sessao_id,request_id,etapa,tentativa,modelo,prompt_hash,created_at) values($1,$2,$3,$4,'criador',1,'verificacao','hash',now()-interval '7 months')",
    [tentativa, a, id, randomUUID()],
  );
  const lote = async () => (await db.query('select sim_vendas_retencao_lote($1,10) lote', [a])).rows[0].lote;
  const cand = (await lote()).find((x) => x.id === id);
  check(!!cand, 'vencida incluída');
  const del = (empresa, h) => db.query('select sim_vendas_expurgar($1,$2,$3) ok', [empresa, id, h]);
  check(!(await del(b, cand.hash)).rows[0].ok, 'expurgo não cruza tenant');
  await db.query("update sim_vendas_tentativas set erro_codigo='mudou' where id=$1", [tentativa]);
  check(!(await del(a, cand.hash)).rows[0].ok, 'checkpoint alterado depois do backup preservado');
  await db.query("update sim_vendas_sessoes set lock_until=now()+interval '5 minutes' where id=$1", [id]);
  check(!(await lote()).some((x) => x.id === id), 'lease viva preservada');
  await db.query('update sim_vendas_sessoes set lock_until=null where id=$1', [id]);
  await db.query('update sim_vendas_tentativas set finished_at=now() where id=$1', [tentativa]);
  check(!(await lote()).some((x) => x.id === id), 'atividade técnica recente preservada');
  await db.query('update sim_vendas_tentativas set finished_at=null where id=$1', [tentativa]);
  const valido = (await lote()).find((x) => x.id === id);
  check((await del(a, valido.hash)).rows[0].ok, 'expurgo do snapshot exato');
  check(
    (await db.query('select count(*)::int n from sim_vendas_tentativas where sessao_id=$1', [id])).rows[0]
      .n === 0,
    'tentativas expurgadas junto',
  );
  const equipe = (await db.query('select * from sim_vendas_historico_equipe($1,$2,null,null)', [a, []])).rows;
  check(equipe.length === 0, 'escopo vazio não vira toda equipe');
  check(
    (await db.query('select sim_vendas_exportar($1,$2,null,null) r', [a, []])).rows[0].r.linhas.length === 0,
    'exportação sem equipe vazia',
  );
  console.log(
    JSON.stringify({
      checks,
      efeito: 'ROLLBACK integral',
      retencao: '6 meses corridos',
      schemaIdempotente: true,
    }),
  );
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
