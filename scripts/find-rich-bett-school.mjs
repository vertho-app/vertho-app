#!/usr/bin/env node
// Acha escola com sinais ricos para o /radarbett/escola/{inep}
// Replica a logica de computarSinais em app/radarbett/escola/[inep]/page.tsx
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
  if (!r.ok) return null;
  return r.json();
}

function computarSinais({ saeb, ideb, censo }) {
  const sinais = [];
  const saebRecente = [...(saeb || [])].sort((a, b) => b.ano - a.ano)[0];
  if (saebRecente?.distribuicao) {
    const pctN01 = Number(saebRecente.distribuicao['0'] || 0) + Number(saebRecente.distribuicao['1'] || 0);
    if (pctN01 > 30) sinais.push({ tipo: 'aprendizagem', detalhe: `pctN01 ${pctN01.toFixed(0)}% (atencao)` });
    else if (pctN01 < 15 && pctN01 > 0) sinais.push({ tipo: 'aprendizagem', detalhe: `pctN01 ${pctN01.toFixed(0)}% (positivo)` });
  }
  if ((ideb || []).length > 0) {
    const idebRecente = [...ideb].sort((a, b) => b.ano - a.ano)[0];
    if (idebRecente?.ideb != null && idebRecente?.meta != null) {
      sinais.push({ tipo: 'contexto-ideb', detalhe: `Ideb ${idebRecente.ideb} vs meta ${idebRecente.meta}` });
    }
  }
  if (censo) {
    const scores = [censo.score_basica, censo.score_pedagogica, censo.score_acessibilidade, censo.score_conectividade].filter((x) => x != null);
    const min = Math.min(...scores);
    if (min < 50 && scores.length >= 2) sinais.push({ tipo: 'contexto-censo', detalhe: `min score ${min.toFixed(0)}` });
  }
  if (sinais.length > 0) sinais.push({ tipo: 'oportunidade', detalhe: 'Onde a Vertho pode apoiar' });
  return sinais.slice(0, 4);
}

async function avaliar(inep) {
  const [escola, censo, saeb, ideb] = await Promise.all([
    pg(`diag_escolas?select=codigo_inep,nome,municipio,uf,rede,inse_grupo&codigo_inep=eq.${inep}`).then((d) => d?.[0]),
    pg(`diag_censo_infra?select=score_basica,score_pedagogica,score_acessibilidade,score_conectividade&codigo_inep=eq.${inep}&order=ano.desc&limit=1`).then((d) => d?.[0] || null),
    pg(`diag_saeb_snapshots?select=ano,etapa,disciplina,distribuicao&codigo_inep=eq.${inep}&order=ano.desc&limit=20`),
    pg(`diag_ideb_snapshots?select=ano,etapa,ideb,meta&codigo_inep=eq.${inep}&order=ano.desc&limit=10`),
  ]);
  if (!escola) return null;
  const sinais = computarSinais({ saeb: saeb || [], ideb: ideb || [], censo });
  const tipos = new Set(sinais.map((s) => s.tipo));
  return { escola, sinais, tipos, saebCount: (saeb || []).length, idebCount: (ideb || []).length };
}

async function main() {
  // Escola atual
  const atual = await avaliar('35915592');
  console.log('\n=== Escola atual (35915592 — Hugo Penteado) ===');
  console.log(`${atual?.escola?.nome} · ${atual?.escola?.municipio}/${atual?.escola?.uf}`);
  console.log(`Sinais: ${atual?.sinais.length} | tipos: ${[...(atual?.tipos || [])].join(', ')}`);
  for (const s of atual?.sinais || []) console.log(`  - ${s.tipo}: ${s.detalhe}`);

  // Pool: escolas com Ideb+meta presente (raras), com Saeb e idealmente Censo
  console.log('\n=== Buscando candidatas com Ideb+meta presente... ===');
  // Pega INEPs com meta nao-nula no Ideb (essa eh a restricao mais escassa)
  const idebRows = await pg('diag_ideb_snapshots?select=codigo_inep&meta=not.is.null&limit=2000');
  const inepsComMeta = [...new Set((idebRows || []).map((r) => r.codigo_inep))];
  console.log(`Pool com Ideb+meta: ${inepsComMeta.length} escolas distintas`);

  const ricas = [];
  let i = 0;
  for (const inep of inepsComMeta) {
    i += 1;
    if (i % 100 === 0) console.log(`  Avaliadas ${i}/${inepsComMeta.length}...`);
    try {
      const r = await avaliar(inep);
      if (!r) continue;
      // Queremos escola com gap PEDAGOGICO/GESTOR (Vertho atua), nao infra:
      // - contexto-ideb dispara (Ideb com meta) — narrativa de gestao
      // - aprendizagem dispara (pctN01 sai do meio) — narrativa pedagogica
      // - contexto-censo NAO dispara — infra OK, nao distrai
      const censoNaoDisparou = !r.tipos.has('contexto-censo');
      const temAprendizagem = r.tipos.has('aprendizagem');
      const temIdeb = r.tipos.has('contexto-ideb');
      const isPedagogica = censoNaoDisparou && temAprendizagem && temIdeb;

      // Bonus: Ideb abaixo da meta (gap real)
      const idebSinal = r.sinais.find((s) => s.tipo === 'contexto-ideb');
      let idebAbaixoMeta = false;
      if (idebSinal) {
        const m = idebSinal.detalhe.match(/Ideb (\d+\.?\d*) vs meta (\d+\.?\d*)/);
        if (m) idebAbaixoMeta = parseFloat(m[1]) < parseFloat(m[2]);
      }
      const aprendAtencao = !!r.sinais.find((s) => s.tipo === 'aprendizagem' && s.detalhe.includes('atencao'));

      if (isPedagogica && r.saebCount >= 4 && r.idebCount >= 2) {
        const bonus = (idebAbaixoMeta ? 5 : 0) + (aprendAtencao ? 5 : 0);
        r.bonus = bonus;
        ricas.push({
          inep,
          nome: r.escola.nome,
          mun: `${r.escola.municipio}/${r.escola.uf}`,
          rede: r.escola.rede,
          inse: r.escola.inse_grupo,
          saebN: r.saebCount,
          idebN: r.idebCount,
          bonus,
          idebAbaixo: idebAbaixoMeta,
          aprendAtenc: aprendAtencao,
          sinais: r.sinais.map((s) => `${s.tipo}:${s.detalhe}`).join(' | '),
        });
      }
    } catch {
      // ignora
    }
  }

  // Ordena por riqueza de dados (Saeb history + Ideb history)
  ricas.sort((a, b) => (b.bonus + b.saebN + b.idebN) - (a.bonus + a.saebN + a.idebN));
  console.log(`\n=== Top 10 candidatas (gap PEDAGOGICO: aprendizagem em atencao + Ideb abaixo da meta + infra OK) ===`);
  for (const c of ricas.slice(0, 10)) {
    console.log(`\n[${c.inep}] ${c.nome}`);
    console.log(`  ${c.mun} · ${c.rede} · INSE ${c.inse}`);
    console.log(`  ${c.saebN} Saeb snapshots, ${c.idebN} Ideb snapshots`);
    console.log(`  ${c.sinais}`);
  }
}

main().catch(console.error);
