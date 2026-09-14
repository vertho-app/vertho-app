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
const somenteLeitura = process.argv.includes('--check');

async function verificarProducao() {
  const relacoes = (await db.query(`
    select c.relname,c.relrowsecurity
      from pg_class c
     where c.relnamespace='public'::regnamespace and c.relkind='r'
       and c.relname like 'sim_vendas_%'
  `)).rows;
  const esperadas = ['sim_vendas_config','sim_vendas_manutencao','sim_vendas_prompt_versions','sim_vendas_sessoes','sim_vendas_tentativas'];
  check(esperadas.every((nome) => relacoes.some((r) => r.relname === nome && r.relrowsecurity)), '249/250/251: tabelas e RLS');
  const colunas = (await db.query(`
    select column_name from information_schema.columns
     where table_schema='public' and table_name='sim_vendas_config'
  `)).rows.map((r) => r.column_name);
  check(['revisao','periodo_inicio','periodo_fim'].every((c) => colunas.includes(c)), '250: colunas de prazo/revisão');
  check((await db.query(`select count(*)::int n from sim_vendas_config
    where habilitado and (periodo_inicio is null or periodo_fim is null)`)).rows[0].n === 0, '250: nenhuma configuração ativa sem prazo');
  const funcoes = (await db.query(`
    select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in (
       'sim_vendas_configurar','sim_vendas_historico_equipe','sim_vendas_exportar',
       'sim_vendas_retencao_lote','sim_vendas_expurgar','sim_vendas_exclusao_snapshot',
       'sim_vendas_excluir_cadastro')
  `)).rows.map((r) => r.proname);
  check(new Set(funcoes).size === 7, '250/251: RPCs publicadas');
  for (const role of ['anon', 'authenticated']) {
    check((await db.query(`
      select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname like 'sim_vendas_%'
         and has_function_privilege($1,p.oid,'EXECUTE')
    `, [role])).rows[0].n === 0, `${role}: nenhuma RPC PACE executável`);
    check((await db.query(`
      select count(*)::int n from pg_class c
       where c.relnamespace='public'::regnamespace and c.relkind='r'
         and c.relname like 'sim_vendas_%' and has_table_privilege($1,c.oid,'SELECT')
    `, [role])).rows[0].n === 0, `${role}: nenhuma tabela PACE legível`);
  }
  const fks = (await db.query(`
    select conname,confdeltype,pg_get_constraintdef(oid) definicao
      from pg_constraint
     where conname in ('sim_vendas_config_empresa_id_fkey','sim_vendas_sessoes_empresa_id_fkey',
       'sim_vendas_sessoes_colab_fk','sim_vendas_tentativas_empresa_id_fkey','sim_vendas_tentativas_sessao_fk')
  `)).rows;
  check(fks.length === 5, '251: cinco FKs PACE conferidas');
  check(fks.filter((f) => f.conname !== 'sim_vendas_sessoes_colab_fk' && f.conname !== 'sim_vendas_tentativas_sessao_fk').every((f) => f.confdeltype === 'a'), '251: raízes sem cascata silenciosa');
  check(fks.find((f) => f.conname === 'sim_vendas_sessoes_colab_fk')?.confdeltype === 'n', '251: exclusão legada de pessoa preserva treino');
  check(fks.find((f) => f.conname === 'sim_vendas_tentativas_sessao_fk')?.confdeltype === 'c', '251: sessão ainda expurga tentativas');
  check((await db.query(`
    select count(*)::int n from sim_vendas_sessoes s
     where jsonb_typeof(s.estado->'prompts') is distinct from 'object'
        or exists (select 1 from jsonb_each(s.estado->'prompts') p
          where jsonb_typeof(p.value) <> 'object'
             or (p.value - array['id','hash','versao','modelo']) <> '{}'::jsonb)
  `)).rows[0].n === 0, '250: sessões guardam só referência/hash/versão/modelo dos prompts');
  console.log(JSON.stringify({ checks, modo: 'somente leitura', migrations: [249,250,251], status: 'ok' }));
}
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
if (somenteLeitura) {
  try { await verificarProducao(); } finally { await db.end(); }
  process.exit(0);
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
  const hardening = readFileSync('migrations/251-simulador-vendas-exclusao-segura.sql', 'utf8');
  await db.query(hardening);
  await db.query(hardening);
  checks++;
  for (const role of ['anon', 'authenticated']) {
    const tabs = (await db.query(
      "select c.relname,c.relrowsecurity,has_table_privilege($1,c.oid,'SELECT') acesso from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'sim_vendas_%'",
      [role],
    )).rows;
    check(tabs.length === 5 && tabs.every((t) => t.relrowsecurity && !t.acesso), `251: RLS/acesso direto ${role}`);
  }
  const empresaPreflight = randomUUID();
  await db.query("insert into empresas(id,nome,slug,segmento) values($1,'PACE preflight',$2,'corporativo')",
    [empresaPreflight, `pace-preflight-${empresaPreflight}`]);
  await db.query(`insert into sim_vendas_config(empresa_id,habilitado,briefing,updated_by,periodo_inicio,periodo_fim)
    values($1,false,$2,'verificacao@example.test',null,null)`,
    [empresaPreflight, 'Contexto fictício longo o bastante para validar o preflight da migration.']);
  await db.query('alter table sim_vendas_config drop constraint sim_vendas_config_periodo_check');
  await db.query('update sim_vendas_config set habilitado=true where empresa_id=$1', [empresaPreflight]);
  await falha(migration, [], 'SIM_PRAZO_BACKFILL');
  await db.query('update sim_vendas_config set habilitado=false where empresa_id=$1', [empresaPreflight]);
  await db.query(migration);
  await db.query('delete from sim_vendas_config where empresa_id=$1', [empresaPreflight]);
  await db.query('delete from empresas where id=$1', [empresaPreflight]);
  await db.query(hardening); // 250 testa o estado-base; 251 fecha novamente as FKs.
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

  // Exclusão 251: apenas dados fictícios criados dentro desta transação.
  const empresaFake = randomUUID(), colabLegado = randomUUID(), colabAdmin = randomUUID();
  const sessaoLegada = randomUUID(), sessaoAdmin = randomUUID();
  await db.query(
    "insert into empresas(id,nome,slug,segmento) values($1,'PACE verificação transacional',$2,'corporativo')",
    [empresaFake, `pace-check-${empresaFake}`],
  );
  await db.query(
    "insert into colaboradores(id,empresa_id,email,nome_completo) values($1,$3,$2,'Legado'),($4,$3,$5,'Administrativo')",
    [colabLegado, `pace-legado-${colabLegado}@example.test`, empresaFake, colabAdmin, `pace-admin-${colabAdmin}@example.test`],
  );
  for (const [sid, cid] of [[sessaoLegada, colabLegado], [sessaoAdmin, colabAdmin]]) {
    await db.query(
      'insert into sim_vendas_sessoes(id,empresa_id,owner_key,colaborador_id,estado) values($1,$2,$3,$4,$5)',
      [sid, empresaFake, `colab:${cid}`, cid, { id: sid, status: 'abandonada', mensagens: [] }],
    );
    await db.query(
      "insert into sim_vendas_tentativas(id,empresa_id,sessao_id,request_id,etapa,tentativa,modelo,prompt_hash) values($1,$2,$3,$4,'moderador',1,'verificacao','hash')",
      [randomUUID(), empresaFake, sid, randomUUID()],
    );
  }
  await db.query('delete from colaboradores where id=$1 and empresa_id=$2', [colabLegado, empresaFake]);
  check((await db.query('select colaborador_id from sim_vendas_sessoes where id=$1', [sessaoLegada])).rows[0].colaborador_id === null,
    'delete legado desassocia e preserva treino');
  await falha('delete from empresas where id=$1', [empresaFake], 'foreign key');

  const snapColab = (await db.query('select sim_vendas_exclusao_snapshot($1,$2) s', [empresaFake, colabAdmin])).rows[0].s;
  check(snapColab.sessoes === 1 && snapColab.tentativas === 1, 'snapshot administrativo limitado à pessoa');
  await falha(
    "select sim_vendas_excluir_cadastro($1,$2,$3,'pace-exclusao/2026-09-14_00000000-0000-4000-8000-000000000000.json.gz',$4,$5)",
    [empresaFake, colabAdmin, snapColab.hash, 'c'.repeat(64), 'verificacao@example.test'],
    'SIM_BACKUP',
  );
  const inserirBackup = async () => {
    const caminho = `pace-exclusao/2026-09-14_${randomUUID()}.json.gz`;
    await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['backups', caminho]);
    return caminho;
  };
  const backupColab = await inserirBackup();
  await db.query('select sim_vendas_excluir_cadastro($1,$2,$3,$4,$5,$6)',
    [empresaFake, colabAdmin, snapColab.hash, backupColab, 'c'.repeat(64), 'verificacao@example.test']);
  check((await db.query('select count(*)::int n from colaboradores where id=$1', [colabAdmin])).rows[0].n === 0,
    'exclusão confirmada remove pessoa e seu treino');
  check((await db.query("select count(*)::int n from admin_audit_log where acao='sim_vendas.exclusao_cadastro' and alvo=$1", [colabAdmin])).rows[0].n === 1,
    'auditoria obrigatória na mesma transação');

  const snapEmpresa = (await db.query('select sim_vendas_exclusao_snapshot($1,null) s', [empresaFake])).rows[0].s;
  const backupEmpresa = await inserirBackup();
  await db.query('select sim_vendas_excluir_cadastro($1,null,$2,$3,$4,$5)',
    [empresaFake, snapEmpresa.hash, backupEmpresa, 'd'.repeat(64), 'verificacao@example.test']);
  check((await db.query('select count(*)::int n from empresas where id=$1', [empresaFake])).rows[0].n === 0,
    'empresa e acervo PACE removidos atomicamente');
  check((await db.query("select count(*)::int n from admin_audit_log where acao='sim_vendas.exclusao_cadastro' and alvo=$1 and empresa_id is null", [empresaFake])).rows[0].n === 1,
    'auditoria sobrevive à exclusão da empresa');
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
