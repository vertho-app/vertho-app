// Roda IA4 (interno) e congela os artefatos avaliados da Mariana no fixture
// extra (personaArtifacts). One-off do golden update.
import fs from 'node:fs';
const ENV = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of ENV.split(/\r?\n/)) { const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
const { createRequire } = await import('node:module');
const require = createRequire('C:/GAS/Vertho App/nextjs-app/package.json');
const { Client } = require('pg');
const E = '455f9366-fb4f-4c58-a79e-f94193464744';
const EMAIL = 'mariana.demo@vertho.ai';
const FIX = 'C:/GAS/Vertho App/nextjs-app/lib/demo/acme-demo-extra-artifacts.json';

const { rodarIA4 } = await import('@/actions/fase3');
console.log('Rodando IA4 (interno)...');
const r: any = await rodarIA4(E, {}, { internal: true });
console.log('IA4:', r?.success ? `ok (${r?.total ?? r?.processados ?? '?'} processados)` : 'FALHOU ' + (r?.error || JSON.stringify(r)?.slice(0,200)));

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const colab = (await c.query('SELECT id FROM colaboradores WHERE empresa_id=$1 AND email=$2', [E, EMAIL])).rows[0];

const respostas = (await c.query(`SELECT competencia_nome, avaliacao_ia, nivel_ia4, nota_ia4, pontos_fortes,
  pontos_atencao, feedback_ia4, payload_ia4, status_ia4 FROM respostas WHERE colaborador_id=$1`, [colab.id])).rows;
const das = (await c.query(`SELECT cargo, competencia, descritor, nota, origem, assessment_date
  FROM descriptor_assessments WHERE colaborador_id=$1 ORDER BY competencia, descritor`, [colab.id])).rows;
console.log(`Mariana: ${respostas.length} respostas avaliadas, ${das.length} descriptor_assessments`);
console.log('notas:', das.map(d=>d.nota).join(', '));

const fx = JSON.parse(fs.readFileSync(FIX, 'utf8'));
fx.personaArtifacts = fx.personaArtifacts || {};
fx.personaArtifacts[EMAIL] = { respostas, descriptor_assessments: das };
fs.writeFileSync(FIX, JSON.stringify(fx, null, 2));
console.log('Fixture atualizado com personaArtifacts da Mariana.');
await c.end();
