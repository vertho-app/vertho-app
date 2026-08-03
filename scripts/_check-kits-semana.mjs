// Prontidão dos KITS (P1 e P2) de uma SEMANA de Ibipeba, medida PÓS-OVERLAY.
// Replica o match REAL de resolverDesafioDoKit (normDescritor + cargo>empresa>global + published).
// Rodar: node --env-file=.env.local scripts/_check-kits-semana.mjs 3
import { createClient } from '@supabase/supabase-js';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2] || 3);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function normDescritor(s) {
  return String(s || '')
    .replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

async function kitPublicado({ competencia, descritor, disc, cargo }) {
  if (!competencia || !descritor || !disc) return { ok: false, motivo: 'campos faltando' };
  const d1 = String(disc).trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(d1)) return { ok: false, motivo: 'disc-invalido' };
  const { data: briefsRaw } = await sb.from('kit_briefs').select('id, empresa_id, cargo, descritor')
    .eq('competencia', competencia).or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  if (!briefsRaw?.length) return { ok: false, motivo: 'sem brief p/ competência' };
  const alvo = normDescritor(descritor);
  const briefs = briefsRaw.filter((b) => normDescritor(b.descritor) === alvo);
  if (!briefs.length) return { ok: false, motivo: 'sem brief p/ descritor' };
  const cc = String(cargo || '').trim().toLowerCase();
  briefs.sort((a, b) => {
    const ac = cc && String(a.cargo || '').toLowerCase() === cc ? 1 : 0;
    const bc = cc && String(b.cargo || '').toLowerCase() === cc ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0);
  });
  for (const b of briefs) {
    const { data: kit } = await sb.from('kits').select('id, desafio').eq('brief_id', b.id).eq('disc', d1).eq('status', 'published').maybeSingle();
    if (kit?.desafio?.desafio_texto) return { ok: true };
  }
  return { ok: false, motivo: `descritor existe mas DISC ${d1} não publicado` };
}

const { data: trilhas } = await sb.from('trilhas')
  .select('colaborador_id, temporada_plano, colaboradores!inner(nome_completo, cargo, perfil_dominante)')
  .eq('empresa_id', EMP).eq('status', 'ativa');

const linhas = [];
for (const t of trilhas || []) {
  const c = t.colaboradores;
  const sem = (t.temporada_plano || []).find((s) => Number(s.semana) === SEMANA);
  // Semana de 'aplicacao'/'avaliacao' não tem pílula nem kit — não é buraco.
  if (sem && sem.tipo && sem.tipo !== 'conteudo') continue;
  const dias = sem?.conteudos_dia || [];
  const row = { nome: c.nome_completo, cargo: c.cargo, disc: c.perfil_dominante, p1: null, p2: null };
  for (const [i, key] of [[0, 'p1'], [1, 'p2']]) {
    const d = dias[i];
    if (!d) { row[key] = { descritor: '(ausente)', ok: false, motivo: 'sem pílula no plano' }; continue; }
    const r = await kitPublicado({ competencia: d.competencia, descritor: d.descritor, disc: c.perfil_dominante, cargo: c.cargo });
    row[key] = { descritor: d.descritor, ...r };
  }
  linhas.push(row);
}

const p1ok = linhas.filter((l) => l.p1?.ok).length;
const p2ok = linhas.filter((l) => l.p2?.ok).length;
const ambos = linhas.filter((l) => l.p1?.ok && l.p2?.ok).length;
console.log(`\n=== KITS · SEMANA ${SEMANA} · IBIPEBA · ${linhas.length} colaboradores ===`);
console.log(`P1 com kit publicado: ${p1ok}/${linhas.length}`);
console.log(`P2 com kit publicado: ${p2ok}/${linhas.length}`);
console.log(`AMBOS prontos:        ${ambos}/${linhas.length}\n`);

// Buracos agregados por (descritor × DISC-alvo), que é a unidade de autoria
const gaps = new Map();
for (const l of linhas) {
  const d1 = String(l.disc || '').charAt(0).toUpperCase();
  for (const p of ['p1', 'p2']) {
    if (l[p] && !l[p].ok) {
      const k = `${l[p].descritor} · DISC ${d1}`;
      const g = gaps.get(k) || { motivo: l[p].motivo, n: 0, quem: [] };
      g.n++; g.quem.push(l.nome.split(' ')[0]);
      gaps.set(k, g);
    }
  }
}
console.log('BURACOS por (descritor × DISC) — unidade de autoria do kit:');
for (const [k, g] of [...gaps.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ✗ ${k}  (${g.n}) — ${g.motivo}  [${g.quem.join(', ')}]`);
}
if (!gaps.size) console.log('  (nenhum — todos os kits P1 e P2 publicados)');
