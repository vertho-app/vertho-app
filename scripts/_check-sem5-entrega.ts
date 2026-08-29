/* eslint-disable */
// READ-ONLY: prontidão da ENTREGA de uma semana de Ibipeba, medida pelo CONSUMIDOR.
// Replica o call-site de `aplicarOverlayKit` (actions/temporadas.ts) e o resolvedor
// de vídeo da week page (`resolverCelulaVideo` com colaboradorId, gerar=false), em
// vez de reimplementar o match — o script não decide nada, só observa.
//
// Camadas medidas por pílula (P1/P2):
//   core        → core_id pós-overlay resolve p/ micro_conteudo ATIVO
//   audio       → micro_conteudo de áudio existe E tem `url` (MP3 renderizado;
//                 url null = player em 0:00, armadilha de 22/07)
//   texto/case  → existem nos formatos_disponiveis pós-overlay
//   video       → célula (módulo do core PÓS-OVERLAY × cargo × DISC) com status done
//   perso       → videos_personalizados done p/ (célula, colaborador) = com saudação
//   podcast pré → final/audio-personalizado/{audioId}/{colabId}.mp3 no bucket conteudos
//   anunciado   → formato que o WhatsApp promete (derivarPrioridadeFormatos[0]) existe?
//
// Rodar: npx tsx scripts/_check-sem5-entrega.ts [semana]
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { normalizeTemporadaPlano } from '@/lib/season-engine/normalize-temporada-plano';
import { overlayKitNaSemana, formatoPreferido, precarregarKits } from '@/lib/season-engine/kit/entrega-semana';
import { getProgramaConfigDaTrilha } from '@/lib/season-engine/programa-config';
import { derivarPrioridadeFormatos } from '@/lib/season-engine/formato-preferido';
import { resolverCelulaVideo } from '@/actions/gerar-video';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe';
const SEMANA = Number(process.argv[2] || 5);

const sani = (v: string) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_');

