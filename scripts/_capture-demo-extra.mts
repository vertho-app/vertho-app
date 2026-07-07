// Re-gera os cenários IA3 dos cargos extra do acme-demo usando o competencia_id
// REAL de cada cenário existente (delete+replace limpo — evita duplicata por
// UUID). Gabaritos (IA2) já estão no fixture; aqui é só IA3.
import fs from 'node:fs';
const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of ENV.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const { createRequire } = await import('node:module');
const require = createRequire('C:/GAS/Vertho App/nextjs-app/package.json');
const { Client } = require('pg');
const E = '455f9366-fb4f-4c58-a79e-f94193464744';
const CARGOS = ['Analista Financeiro', 'Coordenador de Operações', 'Gerente Comercial'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const { rodarIA3Uma } = await import('@/actions/fase1');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

// competencia_id REAL de cada cenário existente (1 por cargo+cod_comp)
const rows = (await c.query(`
  SELECT DISTINCT ON (bc.cargo, comp.cod_comp) bc.competencia_id, bc.cargo, comp.cod_comp, comp.nome
  FROM banco_cenarios bc JOIN competencias comp ON comp.id = bc.competencia_id
  WHERE bc.empresa_id=$1 AND bc.cargo = ANY($2)
  ORDER BY bc.cargo, comp.cod_comp, bc.competencia_id`, [E, CARGOS])).rows;
console.log(`=== IA3 (${rows.length} cenários, competencia_id real) ===`);
for (const r of rows) {
  const res: any = await rodarIA3Uma(E, r.cargo, r.competencia_id, null, {}, true);
  console.log(`[IA3] ${r.cod_comp} ${r.nome.slice(0,28)}: ${res?.success ? 'ok' : 'FALHOU ' + (res?.error || '').slice(0,120)}`);
  await sleep(8000);
}
await c.end();
console.log('\nPIPELINE IA3 COMPLETO');
