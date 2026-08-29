/* eslint-disable */
// READ-ONLY: prevê se, ao aplicar um kit (que troca o core_id), o vídeo ainda
// resolve. Para cada gap de kit da semana N, compara o MÓDULO que o vídeo usa
// HOJE (core do build) com o MÓDULO que o kit resolveria, e checa deck nos dois.
// Não escreve nada; resolverModuloBaseParaConteudo é puro (+ embedding read).
// Rodar: npx tsx scripts/_predict-video-overlay.ts 2
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2] || 2);
const sb = createSupabaseAdmin();

function norm(s: string) { return String(s||'').replace(/^[A-Z0-9][A-Z0-9_.-]*\s*[—-]\s*/i,'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim(); }

async function main() {

async function temKit(competencia: string, descritor: string, disc: string, cargo: string) {
  const d1 = String(disc||'').charAt(0).toUpperCase();
  const { data: bs } = await sb.from('kit_briefs').select('id, empresa_id, cargo, descritor').eq('competencia', competencia).or(`empresa_id.eq.${EMP},empresa_id.is.null`);
  const briefs = (bs||[]).filter((b:any)=>norm(b.descritor)===norm(descritor));
  for (const b of briefs) { const { data: k } = await sb.from('kits').select('desafio').eq('brief_id',b.id).eq('disc',d1).eq('status','published').maybeSingle(); if ((k as any)?.desafio?.desafio_texto) return true; }
  return false;
}
async function deckExiste(moduloId: string|null, cargo: string, disc1: string) {
  if (!moduloId) return false;
  const { data } = await sb.from('videos_gerados').select('status').eq('modulo_base_id',moduloId).eq('empresa_id',EMP).eq('cargo',cargo).eq('disc_dominante',disc1).eq('status','done').limit(1).maybeSingle();
  return !!data;
}

const { data: trilhas } = await sb.from('trilhas').select('temporada_plano, colaboradores!inner(nome_completo, cargo, perfil_dominante)').eq('empresa_id',EMP).eq('status','ativa');

const vistos = new Set<string>();
const linhas: any[] = [];
for (const t of (trilhas as any[])||[]) {
  const c = t.colaboradores;
  const disc1 = String(c.perfil_dominante||'').charAt(0).toUpperCase();
  const sem = (t.temporada_plano||[]).find((s:any)=>Number(s.semana)===SEMANA);
  for (const d of (sem?.conteudos_dia||[]).slice(0,2)) {
    if (!d?.competencia || !d?.descritor) continue;
    if (await temKit(d.competencia, d.descritor, disc1, c.cargo)) continue; // só gaps
    const key = `${d.descritor}::${c.cargo}::${disc1}`;
    if (vistos.has(key)) continue; vistos.add(key);
    // módulo do vídeo HOJE = core_id do build → modulo_base_id
    const coreId = d.conteudo?.core_id;
    let moduloHoje: string|null = null;
    if (coreId) { const { data: mc } = await sb.from('micro_conteudos').select('modulo_base_id').eq('id',coreId).maybeSingle(); moduloHoje = (mc as any)?.modulo_base_id||null; }
    // módulo que o KIT resolveria (mesmo resolvedor do brief), no nível do colab
    const nivelMin = Number(d.nivel_atual) || 1.5;
    let moduloKit: string|null = null;
    try { const esc = await resolverModuloBaseParaConteudo(sb, { competenciaNome: d.competencia, descritor: d.descritor, nivelMin, cargo: c.cargo, empresaId: EMP, locale: 'pt-BR' }); moduloKit = esc?.modulo?.id||null; } catch (e:any) { moduloKit = null; }
    const deckHoje = await deckExiste(moduloHoje, c.cargo, disc1);
    const deckKit = await deckExiste(moduloKit, c.cargo, disc1);
    linhas.push({ descritor: d.descritor, cargo: c.cargo, disc: disc1, quem: c.nome_completo.split(' ')[0],
      mesmoModulo: moduloHoje && moduloKit && moduloHoje===moduloKit, deckHoje, deckKit });
  }
}

console.log(`\n=== PREVISÃO DE VÍDEO PÓS-OVERLAY · semana ${SEMANA} · ${linhas.length} (descritor×cargo×disc) ===\n`);
let sobrevive=0, perde=0, jaSemVideo=0;
for (const l of linhas) {
  const veredito = !l.deckHoje ? '· já sem vídeo hoje'
    : (l.mesmoModulo || l.deckKit) ? '✅ vídeo SOBREVIVE' : '🔴 PERDE vídeo (kit→módulo sem deck)';
  if (!l.deckHoje) jaSemVideo++; else if (l.mesmoModulo||l.deckKit) sobrevive++; else perde++;
  console.log(`  ${veredito.padEnd(34)} ${l.descritor} · ${l.disc} · ${l.quem}  [hoje:${l.deckHoje?'deck':'—'} kit:${l.deckKit?'deck':'—'} ${l.mesmoModulo?'=módulo':'≠módulo'}]`);
}
console.log(`\nRESUMO: ✅ sobrevive ${sobrevive} · 🔴 perde ${perde} · já sem vídeo ${jaSemVideo}`);
}
main().catch((e)=>{console.error('FALHOU:', e?.message||e); process.exit(1);});
