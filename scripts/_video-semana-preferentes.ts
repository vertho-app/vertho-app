/* eslint-disable */
/**
 * Vídeo da semana para quem DECLAROU vídeo como preferência.
 *
 * POR QUE SÓ DESSES
 * ─────────────────
 * `derivarPrioridadeFormatos` devolve `['video', …]` para quem não declarou nada
 * — e em Macaé isso é **30 de 38**. "35 preferem vídeo" é o default falando, não
 * as pessoas: só **5** têm nota em `pref_*` com vídeo no topo. Gerar para os 35
 * seria pagar render (~US$ 0,64 cada, ~40 min por célula) por uma preferência
 * que ninguém expressou.
 *
 * 🔑 O VÍDEO É POR CÉLULA, NÃO POR PESSOA: (módulo-base × empresa × cargo ×
 * 1ª letra do DISC). Os 5 caem em menos células que isso — quem compartilha
 * célula compartilha render. A saudação nominal é outra camada
 * (`videos_personalizados`), gerada por pessoa em cima do deck.
 *
 * ⚠️ A ÂNCORA É O MÓDULO DO CONTEÚDO PÓS-OVERLAY, não o do plano cru nem o do
 * brief do kit: é `core_id` que `resolverVideoDaSemana` usa para achar a célula.
 * Ancorar no brief já produziu 4 vídeos que nunca apareceram para o cargo certo.
 *
 * ⚠️ SEM RISCO DE PROMESSA FALSA se o render não terminar a tempo: o formato
 * anunciado é decidido no INSTANTE do envio, consultando o deck ao vivo
 * (`formatosEntregaveis`). Vídeo pronto → anuncia vídeo; não pronto → anuncia
 * texto. Por isso dá para disparar sem travar a cadência.
 *
 * Uso:
 *   npx tsx scripts/_video-semana-preferentes.ts --empresa=macae            → dry-run
 *   npx tsx scripts/_video-semana-preferentes.ts --empresa=macae --executar
 *   ... --data=2026-08-18
 */
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { coletarEntregasPrevistas } from '@/lib/pipeline-health/coleta';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { dispararVideoDoKit } from '@/actions/gerar-video';
import { resolverContextoEmpresa } from '@/lib/season-engine/kit/contexto-empresa';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const SLUG = arg('empresa');
const EXECUTAR = process.argv.includes('--executar');
const DATA = new Date((arg('data') || new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10)) + 'T12:00:00Z');

/** Declarou preferência DE VERDADE (não é o default de quem deixou tudo em branco). */
function declarouPreferencia(c: any): boolean {
  return [c.pref_video_curto, c.pref_video_longo, c.pref_texto, c.pref_audio, c.pref_estudo_caso]
    .some((v) => Number(v || 0) > 0);
}

