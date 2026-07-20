'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction, requireAdminAction } from '@/lib/auth/action-context';
import { formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';

/**
 * Telemetria de engajamento da trilha. Duas frentes:
 *  - registrarEventoTrilha: loga eventos do colaborador na tela da semana —
 *    'abertura' (deep-link da pílula), 'formato' (abriu um formato: vídeo/áudio/
 *    texto/caso) e 'audio_fim' (terminou o áudio). Atribuição por pílula/formato.
 *  - getEngajamentoEmpresa: junta esses eventos + playback de vídeo (videos_watched)
 *    + consumo explícito, evidência (semana concluída) e uso do Tira-Dúvidas
 *    (temporada_semana_progresso) num roll-up por colaborador, pra tela
 *    /admin/engajamento. Filtrável por semana; abertura/formato quebrados
 *    por pílula (P1/P2).
 */

const FORMATOS = ['video', 'audio', 'texto', 'case'];
const TIPOS = ['abertura', 'formato', 'audio_fim'];

/**
 * Loga um evento do colaborador na tela da semana. Best-effort: NUNCA lança pro
 * client. empresa/colaborador vêm da TRILHA (não do client) → o evento nunca é
 * atribuído a outro tenant. `pilula` (1|2) vem do ?p= ou do índice do descritor.
 *
 * SÓ O DONO registra a própria telemetria: este export é `'use server'`, ou seja,
 * um endpoint HTTP, e o `trilhaId` é escolhido pelo CLIENTE. Sem comparar a trilha
 * com o colaborador da sessão, qualquer autenticado (de qualquer tenant) poderia
 * injetar eventos na trilha alheia — atribuídos corretamente ao dono dela, o que
 * torna o lixo indistinguível do dado real na /admin/engajamento.
 */
export async function registrarEventoTrilha(input: {
  trilhaId: string; semana: number; pilula?: number | null; formato?: string | null; tipo?: string;
}) {
  try {
    const ctx = await requireUserAction();
    const trilhaId = input?.trilhaId;
    const semana = Number(input?.semana);
    if (!trilhaId || !Number.isFinite(semana)) return { ok: false };

    const sb = createSupabaseAdmin();
    const { data: t } = await sb.from('trilhas')
      .select('empresa_id, colaborador_id').eq('id', trilhaId).maybeSingle();
    if (!t?.empresa_id) return { ok: false };
    if (!ctx.colaborador?.id || t.colaborador_id !== ctx.colaborador.id) return { ok: false };

    const pilula = input.pilula === 1 || input.pilula === 2 ? input.pilula : null;
    const formato = FORMATOS.includes(String(input.formato)) ? input.formato : null;
    const tipo = TIPOS.includes(String(input.tipo)) ? input.tipo : 'abertura';

    await sb.from('trilha_eventos').insert({
      empresa_id: t.empresa_id, colaborador_id: t.colaborador_id, trilha_id: trilhaId,
      semana, pilula, formato, tipo,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** conteudo_consumido é boolean (marcarConteudoConsumido) OU array (video-tracking). */
function consumiuFlag(v: any): boolean {
  if (v === true) return true;
  if (Array.isArray(v)) return v.some((x: any) => x?.concluido);
  return false;
}

const fmtsDistintos = (evs: any[], pilula: number | null) =>
  [...new Set(
    evs.filter((x) => x.formato && (x.tipo === 'formato' || x.tipo === 'abertura')
      && (pilula == null || x.pilula === pilula)).map((x) => x.formato),
  )];

/**
 * Roll-up de engajamento por colaborador. `semana` filtra os eventos de abertura/
 * formato/consumo; se null, agrega todas. Retorna { resumo, colaboradores, semanas }.
 * Stats de VÍDEO (play/%/terminou) filtram por semana quando há filtro; eventos de
 * vídeo legados (sem semana=NULL) contam em qualquer filtro.
 */
export async function getEngajamentoEmpresa(empresaId: string, semana?: number | null) {
  await requireAdminAction();
  if (!empresaId) return { resumo: null, colaboradores: [], semanas: [] };
  // tenantDb embute o empresa_id no WHERE — o escopo deixa de depender de
  // lembrar do .eq() em cada uma das 4 queries.
  const tdb = tenantDb(empresaId);
  const semFiltro = Number.isFinite(Number(semana)) && Number(semana) > 0 ? Number(semana) : null;

  // 1) População = inscritos na cadência. Traz as prefs p/ derivar o formato PRINCIPAL
  //    de cada colab (o denominador das métricas por formato).
  const { data: envios } = await tdb.from('fase4_envios')
    .select('colaborador_id, semana_atual, status, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo, pref_video_curto, pref_video_longo, pref_audio, pref_texto, pref_estudo_caso)');
  if (!envios?.length) return { resumo: { inscritos: 0 }, colaboradores: [], semanas: [1] };

  // 2) Eventos (opcionalmente escopados por semana).
  let evQuery = tdb.from('trilha_eventos')
    .select('colaborador_id, pilula, semana, formato, tipo, criado_em');
  if (semFiltro) evQuery = evQuery.eq('semana', semFiltro);
  const { data: eventos } = await evQuery;

  // 3) Playback de vídeo — escopado por semana quando há filtro; eventos legados
  //    sem semana (NULL) contam em qualquer filtro.
  let vidQuery = tdb.from('videos_watched')
    .select('colaborador_id, event_type, seconds_watched, video_length')
    .in('event_type', ['play_started', 'play_progress', 'play_finished']);
  if (semFiltro) vidQuery = vidQuery.or(`semana.eq.${semFiltro},semana.is.null`);
  const { data: videos } = await vidQuery;

  // 4) Consumo explícito + evidência (status) — opcionalmente por semana.
  let progQuery = tdb.from('temporada_semana_progresso')
    .select('colaborador_id, semana, tipo, status, conteudo_consumido');
  if (semFiltro) progQuery = progQuery.eq('semana', semFiltro);
  const { data: progresso } = await progQuery;

  // 5) Tira-Dúvidas (tutor): só ids das linhas COM conversa — o JSONB do
  //    transcript pesa e aqui só interessa o "usou/não usou".
  let tutorQuery = tdb.from('temporada_semana_progresso')
    .select('colaborador_id, semana')
    .not('tira_duvidas', 'is', null);
  if (semFiltro) tutorQuery = tutorQuery.eq('semana', semFiltro);
  const { data: tutorRows } = await tutorQuery;

  const evPorColab: Record<string, any[]> = {};
  for (const a of (eventos || [])) (evPorColab[a.colaborador_id] ||= []).push(a);
  const vidPorColab: Record<string, any[]> = {};
  for (const v of (videos || [])) (vidPorColab[v.colaborador_id] ||= []).push(v);
  const consumoPorColab: Record<string, boolean> = {};
  // Evidência = semana de CONTEÚDO concluída (enviar a reflexão socrática é o que
  // conclui a semana — mesmo critério da tela /admin/vertho/evidencias).
  const evidenciaPorColab: Record<string, boolean> = {};
  for (const p of (progresso || [])) {
    if (consumiuFlag(p.conteudo_consumido)) consumoPorColab[p.colaborador_id] = true;
    if (p.tipo === 'conteudo' && p.status === 'concluido') evidenciaPorColab[p.colaborador_id] = true;
  }
  const tutorPorColab: Record<string, boolean> = {};
  for (const t of (tutorRows || [])) tutorPorColab[t.colaborador_id] = true;

  const colaboradores = (envios || []).map((e: any) => {
    const evs = evPorColab[e.colaborador_id] || [];
    const vids = vidPorColab[e.colaborador_id] || [];

    // ● = engajou com a pílula: abertura COM ?p= OU qualquer evento (formato/áudio)
    // atribuído a ela. Antes exigia só 'abertura', mas a abertura raramente carrega
    // a pílula (o ?p= falta em navegação direta / links pré-15/07), então o ● ficava
    // apagado mesmo quando a pessoa clicou um formato daquela pílula (que É atribuído).
    const abriuP1 = evs.some((x) => x.pilula === 1);
    const abriuP2 = evs.some((x) => x.pilula === 2);
    const abriuDireto = evs.some((x) => x.tipo === 'abertura' && !x.pilula);
    const formatosP1 = fmtsDistintos(evs, 1);
    const formatosP2 = fmtsDistintos(evs, 2);
    const audioTerminou = evs.some((x) => x.tipo === 'audio_fim');

    const deuPlay = vids.length > 0;
    const terminouVideo = vids.some((v) => v.event_type === 'play_finished');
    const maxSeg = Math.max(0, ...vids.map((v) => Number(v.seconds_watched) || 0));
    const maxLen = Math.max(0, ...vids.map((v) => Number(v.video_length) || 0));
    const pctVideo = terminouVideo ? 100 : (maxLen > 0 ? Math.min(100, Math.round((maxSeg / maxLen) * 100)) : 0);

    // FIX paradoxo: formatosAbertos DERIVA vídeo/áudio do playback real (quem terminou
    // o vídeo obviamente abriu o formato vídeo, mesmo sem evento 'formato').
    const setFmt = new Set(fmtsDistintos(evs, null));
    if (deuPlay) setFmt.add('video');
    if (audioTerminou) setFmt.add('audio');
    const formatosAbertos = [...setFmt];

    const marcouConcluido = !!consumoPorColab[e.colaborador_id];
    const consumiu = terminouVideo || audioTerminou || marcouConcluido;
    // Formato PRINCIPAL = o preferido do colab (o overlay do kit usa como core).
    const formatoPrincipal = formatoPreferido(e.colaboradores);
    // "engajou com o principal": se vídeo, terminou; senão, abriu aquele formato.
    const engajouPrincipal = formatoPrincipal === 'video'
      ? terminouVideo
      : formatosAbertos.includes(formatoPrincipal);

    return {
      colaboradorId: e.colaborador_id,
      nome: e.colaboradores?.nome_completo || '—',
      cargo: e.colaboradores?.cargo || '',
      semanaAtual: e.semana_atual || 1,
      status: e.status,
      recebeuP1: !!e.ultima_pilula1_em,
      recebeuP2: !!e.ultima_pilula2_em,
      abriuP1, abriuP2, abriuDireto,
      // Tile "Abriram o link" = ESTRITAMENTE o evento de abertura (novo, ?p= a
      // partir de 15/07). O ● por pílula (abriuP1/P2) é mais largo de propósito.
      abriuLink: evs.some((x) => x.tipo === 'abertura'),
      formatosP1, formatosP2, formatosAbertos,
      deuPlay, terminouVideo, audioTerminou, pctVideo,
      marcouConcluido, consumiu,
      formatoPrincipal, engajouPrincipal,
      enviouEvidencia: !!evidenciaPorColab[e.colaborador_id],
      conversouTutor: !!tutorPorColab[e.colaborador_id],
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  // ── Quebra por PÍLULA (2 linhas) ────────────────────────────────────────────
  const linhaPilula = (n: 1 | 2) => {
    const recebeu = colaboradores.filter((c) => (n === 1 ? c.recebeuP1 : c.recebeuP2)).length;
    const abriu = colaboradores.filter((c) => (n === 1 ? c.abriuP1 : c.abriuP2)).length;
    const abriuFormato = colaboradores.filter((c) => (n === 1 ? c.formatosP1 : c.formatosP2).length > 0).length;
    return { pilula: n, recebeu, abriu, abriuFormato };
  };
  const porPilula = [linhaPilula(1), linhaPilula(2)];

  // ── Métricas por FORMATO PRINCIPAL (denominador = quem tem aquele formato como
  //    preferido, não o total). Vídeo: numerador = terminou o vídeo; demais: abriu
  //    aquele formato. `pctMedio` do vídeo é a média SÓ entre os vídeo-principal. ──
  const FORMATOS_PRINC = ['video', 'audio', 'texto', 'case'] as const;
  const porFormato = FORMATOS_PRINC.map((f) => {
    const doFormato = colaboradores.filter((c) => c.formatoPrincipal === f);
    if (!doFormato.length) return null;
    const engajou = doFormato.filter((c) => c.engajouPrincipal).length;
    const pctMedio = f === 'video'
      ? Math.round(doFormato.reduce((s, c) => s + c.pctVideo, 0) / doFormato.length)
      : null;
    return { formato: f, principal: doFormato.length, engajou, pctMedio };
  }).filter(Boolean);

  const resumo = {
    inscritos: colaboradores.length,
    semanaFiltro: semFiltro,
    abriramLink: colaboradores.filter((c) => c.abriuLink).length,
    abriramAlgumFormato: colaboradores.filter((c) => c.formatosAbertos.length > 0).length,
    terminaramVideo: colaboradores.filter((c) => c.terminouVideo).length,
    consumiram: colaboradores.filter((c) => c.consumiu).length,
    // % médio de vídeo agora entre os VÍDEO-principal (denominador correto).
    pctMedioVideo: (() => {
      const vids = colaboradores.filter((c) => c.formatoPrincipal === 'video');
      return vids.length ? Math.round(vids.reduce((s, c) => s + c.pctVideo, 0) / vids.length) : 0;
    })(),
    enviaramEvidencia: colaboradores.filter((c) => c.enviouEvidencia).length,
    conversaramTutor: colaboradores.filter((c) => c.conversouTutor).length,
    porPilula,
    porFormato,
  };

  const maxSemana = Math.max(1, ...(envios || []).map((e: any) => Number(e.semana_atual) || 1));
  const semanas = Array.from({ length: maxSemana }, (_, i) => i + 1);

  return { resumo, colaboradores, semanas };
}
