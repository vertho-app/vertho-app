/* eslint-disable */
// Dispara as CÉLULAS DE VÍDEO que faltam numa semana, derivadas do overlay real.
//
// Âncora = `modulo_base_id` do core_id PÓS-OVERLAY. Isso não é uma escolha: é
// literalmente o que `resolverVideoDaSemana({coreId})` usa para achar a célula
// (gerar-video.ts:209-213). Ancorar no `modulo_base_id` do BRIEF — o que `gerarKit`
// faz — produz vídeo numa célula que a entrega nunca consulta quando o brief é
// antigo (armadilha 6 do docs/KIT-SEMANAL.md; foi o caso dos 4 vídeos órfãos de 25/06).
//
// Dedup por (modulo × cargo × disc): N pessoas na mesma célula = 1 vídeo. O
// personalizado ("Olá, {nome}") é derivado depois, por pessoa, pelo pipeline.
//
// Uso:  npx tsx scripts/_gerar-videos-faltantes-semana.ts [semana]            → DRY-RUN
//       npx tsx scripts/_gerar-videos-faltantes-semana.ts [semana] --executar → dispara
process.loadEnvFile('.env.local');
if (!process.env.HCLOUD_TOKEN && process.env['Hetzner Cloud api token']) process.env.HCLOUD_TOKEN = process.env['Hetzner Cloud api token'];
import { createSupabaseAdmin } from '@/lib/supabase';
import { dispararVideoDoKit } from '@/actions/gerar-video';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SEMANA = Number(process.argv[2]) || 3;
const EXECUTAR = process.argv.includes('--executar');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: emp } = await sb.from('empresas').select('slug, is_demo').eq('id', EMP).single();
  if (!emp || emp.is_demo) throw new Error('ABORT: empresa inválida ou is_demo');

  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, colaboradores!inner(id, nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('empresa_id', EMP).eq('status', 'ativo');
  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, competencia_foco, numero_temporada').eq('empresa_id', EMP);
  const trilhaPor = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const p = trilhaPor.get(t.colaborador_id);
    if (!p || Number(t.numero_temporada) > Number(p.numero_temporada)) trilhaPor.set(t.colaborador_id, t);
  }

  // Células faltantes, deduplicadas por (modulo × cargo × disc).
  const celulas = new Map<string, { moduloId: string; cargo: string; disc: string; kitId: string | null; pessoas: string[]; descritor: string }>();
  for (const e of (envios as any[] || [])) {
    const c = e.colaboradores;
    const disc1 = String(c.perfil_dominante || '').charAt(0).toUpperCase();
    if (!['D', 'I', 'S', 'C'].includes(disc1) || !c.cargo) continue;
    const t = trilhaPor.get(e.colaborador_id);
    const plan = (t?.temporada_plano || []).find((s: any) => Number(s.semana) === SEMANA);
    if (!plan || plan.tipo !== 'conteudo') continue;

    const semana = JSON.parse(JSON.stringify(plan));
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, semana, {
      empresaId: EMP, disc: c.perfil_dominante, cargo: c.cargo,
      formatoPref: formatoPreferido(c), competenciaFoco: t?.competencia_foco || null, kitsCache,
    });
    const itens = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length
      ? semana.conteudos_dia : [{ conteudo: semana.conteudo, descritor: semana.descritor }];

    for (const it of itens) {
      const cont = it?.conteudo || {};
      if (!cont.core_id) continue;
      const { data: mc } = await sb.from('micro_conteudos')
        .select('modulo_base_id, kit_id').eq('id', cont.core_id).eq('empresa_id', EMP).maybeSingle();
      const moduloId = (mc as any)?.modulo_base_id;
      if (!moduloId) continue;

      const { data: cel } = await sb.from('videos_gerados').select('id')
        .eq('modulo_base_id', moduloId).eq('empresa_id', EMP).eq('cargo', c.cargo)
        .eq('disc_dominante', disc1).neq('status', 'error').limit(1).maybeSingle();
      if (cel) continue; // já existe (done ou em andamento)

      const key = `${moduloId}|${c.cargo}|${disc1}`;
      if (!celulas.has(key)) {
        celulas.set(key, { moduloId, cargo: c.cargo, disc: disc1, kitId: (mc as any)?.kit_id || cont.kit_id || null, pessoas: [], descritor: it.descritor });
      }
      celulas.get(key)!.pessoas.push(c.nome_completo);
    }
  }

  console.log(`=== CÉLULAS DE VÍDEO FALTANTES · semana ${SEMANA} · ibipeba ===`);
  console.log(`células: ${celulas.size} · entregas cobertas: ${[...celulas.values()].reduce((s, c) => s + c.pessoas.length, 0)}\n`);
  for (const c of celulas.values()) {
    console.log(`  ${c.cargo} · ${c.disc} · ${c.descritor} → ${c.pessoas.length} pessoa(s) · kit ${c.kitId ? 'sim' : 'NÃO'}`);
  }
  if (!EXECUTAR) { console.log('\n>>> DRY-RUN — use --executar <<<'); return; }

  const pppBrief = await resolverContextoEmpresa(sb, EMP).catch(() => null);
  console.log('\n>>> DISPARANDO <<<\n');
  let ok = 0, falhou = 0;
  for (const c of celulas.values()) {
    let desafioTexto: string | undefined;
    if (c.kitId) {
      const { data: kit } = await sb.from('kits').select('desafio').eq('id', c.kitId).maybeSingle();
      desafioTexto = (kit as any)?.desafio?.desafio_texto;
    }
    const r: any = await dispararVideoDoKit(sb, {
      moduloBaseId: c.moduloId, empresaId: EMP, cargo: c.cargo, disc: c.disc as any,
      desafioTexto, kitId: c.kitId || undefined, pppBrief, createdBy: `kit:sem${SEMANA}-faltante`,
    }).catch((e: any) => ({ error: e?.message }));
    if (r.error) { falhou++; console.log(`  ❌ ${c.cargo}·${c.disc}·${c.descritor}: ${r.error}`); }
    else { ok++; console.log(`  ✅ ${c.cargo}·${c.disc}·${c.descritor} → ${r.id} (${r.reused ? 'reusado' : r.status || 'processing'})`); }
  }
  console.log(`\nRESUMO: ${ok} disparado(s) · ${falhou} falha(s)`);
  console.log('Acompanhar: npx tsx scripts/_diag-video-semana.ts ' + SEMANA);
}
main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
