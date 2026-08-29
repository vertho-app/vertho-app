import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.includes('xwuqrgrvakxtphbmudwj')) {
  throw new Error('DATABASE_URL não aponta para o Supabase de produção esperado');
}

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const { rows: counts } = await client.query(`
    SELECT etapa, ano, rede, COUNT(*)::integer AS total
    FROM diag_ideb_snapshots
    WHERE escopo = 'municipio' AND ano IN (2019, 2021, 2023, 2025)
    GROUP BY etapa, ano, rede
    ORDER BY etapa, ano, rede
  `);
  const { rows: ibipeba } = await client.query(`
    SELECT escopo, rede, etapa, ano, ideb, indicador_rendimento, nota_saeb
    FROM diag_ideb_snapshots
    WHERE municipio_ibge = '2912400' AND escopo = 'municipio'
    ORDER BY rede, etapa, ano
  `);
  const { rows: migration } = await client.query(`
    SELECT to_regclass('public.idx_diag_ideb_municipio_oficial_recente')::text AS index_name
  `);
  console.log(JSON.stringify({ counts, ibipeba, migration }, null, 2));
} finally {
  await client.end();
}
