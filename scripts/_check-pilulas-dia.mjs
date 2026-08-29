// Prontidão COMPLETA (núcleo + kit-DISC + deck de vídeo) das 2 pílulas de uma semana.
// Mede pós-overlay, replicando o match real do kit. Rodar:
//   node --env-file=.env.local scripts/_check-pilulas-dia.mjs 2
import { createClient } from '@supabase/supabase-js';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2] || 2);
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function normDescritor(s) {
  return String(s || '').replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
async function temKit({ competencia, descritor, disc, cargo }) {
  const d1 = String(disc || '').trim().charAt(0).toUpperCase();
  if (!competencia || !descritor || !['D','I','S','C'].includes(d1)) return false;
  const { data: bs } = await sb.from('kit_briefs').select('id, empresa_id, cargo, descritor')
    .eq('competencia', competencia).or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const alvo = normDescritor(descritor);
  const briefs = (bs || []).filter((b) => normDescritor(b.descritor) === alvo);
  if (!briefs.length) return false;
  const cc = String(cargo || '').trim().toLowerCase();
  briefs.sort((a, b) => {
    const ac = cc && String(a.cargo||'').toLowerCase()===cc?1:0, bc = cc && String(b.cargo||'').toLowerCase()===cc?1:0;
    if (ac!==bc) return bc-ac; return (b.empresa_id?1:0)-(a.empresa_id?1:0);
  });
  for (const b of briefs) {
    const { data: k } = await sb.from('kits').select('desafio').eq('brief_id', b.id).eq('disc', d1).eq('status','published').maybeSingle();
    if (k?.desafio?.desafio_texto) return true;
  }
  return false;
}
async function checaPilula(colab, d) {
  if (!d) return { falta: ['ausente-no-plano'] };
  const fd = d.conteudo?.formatos_disponiveis || {};
  const coreId = d.conteudo?.core_id;
  const ids = [...new Set([coreId, ...Object.values(fd).map((x)=>x?.id)].filter(Boolean))];
  const { data: mcs } = await sb.from('micro_conteudos').select('id, modulo_base_id').in('id', ids);
  const byId = Object.fromEntries((mcs||[]).map((m)=>[m.id,m]));
  const falta = [];
  if (!(coreId && byId[coreId])) falta.push('CORE');
  const kit = await temKit({ competencia: d.competencia, descritor: d.descritor, disc: colab.perfil_dominante, cargo: colab.cargo });
  if (!kit) falta.push('kit');
  const disc1 = String(colab.perfil_dominante||'').trim().charAt(0).toUpperCase();
  const moduloId = coreId ? byId[coreId]?.modulo_base_id : null;
  if (!moduloId) falta.push('video[sem-modulo]');
  else {
    const { data: cel } = await sb.from('videos_gerados').select('status')
      .eq('modulo_base_id', moduloId).eq('empresa_id', EMP).eq('cargo', colab.cargo).eq('disc_dominante', disc1)
      .neq('status','error').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if (cel?.status !== 'done') falta.push(`video[${cel? cel.status : 'sem-deck'}]`);
  }
  return { descritor: d.descritor, falta };
}

const { data: trilhas } = await sb.from('trilhas')
  .select('temporada_plano, colaboradores!inner(nome_completo, cargo, perfil_dominante)')
  .eq('empresa_id', EMP).eq('status','ativa');

const rows = [];
for (const t of trilhas || []) {
  const c = t.colaboradores;
  const sem = (t.temporada_plano||[]).find((s)=>Number(s.semana)===SEMANA);
  const dias = sem?.conteudos_dia || [];
  rows.push({ nome: c.nome_completo, disc: c.perfil_dominante,
    p1: await checaPilula(c, dias[0]), p2: await checaPilula(c, dias[1]) });
}

const full = (p) => p.falta.length === 0;
const p1full = rows.filter((r)=>full(r.p1)).length;
const p2full = rows.filter((r)=>full(r.p2)).length;
const ambos = rows.filter((r)=>full(r.p1)&&full(r.p2)).length;
console.log(`\n=== PÍLULAS · SEMANA ${SEMANA} · IBIPEBA · ${rows.length} colaboradores ===`);
console.log(`P1 (segunda) 100% pronta: ${p1full}/${rows.length}`);
console.log(`P2 (terça)   100% pronta: ${p2full}/${rows.length}`);
console.log(`AS DUAS prontas:          ${ambos}/${rows.length}`);
const cnt = (pk, layer) => rows.filter((r)=>r[pk].falta.some((f)=>f.startsWith(layer))).length;
console.log(`\nFALTAS   |  P1  |  P2`);
for (const l of ['CORE','kit','video'])
  console.log(`  ${l.padEnd(6)} |  ${String(cnt('p1',l)).padStart(2)}  |  ${String(cnt('p2',l)).padStart(2)}`);
