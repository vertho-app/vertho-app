#!/usr/bin/env node
// Acha uma escola estadual SP boa pra demo Bett: precisa ter Saeb + INSE + Censo
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

// Diagnóstico: ver redes distintas em SP
const redes = await pg(
  'rpc/diag_escolas_redes_sp'
);
console.log('Redes em SP:', JSON.stringify(redes));

// Sample 5 escolas SP qualquer pra ver formato
const sample = await pg('diag_escolas?select=codigo_inep,nome,municipio,rede,inse_grupo&uf=eq.SP&limit=5');
console.log('Sample SP:', JSON.stringify(sample, null, 2));

// Escolas SP com Saeb + INSE + Censo
const escolas = await pg(
  'diag_escolas?select=codigo_inep,nome,municipio,rede,zona,inse_grupo,etapas&uf=eq.SP&inse_grupo=not.is.null&limit=300'
);

console.log(`Achei ${escolas.length} escolas SP estaduais com INSE.`);

// Cruzar com Saeb (mais snapshots = mais histórico) e Censo
const candidatas = [];
for (const e of escolas.slice(0, 80)) {
  const [saeb, censo] = await Promise.all([
    pg(`diag_saeb_snapshots?select=ano,etapa,disciplina&codigo_inep=eq.${e.codigo_inep}&order=ano.desc&limit=20`),
    pg(`diag_censo_infra?select=score_basica,score_pedagogica,score_acessibilidade,score_conectividade&codigo_inep=eq.${e.codigo_inep}&limit=1`),
  ]);
  if (saeb.length >= 6 && censo.length > 0) {
    const c = censo[0];
    const scoreMedia = ([c.score_basica, c.score_pedagogica, c.score_acessibilidade, c.score_conectividade]
      .filter((x) => x != null)
      .reduce((a, b) => a + b, 0) / 4) || 0;
    candidatas.push({
      inep: e.codigo_inep,
      nome: e.nome,
      municipio: e.municipio,
      inse: e.inse_grupo,
      saebCount: saeb.length,
      scoreMedia: scoreMedia.toFixed(1),
      etapas: (e.etapas || []).join(','),
    });
  }
}

candidatas.sort((a, b) => b.saebCount - a.saebCount);
console.log('\nTop 10 candidatas (mais snapshots Saeb + Censo OK):');
console.table(candidatas.slice(0, 10));
