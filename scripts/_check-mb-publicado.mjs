// Para cada (competência × descritor × cargo) dos gaps de kit da semana N,
// checa se há Módulo-Base PUBLICADO — exato (mesmo descritor) e no nível da
// competência (qualquer descritor, que ainda grounda via embedding).
// status='publicado' é o gate (MB nasce 'revisao'). Rodar:
//   node --env-file=.env.local scripts/_check-mb-publicado.mjs 2
import { createClient } from '@supabase/supabase-js';
const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2] || 2);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function norm(s) { return String(s || '').replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// mesma lógica de temKit p/ saber quem está SEM kit (reaproveitada)
async function temKit({ competencia, descritor, disc, cargo }) {
  const d1 = String(disc || '').trim().charAt(0).toUpperCase();
  if (!competencia || !descritor || !['D','I','S','C'].includes(d1)) return true; // ignora inválidos
  const { data: bs } = await sb.from('kit_briefs').select('id, empresa_id, cargo, descritor').eq('competencia', competencia).or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const briefs = (bs || []).filter((b) => norm(b.descritor) === norm(descritor));
  if (!briefs.length) return false;
  const cc = String(cargo || '').trim().toLowerCase();
  briefs.sort((a, b) => { const ac = cc && String(a.cargo||'').toLowerCase()===cc?1:0, bc = cc && String(b.cargo||'').toLowerCase()===cc?1:0; return ac!==bc? bc-ac : (b.empresa_id?1:0)-(a.empresa_id?1:0); });
  for (const b of briefs) { const { data: k } = await sb.from('kits').select('desafio').eq('brief_id', b.id).eq('disc', d1).eq('status','published').maybeSingle(); if (k?.desafio?.desafio_texto) return true; }
  return false;
}

// ids de competência (empresa + canônica) por nome + cargo
async function compIds(competencia, cargo) {
  const { data: cb } = await sb.from('competencias_base').select('id').ilike('nome', competencia);
  const baseIds = (cb || []).map((c) => c.id);
  let cq = sb.from('competencias').select('id').eq('empresa_id', EMP).ilike('nome', competencia);
  if (cargo && cargo.toLowerCase() !== 'todos') cq = cq.eq('cargo', cargo);
  const { data: ec } = await cq;
  return { baseIds, empIds: (ec || []).map((c) => c.id) };
}

// MB publicado p/ a competência? exato no descritor? (locale pt-BR)
async function mbPublicado(competencia, descritor, cargo) {
  const { baseIds, empIds } = await compIds(competencia, cargo);
  if (!baseIds.length && !empIds.length) return { compResolvida: false, anyPub: 0, exatoPub: 0 };
  const compOr = [empIds.length ? `competencia_id.in.(${empIds.join(',')})` : null, baseIds.length ? `competencia_base_id.in.(${baseIds.join(',')})` : null].filter(Boolean).join(',');
  const { data: mbs } = await sb.from('modulos_base_conteudo')
    .select('id, descritor, status, nivel_entrada, nivel_destino, empresa_id')
    .eq('locale', 'pt-BR').or(compOr).or(`empresa_id.is.null,empresa_id.eq.${EMP}`);
  const pub = (mbs || []).filter((m) => m.status === 'publicado');
  const exato = pub.filter((m) => norm(m.descritor) === norm(descritor));
  return { compResolvida: true, anyPub: pub.length, exatoPub: exato.length,
    niveisExato: [...new Set(exato.map((m) => `${m.nivel_entrada}→${m.nivel_destino}`))].join(',') };
}

// Coorte → gaps de kit (P1+P2) → set (competência, descritor, cargo)
const { data: trilhas } = await sb.from('trilhas').select('temporada_plano, colaboradores!inner(cargo, perfil_dominante)').eq('empresa_id', EMP).eq('status', 'ativa');
const gapSet = new Map();
for (const t of trilhas || []) {
  const c = t.colaboradores;
  const sem = (t.temporada_plano || []).find((s) => Number(s.semana) === SEMANA);
  for (const d of (sem?.conteudos_dia || []).slice(0, 2)) {
    if (!d?.competencia || !d?.descritor) continue;
    if (await temKit({ competencia: d.competencia, descritor: d.descritor, disc: c.perfil_dominante, cargo: c.cargo })) continue;
    const key = `${d.competencia} ::: ${d.descritor} ::: ${c.cargo}`;
    if (!gapSet.has(key)) gapSet.set(key, { competencia: d.competencia, descritor: d.descritor, cargo: c.cargo });
  }
}

console.log(`\n=== MB PUBLICADO p/ os gaps de kit · SEMANA ${SEMANA} · Ibipeba ===`);
console.log(`(descritor × cargo) distintos a gerar: ${gapSet.size}\n`);
const rows = [];
for (const g of gapSet.values()) {
  const r = await mbPublicado(g.competencia, g.descritor, g.cargo);
  rows.push({ ...g, ...r });
}
rows.sort((a, b) => (a.exatoPub - b.exatoPub) || (a.anyPub - b.anyPub));
for (const r of rows) {
  const flag = r.exatoPub > 0 ? '✅ grounded (MB exato)' : r.anyPub > 0 ? '🟡 só nível-competência (ungrounded no descritor)' : r.compResolvida ? '🔴 NENHUM MB publicado' : '⚠️ competência não resolve';
  console.log(`  ${flag}`);
  console.log(`     ${r.descritor}  ·  ${r.cargo}  ·  ${r.competencia}`);
  console.log(`     MB pub exato: ${r.exatoPub}${r.niveisExato ? ' ('+r.niveisExato+')' : ''}  |  MB pub na competência: ${r.anyPub}`);
}
const gr = rows.filter((r) => r.exatoPub > 0).length, am = rows.filter((r) => r.exatoPub === 0 && r.anyPub > 0).length, no = rows.filter((r) => r.anyPub === 0).length;
console.log(`\nRESUMO: ✅ grounded ${gr}  ·  🟡 parcial ${am}  ·  🔴 sem MB ${no}  (de ${rows.length})`);
