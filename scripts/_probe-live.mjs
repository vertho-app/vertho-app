process.loadEnvFile('.env.local');
const pg = await import('pg');
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const fs = await import('fs');
for (let i = 0; i < 30; i++) {   // ~3 min max
  await new Promise(r => setTimeout(r, 6000));
  let log5 = ''; try { log5 = fs.readFileSync('/tmp/piloto-5.log', 'utf8'); } catch {}
  if (/reading 'trim'|undefined \(reading/.test(log5)) { console.log('VERDICT: FALHOU — trim error persiste no arm 5'); break; }
  const r = await c.query("select max(input_tokens) mx, count(*) n from ia_usage_log where source='simulator' and model='claude-sonnet-5'");
  const mx = r.rows[0].mx || 0, n = r.rows[0].n || 0;
  if (mx > 1800) { console.log(`VERDICT: OK — sonnet-5 progrediu (turno 3+, maxIn=${mx}, n=${n} rows)`); break; }
  if (i === 29) console.log(`VERDICT: indefinido (maxIn=${mx}, n=${n})`);
}
await c.end();
