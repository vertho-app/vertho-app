/* eslint-disable */
// READ-ONLY: "os kits da semana N estão feitos?" respondido pelo CONSUMIDOR REAL.
//
// Roda o MESMO overlay que `loadTemporada` (actions/temporadas.ts:484-493) executa
// ao abrir a semana: precarregarKits(empresa, DISC, cargo) + overlayKitNaSemana
// sobre uma CÓPIA do plano. O que sobra em `formatos_disponiveis` / `desafio_texto`
// é literalmente o que a pessoa recebe.
//
// ⚠️ NÃO usar resolverKitDaSemana aqui: é o caminho SEM cache (fallback), e ele
// diverge do caminho real em duas dimensões — casa descritor de forma tolerante
// (normDescritor) mas exige `url` para texto/case. Medir por ele dá falso-negativo
// de formato e falso-positivo de cobertura.
//
// Uso:  npx tsx scripts/_diag-kits-semana.ts [semana]     (default 3)
process.loadEnvFile('.env.local');
import { createSupabaseAdmin } from '@/lib/supabase';
import { precarregarKits, overlayKitNaSemana, formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

const EMP = '0d99fed1-1710-40e3-b32e-7a95c7d023fe'; // ibipeba
const SEMANA = Number(process.argv[2]) || 3;

async function main() {
  const sb = createSupabaseAdmin();

  const { data: envios } = await sb.from('fase4_envios')
    .select('colaborador_id, colaboradores!inner(nome_completo, perfil_dominante, cargo, pref_video_curto, pref_video_longo, pref_texto, pref_audio, pref_estudo_caso)')
    .eq('empresa_id', EMP).eq('status', 'ativo');
  if (!envios?.length) throw new Error('nenhum envio ativo');

  const { data: trilhas } = await sb.from('trilhas')
    .select('colaborador_id, temporada_plano, competencia_foco, numero_temporada')
    .eq('empresa_id', EMP);
  const trilhaPor = new Map<string, any>();
  for (const t of (trilhas as any[] || [])) {
    const prev = trilhaPor.get(t.colaborador_id);
    if (!prev || Number(t.numero_temporada) > Number(prev.numero_temporada)) trilhaPor.set(t.colaborador_id, t);
  }

  const linhas: any[] = [];
  for (const e of (envios as any[])) {
    const c = e.colaboradores;
    const t = trilhaPor.get(e.colaborador_id);
    const plano = (t?.temporada_plano || []) as any[];
    const plan = plano.find((s: any) => Number(s.semana) === SEMANA) || plano[SEMANA - 1] || null;
    // Semana de 'aplicacao'/'avaliacao' não tem conteúdo — o overlay já as ignora
    // (overlayKitNaSemana só age em tipo === 'conteudo'). Sem este filtro elas
    // apareciam como 36 entregas "sem kit" com descritor null (falso alarme).
    if (!plan || plan.tipo !== 'conteudo') continue;

    const antes = JSON.parse(JSON.stringify(plan));  // core_id do BUILD (pré-overlay)
    const semana = JSON.parse(JSON.stringify(plan)); // cópia: overlay MUTA
    const disc = c.perfil_dominante || null;
    const formatoPref = formatoPreferido(c);
    const kitsCache = await precarregarKits(sb, { empresaId: EMP, disc, cargo: c.cargo }).catch(() => undefined);
    await overlayKitNaSemana(sb, semana, {
      empresaId: EMP, disc, cargo: c.cargo, formatoPref,
      competenciaFoco: t?.competencia_foco || null, kitsCache,
    });

    const itens = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length
      ? semana.conteudos_dia.map((x: any) => ({ ...x, conteudo: x.conteudo }))
      : [{ competencia: t?.competencia_foco, descritor: semana.descritor, conteudo: semana.conteudo }];

    for (let i = 0; i < itens.length; i++) {
      const it = itens[i];
      const cont = it.conteudo || {};
      const fmts = Object.keys(cont.formatos_disponiveis || {}).filter((f) => f !== 'video').sort();

      // VÍDEO pós-overlay: `resolverVideoDaSemana` resolve a célula pelo módulo do
      // core_id — que o overlay acabou de TROCAR para o texto do kit. Replica aqui a
      // parte que decide (gerar-video.ts:209-213 + busca do deck), já que a action é
      // gatada por sessão. É a medida que importa: aplicar kit pode orfanar o vídeo.
      const deckDoCore = async (coreId: string | null | undefined) => {
        if (!coreId) return false;
        const { data: mc } = await sb.from('micro_conteudos')
          .select('modulo_base_id').eq('id', coreId).eq('empresa_id', EMP).maybeSingle();
        if (!(mc as any)?.modulo_base_id) return false;
        const { data: deck } = await sb.from('videos_gerados').select('id')
          .eq('modulo_base_id', (mc as any).modulo_base_id).eq('empresa_id', EMP)
          .eq('cargo', c.cargo).eq('disc_dominante', String(disc || '').charAt(0).toUpperCase())
          .eq('status', 'done').limit(1).maybeSingle();
        return !!deck;
      };
      const temVideo = await deckDoCore(cont.core_id);
      // Baseline: o mesmo cálculo com o core_id do BUILD. Aplicar kit troca o core e
      // pode orfanar o vídeo (armadilha 6) — comparar os dois é o único jeito de ver.
      const itensAntes = Array.isArray(antes.conteudos_dia) && antes.conteudos_dia.length
        ? antes.conteudos_dia : [{ conteudo: antes.conteudo }];
      const temVideoAntes = await deckDoCore(itensAntes[i]?.conteudo?.core_id);
      linhas.push({
        nome: c.nome_completo,
        disc: String(disc || '').charAt(0).toUpperCase(),
        cargo: c.cargo, pilula: i + 1,
        competencia: it.competencia || t?.competencia_foco, descritor: it.descritor,
        temKit: !!cont.kit_id,
        formatos: fmts.join('+'),
        desafioPlaceholder: /^Aplique /i.test(String(cont.desafio_texto || '')),
        temVideo, temVideoAntes,
      });
    }
  }

  const comKit = linhas.filter((l) => l.temKit);
  const semKit = linhas.filter((l) => !l.temKit);
  console.log(`=== SEMANA ${SEMANA} · ibipeba · ${envios.length} colaboradores ativos ===`);
  console.log(`entregas (pessoa × pílula): ${linhas.length}  |  COM kit: ${comKit.length}  |  SEM kit: ${semKit.length}\n`);

  if (semKit.length) {
    console.log('── SEM KIT (conteúdo genérico + desafio placeholder) ──');
    const agrup = new Map<string, string[]>();
    for (const l of semKit) {
      const k = `${l.disc} | ${l.cargo} › ${l.competencia} › ${l.descritor}`;
      (agrup.get(k) || agrup.set(k, []).get(k))!.push(`${l.nome} (p${l.pilula})`);
    }
    for (const [k, v] of [...agrup].sort()) console.log(`  ❌ ${k}\n       ${v.join(', ')}`);
    console.log('');
  }

  const fmts = new Map<string, number>();
  for (const l of comKit) fmts.set(l.formatos, (fmts.get(l.formatos) || 0) + 1);
  console.log('── formatos do kit entregues (vídeo à parte, pela célula) ──');
  for (const [f, n] of [...fmts].sort((a, b) => b[1] - a[1])) console.log(`  ${f || '(nenhum)'}: ${n}`);

  const ph = linhas.filter((l) => l.desafioPlaceholder);
  console.log(`\ndesafio ainda PLACEHOLDER ("Aplique …"): ${ph.length}/${linhas.length}`);
  const comVideo = linhas.filter((l) => l.temVideo).length;
  const antesVideo = linhas.filter((l) => l.temVideoAntes).length;
  const perdeu = linhas.filter((l) => l.temVideoAntes && !l.temVideo);
  const ganhou = linhas.filter((l) => !l.temVideoAntes && l.temVideo);
  console.log(`vídeo: build ${antesVideo}/${linhas.length} → pós-overlay ${comVideo}/${linhas.length}` +
    ` (ganhou ${ganhou.length}, perdeu ${perdeu.length})`);
  for (const l of perdeu) console.log(`  🔴 PERDEU vídeo: ${l.nome} · p${l.pilula} · ${l.descritor}`);
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
