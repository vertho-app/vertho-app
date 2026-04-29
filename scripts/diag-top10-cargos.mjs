#!/usr/bin/env node
// Diagnostica por que /admin/cargos não mostra Top 10 mesmo depois da IA rodar.
// Uso: node scripts/diag-top10-cargos.mjs <empresaId>
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function pg(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return r.json();
}

const empresaId = process.argv[2];
if (!empresaId) {
  // Lista empresas
  const empresas = await pg('empresas?select=id,nome&order=nome&limit=20');
  console.log('Empresas (passe o id como arg):');
  console.table(empresas);
  process.exit(0);
}

const empresa = await pg(`empresas?select=id,nome&id=eq.${empresaId}&limit=1`);
console.log(`\nEmpresa: ${empresa[0]?.nome || empresaId}\n`);

// 1. Cargos em cargos_empresa
const cargosEmp = await pg(`cargos_empresa?select=id,nome,top5_workshop&empresa_id=eq.${empresaId}&order=nome`);
console.log(`=== cargos_empresa (${cargosEmp.length}) ===`);
console.table(cargosEmp.map(c => ({ id: c.id?.slice(0, 8), nome: c.nome, top5: (c.top5_workshop || []).length })));

// 2. Cargos distintos em colaboradores
const colabs = await pg(`colaboradores?select=cargo&empresa_id=eq.${empresaId}&cargo=not.is.null&limit=2000`);
const cargosColab = [...new Set(colabs.map(c => c.cargo))].sort();
console.log(`\n=== cargos em colaboradores (${cargosColab.length} distintos) ===`);
cargosColab.slice(0, 20).forEach(c => console.log(`  "${c}"`));

// 3. Top10 cargos
const top10 = await pg(`top10_cargos?select=cargo,posicao,competencia_id,competencia:competencias(nome)&empresa_id=eq.${empresaId}&order=cargo&limit=200`);
console.log(`\n=== top10_cargos (${top10.length}) ===`);
const porCargo = {};
for (const t of top10) {
  if (!porCargo[t.cargo]) porCargo[t.cargo] = [];
  porCargo[t.cargo].push({ pos: t.posicao, comp: t.competencia?.nome || `[id ${t.competencia_id?.slice(0, 8)}]` });
}
for (const [cargo, items] of Object.entries(porCargo)) {
  console.log(`  "${cargo}": ${items.length} itens`);
}

// 4. Cruzamento — quais cargos em cargos_empresa NÃO têm top10?
console.log(`\n=== Diagnóstico ===`);
for (const ce of cargosEmp) {
  const tem = porCargo[ce.nome];
  console.log(`  ${tem ? '✓' : '✗'} "${ce.nome}" → ${tem ? tem.length + ' top10' : 'SEM top10 (ou nome diverge)'}`);
}
console.log('\n=== Cargos em top10 que não bate com cargos_empresa ===');
for (const cargoTop of Object.keys(porCargo)) {
  const bate = cargosEmp.find(ce => ce.nome === cargoTop);
  if (!bate) console.log(`  ⚠ top10 cargo "${cargoTop}" não tem registro em cargos_empresa`);
}