async function main() {
  const sb = createSupabaseAdmin();
  const { data: trilhas, error } = await sb.from('trilhas')
    .select('id, data_inicio, programa_modo, competencia_foco, competencias_foco, temporada_plano, colaborador_id, colaboradores!inner(id, nome_completo, cargo, perfil_dominante, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('empresa_id', EMP).eq('status', 'ativa');
  if (error) throw new Error(`trilhas: ${error.message}`);

  const linhas: any[] = [];
  const cacheListagem = new Map<string, Set<string>>(); // audioId -> set de arquivos

  for (const t of (trilhas as any[]) || []) {
    const colab = t.colaboradores;
    const disc = String(colab.perfil_dominante || '').charAt(0).toUpperCase() || null;
    const plano = normalizeTemporadaPlano(t.temporada_plano);
    const sem = plano.find((s: any) => Number(s.semana) === SEMANA);
    if (!sem) { linhas.push({ nome: colab.nome_completo, erro: 'semana ausente no plano' }); continue; }
    if (sem.tipo && sem.tipo !== 'conteudo') { linhas.push({ nome: colab.nome_completo, tipo: sem.tipo, pular: true }); continue; }

    const formatoPref = formatoPreferido(colab);
    const competenciaFoco = t.competencia_foco || (Array.isArray(t.competencias_foco) ? t.competencias_foco[0] : null);
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc, cargo: colab.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, sem, {
      empresaId: EMP, disc, cargo: colab.cargo, formatoPref, competenciaFoco, kitsCache,
      desafioUnicoPorCompetencia: getProgramaConfigDaTrilha(t).desafioUnicoPorCompetencia,
      colaboradorId: colab.id,
    } as any);

    const entregas = Array.isArray(sem.conteudos_dia) && sem.conteudos_dia.length
      ? sem.conteudos_dia
      : [{ competencia: competenciaFoco, descritor: sem.descritor, conteudo: sem.conteudo }];

    const row: any = { nome: colab.nome_completo, cargo: colab.cargo, disc, pref: formatoPref, anunciado: derivarPrioridadeFormatos(colab)[0], p: [] };

    for (const e of entregas) {
      const c = e?.conteudo || {};
      const fd = c.formatos_disponiveis || {};
      const falta: string[] = [];

      // core ativo
      const coreId = c.core_id || null;
      let coreModulo: string | null = null;
      if (!coreId) falta.push('core[sem-id]');
      else {
        const { data: mc } = await sb.from('micro_conteudos').select('id, ativo, modulo_base_id, formato').eq('id', coreId).maybeSingle();
        if (!mc) falta.push('core[inexistente]');
        else {
          if (!mc.ativo) falta.push('core[inativo]');
          coreModulo = mc.modulo_base_id || null;
        }
      }

      // formatos de leitura/escuta
      const audioId = fd.audio?.id || null;
      let audioSemMp3 = false;
      if (!audioId) falta.push('audio[ausente]');
      else {
        const { data: a } = await sb.from('micro_conteudos').select('id, url, ativo').eq('id', audioId).maybeSingle();
        if (!a) falta.push('audio[inexistente]');
        else audioSemMp3 = !a.url;
        // `ativo` NÃO entra na conta: quem serve o áudio do kit é o overlay (que não
        // filtra ativo) e a rota /podcast (que também não). Contar `ativo=false` como
        // falta acusava 72 inocentes — a régua é o consumidor, não a coluna.
      }
      if (!fd.texto?.id) falta.push('texto[ausente]');
      if (!fd.case?.id) falta.push('case[ausente]');
      if (!c.desafio_texto) falta.push('desafio[ausente]');

      // vídeo pelo módulo do core PÓS-OVERLAY (a régua da week page)
      let videoStatus = 'sem-modulo';
      let perso = false;
      if (coreModulo && disc) {
        const r: any = await resolverCelulaVideo(coreModulo, EMP, colab.cargo, disc as any, null, { sb, gerar: false, colaboradorId: colab.id });
        videoStatus = r?.status || 'nao_gerado';
        perso = !!r?.isPersonalizado;
        if (videoStatus !== 'done') falta.push(`video[${videoStatus}]`);
        else if (!perso) falta.push('video[sem-saudacao]');
      } else falta.push('video[sem-modulo]');

      // podcast pré-aquecido (cache por colaborador no storage)
      let podcastPre = false;
      if (audioId) {
        const dir = `final/audio-personalizado/${sani(audioId)}`;
        if (!cacheListagem.has(dir)) {
          const { data: objs } = await sb.storage.from('conteudos').list(dir, { limit: 200 });
          cacheListagem.set(dir, new Set((objs || []).map((o: any) => o.name)));
        }
        podcastPre = cacheListagem.get(dir)!.has(`${sani(colab.id)}.mp3`);
        // ORDEM DA ROTA (/api/conteudo/[id]/podcast): cache por colaborador PRIMEIRO,
        // TTS on-demand depois, `content.url` (MP3-base) só no fim. Logo:
        //   cache quente        → entrega instantânea COM saudação, `url` irrelevante
        //   cache frio + url    → toca (base, sem nome) enquanto o cache não existe
        //   cache frio + sem url→ 1º play espera ~150 s de TTS; se o TTS falhar, 404
        // Só o último caso é falta de verdade.
        if (!podcastPre && audioSemMp3) falta.push('audio[frio-e-sem-mp3]');
        else if (!podcastPre) falta.push('podcast[nao-preaquecido]');
      }

      row.p.push({ descritor: e?.descritor, formato_core: c.formato_core, videoStatus, perso, podcastPre, falta });
    }
    linhas.push(row);
  }

  const reais = linhas.filter((l) => l.p && l.p.length);
  console.log(`\n=== ENTREGA · SEMANA ${SEMANA} · IBIPEBA · ${reais.length} colaboradores com semana de conteúdo ===`);
  const camadas = ['core', 'audio[ausente]', 'audio[frio-e-sem-mp3]', 'texto', 'case', 'desafio', 'video[', 'video[sem-saudacao]', 'podcast['];
  const conta = (idx: number, prefixo: string) => reais.filter((l) => l.p[idx]?.falta.some((f: string) => f.startsWith(prefixo))).length;
  console.log(`\ncamada                  |  P1  |  P2   (nº de pessoas com falta)`);
  for (const cam of camadas) {
    console.log(`  ${cam.padEnd(21)} |  ${String(conta(0, cam)).padStart(2)}  |  ${String(conta(1, cam)).padStart(2)}`);
  }
  const zero = (idx: number) => reais.filter((l) => l.p[idx] && l.p[idx].falta.length === 0).length;
  console.log(`\n100% pronta (todas as camadas): P1 ${zero(0)}/${reais.length} · P2 ${zero(1)}/${reais.length}`);

  // formato ANUNCIADO pelo WhatsApp existe?
  const anuncioQuebrado = reais.filter((l) => {
    const p1 = l.p[0];
    if (!p1) return false;
    if (l.anunciado === 'video') return p1.videoStatus !== 'done';
    return p1.falta.some((f: string) => f.startsWith(l.anunciado));
  });
  console.log(`Pílula anuncia formato que a semana NÃO tem: ${anuncioQuebrado.length}/${reais.length}`);

  const detalhe = reais.filter((l) => l.p.some((p: any) => p.falta.length));
  console.log(`\n— pessoas com alguma falta (${detalhe.length}) —`);
  for (const l of detalhe) {
    for (const [i, p] of l.p.entries()) {
      if (p.falta.length) console.log(`  ${l.nome} · ${l.cargo} · ${l.disc} · P${i + 1} · ${p.descritor} → ${p.falta.join(', ')}`);
    }
  }
  const pular = linhas.filter((l) => l.pular);
  if (pular.length) console.log(`\n(${pular.length} sem semana de conteúdo: ${[...new Set(pular.map((p) => p.tipo))].join(', ')})`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