async function main() {
  if (!SLUG) throw new Error('--empresa=<slug> é obrigatório');
  const sb = createSupabaseAdmin();

  const { data: emp } = await sb.from('empresas').select('id, nome').eq('slug', SLUG).maybeSingle();
  if (!emp) throw new Error(`empresa ${SLUG} não encontrada`);
  const empresaId = (emp as any).id as string;

  const { entregas, pilulaAlvo } = await coletarEntregasPrevistas(sb, empresaId, DATA);
  console.log(`${(emp as any).nome} · ${DATA.toISOString().slice(0, 10)} · pílula ${pilulaAlvo ?? '-'} · ${entregas.length} pessoa(s)\n`);

  // Célula → quem cai nela (dedup: render é por célula, não por pessoa).
  const celulas = new Map<string, {
    moduloBaseId: string; disc: string; cargo: string; kitId: string; desafio: string;
    pessoas: string[]; conteudoId: string;
  }>();

  for (const e of entregas) {
    const { data: colab, error: eC } = await sb.from('colaboradores')
      .select('id, nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso')
      .eq('id', e.colaboradorId).eq('empresa_id', empresaId).maybeSingle();
    if (eC) { console.log(`⚠️ ${e.nome}: ${eC.message}`); continue; }
    if (!colab) continue;
    if (!declarouPreferencia(colab)) continue;                       // default não conta
    if (derivarPrioridadeFormatos(colab)[0] !== 'video') continue;   // vídeo tem de ser o topo

    const { data: trilha, error: eT } = await sb.from('trilhas')
      .select('temporada_plano, competencia_foco, programa_modo, programa_config')
      .eq('colaborador_id', e.colaboradorId).eq('empresa_id', empresaId).eq('status', 'ativa')
      .order('criado_em', { ascending: false }).limit(1).maybeSingle();
    if (eT) { console.log(`⚠️ ${e.nome}: trilhas: ${eT.message}`); continue; }
    const plan = (((trilha as any)?.temporada_plano || []) as any[]).find((s: any) => Number(s.semana) === Number(e.semana));
    if (!plan) { console.log(`⚠️ ${e.nome}: semana ${e.semana} fora do plano`); continue; }

    const copia = JSON.parse(JSON.stringify(plan));
    await overlayKitNaSemana(sb, copia, {
      empresaId, disc: (colab as any).perfil_dominante, cargo: (colab as any).cargo,
      formatoPref: formatoPreferido(colab as any),
      competenciaFoco: (trilha as any).competencia_foco || null,
      kitsCache: await precarregarKits(sb, { empresaId, disc: (colab as any).perfil_dominante, cargo: (colab as any).cargo }),
      desafioUnicoPorSemana: getProgramaConfigDaTrilha(trilha as any).desafioUnicoPorSemana,
    });

    const itens = Array.isArray(copia.conteudos_dia) && copia.conteudos_dia.length
      ? copia.conteudos_dia : [{ conteudo: copia.conteudo }];
    const cont = itens[(e.pilula || 1) - 1]?.conteudo || {};
    const coreId = cont?.core_id;
    const kitId = cont?.kit_id;
    if (!coreId || !kitId) { console.log(`⚠️ ${e.nome}: conteúdo sem core/kit pós-overlay`); continue; }

    // A ÂNCORA: módulo-base do conteúdo que a pessoa recebe.
    const { data: mc } = await sb.from('micro_conteudos')
      .select('modulo_base_id').eq('id', coreId).eq('empresa_id', empresaId).maybeSingle();
    const moduloBaseId = (mc as any)?.modulo_base_id;
    if (!moduloBaseId) { console.log(`⚠️ ${e.nome}: core ${coreId} sem módulo-base`); continue; }

    const { data: kit } = await sb.from('kits').select('desafio, disc').eq('id', kitId).maybeSingle();
    const disc = String((colab as any).perfil_dominante || '').charAt(0).toUpperCase();
    const chave = `${moduloBaseId}|${(colab as any).cargo}|${disc}`;

    if (!celulas.has(chave)) {
      celulas.set(chave, {
        moduloBaseId, disc, cargo: (colab as any).cargo, kitId,
        desafio: (kit as any)?.desafio?.desafio_texto || '',
        pessoas: [], conteudoId: coreId,
      });
    }
    celulas.get(chave)!.pessoas.push((colab as any).nome_completo);
  }

  console.log(`declararam vídeo: ${[...celulas.values()].reduce((n, c) => n + c.pessoas.length, 0)} pessoa(s) · ${celulas.size} célula(s) de render\n`);
  for (const [chave, c] of celulas) {
    console.log(`── DISC ${c.disc} · ${c.cargo}`);
    console.log(`   módulo-base ${c.moduloBaseId} · kit ${c.kitId}`);
    console.log(`   ${c.pessoas.join(', ')}`);
  }

  if (!celulas.size) { console.log('nada a gerar.'); return; }
  if (!EXECUTAR) { console.log('\ndry-run — rode com --executar. (~40 min por célula, ~US$ 0,64 cada)'); return; }

  const pppBrief = await resolverContextoEmpresa(sb, empresaId).catch(() => null);
  for (const [chave, c] of celulas) {
    const r = await dispararVideoDoKit(sb, {
      moduloBaseId: c.moduloBaseId, empresaId, cargo: c.cargo, disc: c.disc as any,
      desafioTexto: c.desafio, kitId: c.kitId, pppBrief,
      createdBy: 'kit:preferencia-video',
    });
    console.log(`▶ DISC ${c.disc}: ${r.error ? `❌ ${r.error}` : `${r.reused ? '♻️ reusado' : '✅ disparado'} ${r.id} status=${r.status}`}`);
  }

  console.log('\nAcompanhe: select status, etapa, error from videos_gerados where empresa_id = ... order by created_at desc;');
}

main().catch((e) => { console.error(e); process.exit(1); });
