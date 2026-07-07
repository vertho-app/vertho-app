// 2º passo: captura os gabaritos (IA2) + cenários ricos (IA3) já gerados no
// acme-demo e escreve lib/demo/acme-demo-extra-artifacts.json (keyed por cargo /
// cod_comp para o reset remapear). Rodar DEPOIS do pipeline.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/GAS/Vertho App/nextjs-app/package.json');
const { Client } = require('pg');
const url = fs.readFileSync('C:/GAS/Vertho App/nextjs-app/.env.local','utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const E = '455f9366-fb4f-4c58-a79e-f94193464744';
const CARGOS = ['Analista Financeiro', 'Coordenador de Operações', 'Gerente Comercial'];
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

// Gabaritos por cargo
const gabs = (await c.query('SELECT nome, gabarito FROM cargos_empresa WHERE empresa_id=$1 AND nome = ANY($2)', [E, CARGOS])).rows;
const gabaritos = {};
for (const g of gabs) gabaritos[g.nome] = g.gabarito;

// Cenários ricos por (cargo, cod_comp) — 1º cenário de cada competência
const cens = (await c.query(`
  SELECT bc.cargo, comp.cod_comp,
    bc.titulo, bc.descricao, bc.alternativas, bc.nota_check, bc.status_check,
    bc.tipo_cenario, bc.p1, bc.p2, bc.p3, bc.p4, bc.dimensoes_check,
    bc.justificativa_check, bc.sugestao_check, bc.alertas_check
  FROM banco_cenarios bc
  JOIN competencias comp ON comp.id = bc.competencia_id
  WHERE bc.empresa_id=$1 AND bc.cargo = ANY($2)
  ORDER BY bc.cargo, comp.cod_comp`, [E, CARGOS])).rows;
// dedup por (cargo, cod_comp) PREFERINDO o rico (com descritores_primarios)
const rico = (r) => !!r.alternativas?.perguntas?.[0]?.descritores_primarios;
const byKey = new Map();
for (const r of cens) { const k = `${r.cargo}|${r.cod_comp}`; const cur = byKey.get(k); if (!cur || (!rico(cur) && rico(r))) byKey.set(k, r); }
const cenarios = [...byKey.values()];

const out = { _meta: { capturado_em: 'MANUAL', fonte: 'IA2/IA3 no acme-demo' }, gabaritos, cenarios };
fs.writeFileSync('C:/GAS/Vertho App/nextjs-app/lib/demo/acme-demo-extra-artifacts.json', JSON.stringify(out, null, 2));
console.log(`Fixture escrito: ${Object.keys(gabaritos).length} gabaritos, ${cenarios.length} cenários.`);
console.log('gabaritos nao-nulos:', Object.entries(gabaritos).filter(([,v])=>v).map(([k])=>k).join(', '));
await c.end();
