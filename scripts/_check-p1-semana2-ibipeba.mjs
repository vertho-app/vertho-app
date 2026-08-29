// Prontidão da P1 (pílula 1) da SEMANA 2 de Ibipeba, medida PÓS-OVERLAY por colaborador.
// Replica a lógica REAL de match do Kit (resolverDesafioDoKit: normDescritor + preferência
// cargo>empresa>global + status='published') e checa as 3 camadas: base, kit (DISC), vídeo.
// Rodar: node --env-file=.env.local scripts/_check-p1-semana2-ibipeba.mjs
import { createClient } from '@supabase/supabase-js';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// cópia EXATA de lib/blueprint/to-descriptors.ts::normDescritor
function normDescritor(s) {
  return String(s || '')
    .replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// cópia da lógica de resolverDesafioDoKit (match do kit por competência+descritor+disc+cargo)
async function kitPublicado({ empresaId, competencia, descritor, disc, cargo }) {
  if (!competencia || !descritor || !disc) return null;
  const d1 = String(disc).trim().charAt(0).toUpperCase();
  if (!['D', 'I', 'S', 'C'].includes(d1)) return { erro: 'disc-invalido' };
  let q = sb.from('kit_briefs').select('id, empresa_id, cargo, descritor').eq('competencia', competencia);
  q = empresaId ? q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`) : q.is('empresa_id', null);
  const { data: briefsRaw } = await q;
  if (!briefsRaw?.length) return null;
  const alvo = normDescritor(descritor);
  const briefs = briefsRaw.filter((b) => normDescritor(b.descritor) === alvo);
  if (!briefs.length) return null;
  const cc = String(cargo || '').trim().toLowerCase();
  briefs.sort((a, b) => {
    const ac = cc && String(a.cargo || '').toLowerCase() === cc ? 1 : 0;
    const bc = cc && String(b.cargo || '').toLowerCase() === cc ? 1 : 0;
    if (ac !== bc) return bc - ac;
    return (b.empresa_id ? 1 : 0) - (a.empresa_id ? 1 : 0);
  });
  for (const b of briefs) {
    const { data: kit } = await sb.from('kits').select('id, desafio, disc').eq('brief_id', b.id).eq('disc', d1).eq('status', 'published').maybeSingle();
    if (kit?.desafio?.desafio_texto) return { kitId: kit.id };
  }
  return null;
}

const { data: trilhas } = await sb.from('trilhas')
  .select('id, colaborador_id, temporada_plano, colaboradores!inner(nome_completo, cargo, perfil_dominante, empresa_id)')
  .eq('empresa_id', EMP).eq('status', 'ativa');

const linhas = [];
for (const t of trilhas || []) {
  const c = t.colaboradores;
  const sem2 = (t.temporada_plano || []).find((s) => Number(s.semana) === 2);
  const p1 = sem2?.conteudos_dia?.[0];
  if (!p1) { linhas.push({ nome: c.nome_completo, erro: 'SEM P1 na semana 2' }); continue; }
  const competencia = p1.competencia, descritor = p1.descritor;
  const fd = p1.conteudo?.formatos_disponiveis || {};
  const coreId = p1.conteudo?.core_id;

  // 1) BASE — o núcleo (texto/case) existe? PDF é LAZY (gera no clique) → basta o id.
  const baseIds = [...new Set(Object.values(fd).map((x) => x?.id).filter(Boolean))];
  const { data: mcs } = await sb.from('micro_conteudos').select('id, formato, url, storage_path, conteudo_inline, modulo_base_id').in('id', baseIds);
  const byId = Object.fromEntries((mcs || []).map((m) => [m.id, m]));
  const coreOk = coreId && byId[coreId]; // o formato_core do plano existe como micro_conteudo?
  // áudio é FORMATO OPCIONAL: só conta como "oferecido" se a pílula lista audio E ele tem narração.
  const audioMc = fd.audio?.id ? byId[fd.audio.id] : null;
  const ofereceAudio = !!(audioMc && (audioMc.conteudo_inline || '').length > 20);

  // 2) KIT (DISC) — desafio + formatos do kit (a personalização que É o piloto)
  const kit = await kitPublicado({ empresaId: EMP, competencia, descritor, disc: c.perfil_dominante, cargo: c.cargo });

  // 3) VÍDEO — deck 'done' da célula (módulo × empresa × cargo × disc_dominante) + perso do colab
  const disc1 = String(c.perfil_dominante || '').trim().charAt(0).toUpperCase();
  let moduloId = coreId ? byId[coreId]?.modulo_base_id : null;
  let deckOk = false, persoStatus = '-', videoReason = '';
  if (!moduloId) { videoReason = 'sem-modulo(core)'; }
  else {
    const { data: cel } = await sb.from('videos_gerados')
      .select('id, status').eq('modulo_base_id', moduloId).eq('empresa_id', EMP)
      .eq('cargo', c.cargo).eq('disc_dominante', disc1).neq('status', 'error')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    deckOk = cel?.status === 'done';
    if (!cel) videoReason = 'sem-deck';
    else if (!deckOk) videoReason = `deck=${cel.status}`;
    else {
      const { data: perso } = await sb.from('videos_personalizados')
        .select('status').eq('cell_video_id', cel.id).eq('colaborador_id', t.colaborador_id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      persoStatus = perso?.status || 'ausente';
    }
  }

  // "pronto" DURO = núcleo existe + kit publicado + deck de vídeo done.
  // áudio (formato opcional) e perso de vídeo (saudação, gera no render) = observações.
  const faltas = [];
  if (!coreOk) faltas.push('CORE');
  if (!kit) faltas.push('KIT(desafio+disc)');
  if (!deckOk) faltas.push(`video[${videoReason}]`);

  linhas.push({ nome: c.nome_completo, cargo: c.cargo, disc: c.perfil_dominante, descritor,
    core: !!coreOk, audio: ofereceAudio, kit: !!kit, deck: deckOk, perso: persoStatus, faltas });
}

// Relatório
const okTotal = linhas.filter((l) => l.faltas && l.faltas.length === 0).length;
console.log(`\n=== P1 SEMANA 2 · IBIPEBA · ${linhas.length} colaboradores ===`);
console.log(`PRONTOS (núcleo + kit + deck vídeo): ${okTotal}/${linhas.length}\n`);

const cont = { CORE: 0, 'KIT(desafio+disc)': 0, video: 0 };
for (const l of linhas) for (const f of (l.faltas || [])) { const k = f.startsWith('video') ? 'video' : f; cont[k] = (cont[k] || 0) + 1; }
console.log('BLOQUEADORES por camada:');
for (const [k, v] of Object.entries(cont)) console.log(`  ${k}: ${v}`);

// Observações não-bloqueadoras
const semAudio = linhas.filter((l) => !l.audio).length;
const persoAusente = linhas.filter((l) => l.deck && l.perso !== 'done').length;
console.log(`\nOBSERVAÇÕES (não bloqueiam a entrega):`);
console.log(`  sem formato áudio na P1: ${semAudio} (cai no formato preferido/texto)`);
console.log(`  deck ok mas saudação nominal do vídeo não 'done': ${persoAusente} (gera no render/lazy)`);

console.log('\nCOLABORADORES COM BLOQUEADOR:');
const comFalha = linhas.filter((x) => x.erro || (x.faltas && x.faltas.length));
if (!comFalha.length) console.log('  (nenhum — todos com núcleo + kit + deck)');
for (const l of comFalha) {
  console.log(`  ✗ ${l.nome} [${l.disc}] ${l.cargo || ''} · ${l.descritor || l.erro} → ${(l.faltas || [l.erro]).join(', ')}`);
}
