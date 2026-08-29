import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

for (const tbl of ['colaboradores', 'trilhas']) {
  const cols = await c.query(`
    select column_name, is_nullable, column_default, data_type
    from information_schema.columns
    where table_schema='public' and table_name=$1
    order by ordinal_position;
  `, [tbl]);
  console.log(`\n== ${tbl}: NOT NULL sem default ==`);
  for (const r of cols.rows) {
    if (r.is_nullable === 'NO' && !r.column_default) console.log(`  ${r.column_name} (${r.data_type})`);
  }
  console.log(`  [total cols: ${cols.rows.length}]`);
}

// Bruna: valores das colunas-chave para clone
const emp = await c.query(`select id from empresas where slug='acme-demo'`);
const b = await c.query(`
  select id, email, nome_completo, cargo, perfil_dominante, telefone, user_id, ativo, status
  from colaboradores where empresa_id=$1 and nome_completo ilike 'Bruna%' limit 1
`, [emp.rows[0].id]);
console.log('\n== BRUNA (template colab) ==');
console.log(b.rows[0]);

const tr = await c.query(`
  select id, colaborador_id, empresa_id, competencia_foco, programa_modo, status,
    jsonb_array_length(coalesce(temporada_plano,'[]'::jsonb)) as sems,
    jsonb_array_length(coalesce(descritores_selecionados,'[]'::jsonb)) as descs
  from trilhas where colaborador_id=$1
`, [b.rows[0].id]);
console.log('\n== BRUNA trilha ==');
console.log(tr.rows[0]);

await c.end();
