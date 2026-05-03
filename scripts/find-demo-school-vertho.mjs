#!/usr/bin/env node
// Busca escola ideal para demo radarbett:
// - publica (Vertho atua em pub)
// - tem ENEM (3º EM, demonstra a fonte nova)
// - tem Saeb com pctN01 > 30 (gap pedagogico)
// - tem Ideb com meta (gap gestor)
// - tem Censo com mistura (algum forte + algum lacuna pra mostrar detalhamento)
// - SP pra ressonar no Bett
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function pg(p) {
  const r = await fetch(`${URL}/rest/v1/${p}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

function contarSinais({ saeb, ideb, censo, enem }) {
  const s = [];
  // Saeb
  const saebRecente = [...(saeb || [])].sort((a, b) => b.ano - a.ano)[0];
  if (saebRecente?.distribuicao) {
    const pctN01 = (Number(saebRecente.distribuicao['0'] || 0) + Number(saebRecente.distribuicao['1'] || 0));
    if (pctN01 > 30) s.push('saeb_atencao');
    else if (pctN01 < 15 && pctN01 > 0) s.push('saeb_positivo');
  }
  // ENEM (com nota)
  const enemRec = [...(enem || [])].sort((a, b) => b.ano - a.ano)[0];
  if (enemRec?.media_geral != null) {
    const m = Number(enemRec.media_geral);
    if (m < 500) s.push('enem_baixo');
    else if (m >= 560) s.push('enem_forte');
    else s.push('enem_intermediario');
    // gap area
    const areas = [enemRec.media_cn, enemRec.media_ch, enemRec.media_lc, enemRec.media_mt]
      .filter((v) => v != null).map(Number);
    if (areas.length >= 3) {
      const spread = Math.max(...areas) - Math.min(...areas);
      if (spread >= 80) s.push('enem_gap');
    }
  }
  // Ideb
  if ((ideb || []).length > 0) {
    const ord = [...ideb].sort((a, b) => a.ano - b.ano);
    const rec = ord[ord.length - 1];
    const v = rec?.ideb != null ? Number(rec.ideb) : null;
    if (v != null) {
      if (rec?.meta != null) s.push('ideb_meta');
      else if (ord.length >= 2 && ord[0].ano !== rec.ano) s.push('ideb_trend');
      else s.push('ideb_patamar');
    }
  }
  // Censo
  if (censo) {
    const dims = [censo.score_basica, censo.score_pedagogica, censo.score_acessibilidade, censo.score_conectividade]
      .filter((x) => x != null).map(Number);
    const lacunas = dims.filter((v) => v < 50).length;
    const fortes = dims.filter((v) => v >= 75).length;
    if (lacunas > 0 && dims.length >= 2) s.push('censo_lacunas');
    if (fortes >= 2) s.push('censo_fortes');
  }
  return s;
}

async function avaliar(inep) {
  const [escola, censo, saeb, ideb, enem] = await Promise.all([
    pg(`diag_escolas?select=codigo_inep,nome,municipio,uf,rede,etapas&codigo_inep=eq.${inep}`).then((d) => d?.[0]),
    pg(`diag_censo_infra?select=score_basica,score_pedagogica,score_acessibilidade,score_conectividade&codigo_inep=eq.${inep}&order=ano.desc&limit=1`).then((d) => d?.[0] || null),
    pg(`diag_saeb_snapshots?select=ano,etapa,disciplina,distribuicao&codigo_inep=eq.${inep}&order=ano.desc&limit=12`),
    pg(`diag_ideb_snapshots?select=ano,etapa,ideb,meta&codigo_inep=eq.${inep}&order=ano.desc&limit=8`),
    pg(`diag_enem_escola_snapshots?select=ano,media_geral,media_cn,media_ch,media_lc,media_mt,media_redacao&codigo_inep=eq.${inep}&order=ano.desc&limit=3`),
  ]);
  if (!escola) return null;
  const sinais = contarSinais({ saeb: saeb || [], ideb: ideb || [], censo, enem: enem || [] });
  return { escola, sinais, saebN: (saeb || []).length, idebN: (ideb || []).length, enemN: (enem || []).length, censo };
}

async function main() {
  // Pool: escolas SP estaduais (publicas, geralmente tem 3º EM) com ENEM + Ideb+meta
  console.log('=== Pool: SP estaduais com ENEM ===');
  const enemRows = await pg('diag_enem_escola_snapshots?select=codigo_inep&participantes_com_media_geral=gt.30&limit=3000');
  const inepsComEnem = [...new Set((enemRows || []).map((r) => r.codigo_inep))];
  console.log(`ENEM distinct: ${inepsComEnem.length}`);

  // Filtra por SP estadual
  const escolasSP = await pg(`diag_escolas?select=codigo_inep,rede&uf=eq.SP&rede=eq.ESTADUAL&limit=5000`);
  const setSP = new Set((escolasSP || []).map((e) => e.codigo_inep));
  const candidatos = inepsComEnem.filter((inep) => setSP.has(inep));
  console.log(`Candidatos SP estaduais com ENEM: ${candidatos.length}`);

  const ricas = [];
  let i = 0;
  // limita a 400 pra nao demorar muito
  for (const inep of candidatos.slice(0, 400)) {
    i += 1;
    if (i % 50 === 0) console.log(`  Avaliadas ${i}...`);
    try {
      const r = await avaliar(inep);
      if (!r) continue;
      const tipos = new Set(r.sinais);
      // Critérios de "rica":
      // - tem ENEM com nota (sempre, pelo filtro)
      // - tem Saeb sinal (atencao OU positivo)
      // - tem Ideb sinal (com meta de preferencia)
      // - tem Censo (lacuna OU forte)
      const temEnem = r.sinais.some((s) => s.startsWith('enem_'));
      const temSaeb = r.sinais.some((s) => s.startsWith('saeb_'));
      const temIdeb = r.sinais.some((s) => s.startsWith('ideb_'));
      const temCenso = r.sinais.some((s) => s.startsWith('censo_'));
      // Score: priorizar variedade
      const score = (temEnem ? 2 : 0) + (temSaeb ? 1 : 0) + (temIdeb ? 1 : 0) +
        (temCenso ? 1 : 0) + (tipos.has('enem_gap') ? 1 : 0) +
        (tipos.has('censo_lacunas') && tipos.has('censo_fortes') ? 1 : 0) +
        (tipos.has('saeb_atencao') ? 1 : 0) +
        (tipos.has('ideb_meta') ? 1 : 0);
      if (temEnem && temSaeb && temIdeb && temCenso && score >= 6) {
        ricas.push({
          inep,
          nome: r.escola.nome,
          mun: `${r.escola.municipio}/${r.escola.uf}`,
          rede: r.escola.rede,
          score,
          n: r.sinais.length,
          saebN: r.saebN, idebN: r.idebN, enemN: r.enemN,
          sinais: r.sinais.join('+'),
        });
      }
    } catch {}
  }

  ricas.sort((a, b) => (b.score * 10 + b.n) - (a.score * 10 + a.n));
  console.log(`\n=== Top 8 candidatos demo Vertho (SP estaduais com ENEM+Saeb+Ideb+Censo, score >= 6) ===`);
  for (const c of ricas.slice(0, 8)) {
    console.log(`\n[${c.inep}] ${c.nome}`);
    console.log(`  ${c.mun} · ${c.rede} · Score ${c.score} · ${c.n} sinais`);
    console.log(`  Saeb: ${c.saebN}, Ideb: ${c.idebN}, ENEM: ${c.enemN}`);
    console.log(`  ${c.sinais}`);
  }
}

main().catch(console.error);
