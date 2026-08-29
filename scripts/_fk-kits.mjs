import pg from 'pg';
import fs from 'node:fs';
const env = fs.readFileSync('C:/GAS/Vertho App/nextjs-app/.env.local','utf8');
const url = (env.split(/\r?\n/).find(l=>l.startsWith('DATABASE_URL='))||'').replace('DATABASE_URL=','').trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const r = await c.query(`select tc.table_name, kcu.column_name, rc.delete_rule
 from information_schema.table_constraints tc
 join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
 join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
 where tc.constraint_type='FOREIGN KEY' and kcu.column_name in ('kit_id','brief_id')`);
r.rows.forEach(x=>console.log(`${x.table_name}.${x.column_name} → ON DELETE ${x.delete_rule}`));
if (!r.rows.length) console.log('(nenhuma FK encontrada em kit_id/brief_id)');
await c.end();
