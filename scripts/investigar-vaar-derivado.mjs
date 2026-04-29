#!/usr/bin/env node
// Investiga o que é calculável das tabelas existentes pra
// validar/derivar as 5 condicionalidades do VAAR (Lei 14.113/2020).
//
// Cond II: participação ≥ 80% Saeb — deveria sair de diag_saeb_snapshots.taxa_participacao
// Cond III: redução desigualdades — precisa decomposição raça/NSE; vamos ver
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

console.log('=== 1. Campos disponíveis em diag_saeb_snapshots ===');
const sample = await pg('diag_saeb_snapshots?select=*&limit=1');
console.log('Campos:', Object.keys(sample[0] || {}).sort().join(', '));

console.log('\n=== 2. Anos disponíveis em Saeb ===');
const anos = await pg('diag_saeb_snapshots?select=ano&order=ano.desc&limit=200');
const anosUniq = [...new Set(anos.map(x => x.ano))].sort((a, b) => b - a);
console.log('Anos:', anosUniq);

console.log('\n=== 3. Sample do JSON distribuicao (e similares) ===');
const dist = await pg('diag_saeb_snapshots?select=distribuicao,similares,total_municipio&limit=2');
console.log(JSON.stringify(dist[0], null, 2).slice(0, 800));

console.log('\n=== 4. Cond II — taxa_participacao por município (Ibipeba) ===');
// Pega escolas de Ibipeba e cruza com snapshots
const escIbipeba = await pg('diag_escolas?select=codigo_inep&municipio_ibge=eq.2912400&rede=eq.MUNICIPAL&limit=50');
const inepCodes = escIbipeba.map(e => e.codigo_inep);
console.log(`Escolas municipais Ibipeba: ${inepCodes.length}`);
if (inepCodes.length > 0) {
  const inList = inepCodes.map(c => `"${c}"`).join(',');
  const snaps = await pg(`diag_saeb_snapshots?select=codigo_inep,ano,etapa,taxa_participacao,presentes,matriculados&codigo_inep=in.(${inList})&ano=eq.2023&limit=200`);
  const byEtapa = {};
  for (const s of snaps) {
    if (!byEtapa[s.etapa]) byEtapa[s.etapa] = { presentes: 0, matriculados: 0, escolas: 0 };
    byEtapa[s.etapa].presentes += s.presentes || 0;
    byEtapa[s.etapa].matriculados += s.matriculados || 0;
    byEtapa[s.etapa].escolas++;
  }
  console.log('Cond II derivado (Saeb 2023, rede municipal Ibipeba):');
  for (const [etapa, agg] of Object.entries(byEtapa)) {
    const taxa = agg.matriculados > 0 ? (agg.presentes / agg.matriculados * 100).toFixed(1) : '—';
    console.log(`  ${etapa}: ${taxa}% (${agg.presentes}/${agg.matriculados}, ${agg.escolas} escolas)`);
  }
  // Cruzar com FNDE
  const oficial = await pg('diag_fundeb_vaar?select=cond_ii&municipio_ibge=eq.2912400&order=ano.desc&limit=1');
  console.log(`Cond II oficial FNDE: ${oficial[0]?.cond_ii}`);
}

console.log('\n=== 5. Cond III — busca campos raça/NSE em qualquer tabela ===');
// As distribuições no JSONB podem ter chaves de raça? Pouco provável (Saeb agregado).
// O que existe: distribuicao por NÍVEL DE PROFICIÊNCIA (0-9).
// Não há decomposição por raça/cor ou NSE no banco — esses vêm dos microdados originais.
console.log('Conclusão: cond_iii NÃO é calculável dos dados agregados existentes.');
console.log('Microdados Saeb por aluno (com raça/cor + NSE) não estão importados.');

console.log('\n=== 6. UFs com VAAR oficial — base pra mapa de cond_iv (ICMS Educacional) ===');
const vaarUfs = await pg('diag_fundeb_vaar?select=uf,cond_iv,beneficiario&ano=eq.2026&limit=20000');
const ufsByCond = {};
for (const v of vaarUfs) {
  if (!ufsByCond[v.uf]) ufsByCond[v.uf] = { atende: 0, naoAtende: 0, total: 0 };
  ufsByCond[v.uf].total++;
  if (v.cond_iv === true) ufsByCond[v.uf].atende++;
  else if (v.cond_iv === false) ufsByCond[v.uf].naoAtende++;
}
const sortedUfs = Object.entries(ufsByCond).sort((a, b) => b[1].total - a[1].total);
console.log('UF · atende cond_iv · não atende · total:');
for (const [uf, c] of sortedUfs.slice(0, 15)) {
  console.log(`  ${uf}: ${c.atende} / ${c.naoAtende} / ${c.total}`);
}
