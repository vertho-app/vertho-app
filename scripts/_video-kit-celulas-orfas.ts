/* eslint-disable */
// Dispara o VÍDEO das células de kit que ficariam SEM vídeo depois do overlay.
//
// Contexto: aplicar um kit troca o `core_id` da semana, e `resolverVideoDaSemana`
// resolve a célula pelo MÓDULO do core pós-overlay. Se o kit levar a um módulo que
// não tem deck, a pessoa PERDE o vídeo que via antes. Medido por
// `_predict-video-overlay 3` (27/07): 2 células nessa situação.
//
// ⚠️ Armadilha 6 (docs/KIT-SEMANAL.md): ancorar no `modulo_base_id` do micro-conteúdo
// TEXTO do kit — que é o que a entrega resolve — e NÃO no do brief. Num brief antigo
// os dois divergem e o vídeo nasce numa célula que o painel nunca consulta (órfão).
//
// Uso:  npx tsx scripts/_video-kit-celulas-orfas.ts            → DRY-RUN
//       npx tsx scripts/_video-kit-celulas-orfas.ts --executar → dispara
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { dispararVideoDoKit } from '@/actions/gerar-video';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const EXECUTAR = process.argv.includes('--executar');

// As células apontadas por _predict-video-overlay 3 como "🔴 PERDE vídeo".
const ALVOS = [
  { competencia: 'Planejamento e Organização', descritor: 'Gestão de riscos', cargo: 'Gestão Escolar', disc: 'S' as const },
  { competencia: 'Colaboração docente e cultura formativa', descritor: 'Aprendizagem entre pares', cargo: 'Coordenação Pedagógica', disc: 'D' as const },
];

async function main() {
  const sb = createSupabaseAdmin();
  const pppBrief = await resolverContextoEmpresa(sb, EMP).catch(() => null);

  for (const a of ALVOS) {
    const { data: briefs } = await sb.from('kit_briefs')
      .select('id, cargo, empresa_id').eq('competencia', a.competencia).eq('descritor', a.descritor)
      .or(`empresa_id.eq.${EMP},empresa_id.is.null`);
    const brief = (briefs as any[] || []).find((b) => (b.cargo || 'todos') === a.cargo && b.empresa_id === EMP)
      || (briefs as any[] || [])[0];
    if (!brief) { console.log(`  ⚠️ ${a.descritor}·${a.disc}: sem brief`); continue; }

    const { data: kit } = await sb.from('kits')
      .select('id, desafio, status').eq('brief_id', brief.id).eq('disc', a.disc).maybeSingle();
    if (!kit || kit.status !== 'published') { console.log(`  ⚠️ ${a.descritor}·${a.disc}: kit ${kit?.status || 'inexistente'}`); continue; }

    // Âncora = módulo do TEXTO do kit (o que a entrega resolve), não o do brief.
    const { data: texto } = await sb.from('micro_conteudos')
      .select('id, modulo_base_id').eq('kit_id', kit.id).eq('formato', 'texto').maybeSingle();
    if (!texto?.modulo_base_id) { console.log(`  ⚠️ ${a.descritor}·${a.disc}: texto do kit sem modulo_base_id`); continue; }

    const { data: deck } = await sb.from('videos_gerados')
      .select('id, status').eq('modulo_base_id', texto.modulo_base_id).eq('empresa_id', EMP)
      .eq('cargo', a.cargo).eq('disc_dominante', a.disc).eq('status', 'done').limit(1).maybeSingle();
    if (deck) { console.log(`  ✅ ${a.descritor}·${a.disc}: já tem deck (${deck.id}) — nada a fazer`); continue; }

    console.log(`  ${EXECUTAR ? '▶' : '·'} ${a.descritor}·${a.disc} · módulo ${texto.modulo_base_id} · kit ${kit.id}`);
    if (!EXECUTAR) continue;

    const r: any = await dispararVideoDoKit(sb, {
      moduloBaseId: texto.modulo_base_id, empresaId: EMP, cargo: a.cargo, disc: a.disc,
      desafioTexto: kit.desafio?.desafio_texto, kitId: kit.id, pppBrief,
      createdBy: 'kit:celula-orfa-sem3',
    }).catch((e: any) => ({ error: e?.message }));
    console.log(r.error ? `     ❌ ${r.error}` : `     ✅ video ${r.id} status=${r.status ?? 'processing'} reused=${!!r.reused}`);
  }
  if (!EXECUTAR) console.log('\n>>> DRY-RUN — use --executar <<<');
}
main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); });
