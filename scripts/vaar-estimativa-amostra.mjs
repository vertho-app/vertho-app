#!/usr/bin/env node
// Examina dados de VAAR pra projetar metodologia de estimativa
// (R$/matrícula entre beneficiários, por UF)
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

// Pega anos disponíveis em cada tabela
const vaarAnos = await pg('diag_fundeb_vaar?select=ano&order=ano.desc&limit=20');
const repAnos = await pg('diag_fundeb_repasses?select=ano&order=ano.desc&limit=20');
const recAnos = await pg('diag_fundeb_receita_prevista?select=ano&order=ano.desc&limit=20');
console.log('VAAR anos (sample):', [...new Set(vaarAnos.map((x) => x.ano))].slice(0, 5));
console.log('Repasses anos (sample):', [...new Set(repAnos.map((x) => x.ano))].slice(0, 5));
console.log('Receita prev. anos (sample):', [...new Set(recAnos.map((x) => x.ano))].slice(0, 5));

const ano = vaarAnos[0]?.ano;
console.log('Usando ano VAAR:', ano);

// Beneficiários: vaar.beneficiario=true → tem complementacao_vaar > 0
const beneficiarios = await pg(
  `diag_fundeb_vaar?select=municipio_ibge,uf,ano,beneficiario,habilitado&beneficiario=eq.true&ano=eq.${ano}&limit=20000`
);
console.log(`\nBeneficiários em ${ano}: ${beneficiarios.length}`);
const porUf = {};
for (const b of beneficiarios) {
  porUf[b.uf] = (porUf[b.uf] || 0) + 1;
}
console.log('Beneficiários por UF:', porUf);

// Sem matrículas no banco — usar razão complementacao_vaar / (vaaf + vaat) como proxy
console.log('\nCalculando razão VAAR / (VAAF+VAAT) entre beneficiários...');
const samples = [];
for (const b of beneficiarios.slice(0, 300)) {
  const recRes = await pg(`diag_fundeb_receita_prevista?select=complementacao_vaaf,complementacao_vaat,complementacao_vaar,total_receita_prevista&municipio_ibge=eq.${b.municipio_ibge}&ano=eq.${ano}&limit=1`);
  const r = recRes[0];
  if (!r) continue;
  const baseUniao = (r.complementacao_vaaf || 0) + (r.complementacao_vaat || 0);
  if (r.complementacao_vaar > 0 && baseUniao > 0) {
    samples.push({
      uf: b.uf,
      ibge: b.municipio_ibge,
      vaar: r.complementacao_vaar,
      vaaf: r.complementacao_vaaf,
      vaat: r.complementacao_vaat,
      base_uniao: baseUniao,
      total: r.total_receita_prevista,
      ratio_vs_base: r.complementacao_vaar / baseUniao,
      ratio_vs_total: r.total_receita_prevista > 0 ? r.complementacao_vaar / r.total_receita_prevista : null,
    });
  }
}

samples.sort((a, b) => a.ratio_vs_base - b.ratio_vs_base);
console.log(`Amostras válidas: ${samples.length}`);
const med = (arr, key) => {
  const s = [...arr].map((x) => x[key]).filter((v) => v != null).sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
console.log(`Razão VAAR / (VAAF+VAAT) — mediana=${med(samples, 'ratio_vs_base')?.toFixed(3)}`);
console.log(`Razão VAAR / total_receita — mediana=${med(samples, 'ratio_vs_total')?.toFixed(3)}`);

// Por UF
const byUf = {};
for (const s of samples) {
  byUf[s.uf] = byUf[s.uf] || [];
  byUf[s.uf].push(s);
}
console.log('\nPor UF (>= 3 amostras): mediana de VAAR / (VAAF+VAAT):');
const ufStats = Object.entries(byUf)
  .filter(([, v]) => v.length >= 3)
  .map(([uf, v]) => ({
    uf,
    n: v.length,
    mediana_ratio_base: med(v, 'ratio_vs_base'),
    mediana_ratio_total: med(v, 'ratio_vs_total'),
    mediana_vaar_BRL: Math.round(med(v, 'vaar')),
  }))
  .sort((a, b) => b.n - a.n);
console.table(ufStats);

// Sample de 5 municípios pra dar uma sanidade
console.log('\nAmostra de 5 beneficiários:');
console.table(samples.slice(0, 5).map((x) => ({
  uf: x.uf, ibge: x.ibge,
  vaar: Math.round(x.vaar),
  base_uniao: Math.round(x.base_uniao),
  ratio: x.ratio_vs_base.toFixed(3),
})));
