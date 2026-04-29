#!/usr/bin/env node
// Diagnóstica por que a estimativa VAAR não está aparecendo num município
// Uso: node scripts/debug-vaar-estimativa.mjs <ibge> [<ibge>...]
//      sem args, testa Campinas (3509502), Ibipeba (2912400), São Paulo (3550308)
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

const args = process.argv.slice(2);
const ibges = args.length > 0 ? args : ['3509502', '2912400', '3550308'];

for (const ibge of ibges) {
  const [esc, vaar, receita] = await Promise.all([
    pg(`diag_escolas?select=municipio,uf&municipio_ibge=eq.${ibge}&limit=1`),
    pg(`diag_fundeb_vaar?select=*&municipio_ibge=eq.${ibge}&order=ano.desc&limit=1`),
    pg(`diag_fundeb_receita_prevista?select=*&municipio_ibge=eq.${ibge}&order=ano.desc&limit=1`),
  ]);
  const nome = esc[0] ? `${esc[0].municipio}/${esc[0].uf}` : ibge;
  const v = vaar[0];
  const r = receita[0];
  console.log(`\n=== ${nome} (IBGE ${ibge}) ===`);
  console.log(`vaar: ${v ? `ano=${v.ano}, habilitado=${v.habilitado}, beneficiario=${v.beneficiario}` : 'NÃO HÁ'}`);
  console.log(`receita: ${r ? `ano=${r.ano}, vaaf=${r.complementacao_vaaf}, vaat=${r.complementacao_vaat}, vaar=${r.complementacao_vaar}` : 'NÃO HÁ'}`);

  // Estimativa só renderiza se: vaar.beneficiario === false E receitaPrevista existe E (vaaf+vaat) > 0
  const condBenef = v?.beneficiario === false;
  const base = (r?.complementacao_vaaf || 0) + (r?.complementacao_vaat || 0);
  console.log(`Estimativa renderizaria? `);
  console.log(`  vaar.beneficiario === false: ${condBenef} ${v?.beneficiario === true ? '(É BENEFICIÁRIO — não estima)' : v?.beneficiario === null ? '(beneficiario null — não estima)' : ''}`);
  console.log(`  receita existe: ${!!r}`);
  console.log(`  base VAAF+VAAT: ${base.toLocaleString('pt-BR')} ${base <= 0 ? '(SEM BASE — não estima)' : '✓'}`);
  console.log(`  ⇒ ${condBenef && r && base > 0 ? '✅ DEVERIA APARECER' : '❌ NÃO APARECE'}`);
}
