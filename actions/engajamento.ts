'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction, requireAdminAction } from '@/lib/auth/action-context';
import { formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { PROGRESSO } from '@/lib/status';
import {
  buildEngagementEvolutionDashboard,
  type EngagementEvolutionDashboard,
} from '@/lib/engagement-evolution';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';

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
// 'bloqueio' (20/08/2026): a pessoa CHEGOU na semana mas ela estava trancada —
// tentativa frustrada, não consumo. Antes caía no default 'abertura' e inflava a
// métrica justamente de quem não conseguiu ver nada. Os consumidores filtram por
// `tipo === 'abertura'`, então o valor novo não entra em nenhuma contagem
// existente: ele só deixa de mentir na que já havia.
const TIPOS = ['abertura', 'formato', 'audio_fim', 'bloqueio'];

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

    // O supabase-js RETORNA `{ error }`: sem esta checagem o evento sumia e a
    // action devolvia `ok: true`. O estrago não é perder um insert — é a
    // /admin/engajamento SUBNOTIFICAR e ninguém saber, porque "evento não
    // gravado" e "pessoa não abriu" produzem exatamente o mesmo gráfico.
    const { error } = await sb.from('trilha_eventos').insert({
      empresa_id: t.empresa_id, colaborador_id: t.colaborador_id, trilha_id: trilhaId,
      semana, pilula, formato, tipo,
    });
    if (error) {
      console.error('[engajamento] evento não gravado:', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Régua ÚNICA — `lib/season-engine/consumo-conteudo`. Era uma cópia local, e
 * havia outras cinco pelo app com critérios que discordavam entre si (a da tela
 * da semana tratava array vazio como CONSUMIDO). Cópia de régua não diverge no
 * dia em que nasce; diverge na primeira correção que só um dos lados recebe.
 */
const consumiuFlag = consumiuConteudo;

const fmtsDistintos = (evs: any[], pilula: number | null) =>
  [...new Set(
    evs.filter((x) => x.formato && (x.tipo === 'formato' || x.tipo === 'abertura')
      && (pilula == null || x.pilula === pilula)).map((x) => x.formato),
  )];

/**
 * Roll-up de engajamento por colaborador. `semana` filtra os eventos de abertura/
 * formato/consumo; se null, agrega todas. Retorna { resumo, colaboradores, semanas }.
 *
 * COM filtro de semana, cada sinal é estrito àquela semana:
 * - Vídeo: só eventos com a semana exata. Legados (semana=NULL, pré-15/07) contam
 *   apenas em "Todas as semanas" — antes vazavam pra qualquer filtro e a semana 2
 *   mostrava os plays da semana 1.
 * - Recebeu: os carimbos ultima_pilulaN_em PERSISTEM entre semanas (só o ÚLTIMO
 *   envio fica registrado). O carimbo pertence à semana FILTRADA apenas quando ela
 *   é a semana ATUAL do colaborador E o carimbo é posterior ao último avanço de
 *   semana (ultima_evidencia_em — o avanço é atômico com ele, cron-jobs:436).
 *   Semana passada → null ("sem registro por semana"), nunca um ✓/✗ inventado.
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
    .select('colaborador_id, semana_atual, status, data_inicio, ultima_evidencia_em, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo, pref_video_curto, pref_video_longo, pref_audio, pref_texto, pref_estudo_caso)');
  if (!envios?.length) return { resumo: { inscritos: 0 }, colaboradores: [], semanas: [1] };

  // 2) Eventos (opcionalmente escopados por semana).
  let evQuery = tdb.from('trilha_eventos')
    .select('colaborador_id, pilula, semana, formato, tipo, criado_em');
  if (semFiltro) evQuery = evQuery.eq('semana', semFiltro);
  const { data: eventos } = await evQuery;

  // 3) Playback de vídeo — com filtro, SÓ a semana exata. Legados (semana NULL,
  //    pré-15/07) entram apenas na visão "Todas as semanas": o `.or(is.null)`
  //    anterior fazia a semana 2 exibir os plays da semana 1.
  let vidQuery = tdb.from('videos_watched')
    .select('colaborador_id, event_type, seconds_watched, video_length')
    .in('event_type', ['play_started', 'play_progress', 'play_finished']);
  if (semFiltro) vidQuery = vidQuery.eq('semana', semFiltro);
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
  // Evidência = semana concluída (reflexão socrática em semana de CONTEÚDO, relato
  // da missão em semana de APLICAÇÃO — sem o `aplicacao` aqui as semanas 4/8/12
  // marcavam 0 mesmo com missões concluídas, apagão de Ibipeba em ago/2026).
  const evidenciaPorColab: Record<string, boolean> = {};
  for (const p of (progresso || [])) {
    if (consumiuFlag(p.conteudo_consumido)) consumoPorColab[p.colaborador_id] = true;
    if ((p.tipo === 'conteudo' || p.tipo === 'aplicacao') && p.status === PROGRESSO.CONCLUIDO) evidenciaPorColab[p.colaborador_id] = true;
  }
  const tutorPorColab: Record<string, boolean> = {};
  for (const t of (tutorRows || [])) tutorPorColab[t.colaborador_id] = true;

  // Atribui o carimbo de pílula à semana filtrada. true/false só quando dá pra
  // AFIRMAR (semana atual do colab, carimbo depois do último avanço); semana
  // passada devolve null — o carimbo é só do último envio, não há registro.
  const recebeuNaSemana = (carimbo: string | null, e: any): boolean | null => {
    if (!semFiltro) return !!carimbo;
    if (semFiltro !== (Number(e.semana_atual) || 1)) return null;
    if (!carimbo) return false;
    const inicioSemana = e.ultima_evidencia_em || e.data_inicio;
    return inicioSemana ? String(carimbo) > String(inicioSemana) : true;
  };

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
      recebeuP1: recebeuNaSemana(e.ultima_pilula1_em, e),
      recebeuP2: recebeuNaSemana(e.ultima_pilula2_em, e),
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
    const recebeu = colaboradores.filter((c) => (n === 1 ? c.recebeuP1 : c.recebeuP2) === true).length;
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

/**
 * Leitura longitudinal usada exclusivamente pela página B. Faz um único lote
 * de consultas sem filtro de semana e monta as séries em memória, evitando
 * repetir 5 queries para cada semana da jornada.
 *
 * O índice é operacional e transparente:
 * ativou (20) + consumiu (30) + enviou evidência (40) + usou tutor (10).
 * Não representa qualidade, competência ou nota pedagógica.
 */
export async function getEvolucaoEngajamentoEmpresa(
  empresaId: string,
  area?: string | null,
): Promise<
  | { ok: true; data: EngagementEvolutionDashboard }
  | { ok: false; error: string }
> {
  await requireAdminAction();
  if (!empresaId) return { ok: false, error: 'Selecione uma empresa' };

  const tdb = tenantDb(empresaId);
  const [
    { data: envios, error: enviosError },
    { data: eventos, error: eventosError },
    { data: videos, error: videosError },
    { data: progresso, error: progressoError },
    { data: tutorRows, error: tutorError },
  ] = await Promise.all([
    tdb.from('fase4_envios')
      .select('colaborador_id, semana_atual, colaboradores!inner(nome_completo, cargo, area_depto)'),
    tdb.from('trilha_eventos')
      .select('colaborador_id, semana, tipo'),
    tdb.from('videos_watched')
      .select('colaborador_id, semana, event_type')
      .in('event_type', ['play_started', 'play_progress', 'play_finished']),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, tipo, status, conteudo_consumido'),
    tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana')
      .not('tira_duvidas', 'is', null),
  ]);

  const queryError = enviosError || eventosError || videosError || progressoError || tutorError;
  if (queryError) return { ok: false, error: queryError.message };

  const dashboard = buildEngagementEvolutionDashboard({
    enrollments: (envios || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      nome: row.colaboradores?.nome_completo || '—',
      cargo: row.colaboradores?.cargo || '',
      area: row.colaboradores?.area_depto || 'Sem área',
      semanaAtual: Number(row.semana_atual) || 1,
    })),
    events: (eventos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
    })),
    videos: (videos || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      eventType: row.event_type,
    })),
    progress: (progresso || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
      tipo: row.tipo,
      status: row.status,
      conteudoConsumido: row.conteudo_consumido,
    })),
    tutorUses: (tutorRows || []).map((row: any) => ({
      colaboradorId: row.colaborador_id,
      semana: row.semana,
    })),
    completedStatus: PROGRESSO.CONCLUIDO,
    area,
  });

  return { ok: true, data: dashboard };
}

/**
 * A pessoa JÁ ABRIU o conteúdo desta semana — em qualquer sessão, qualquer dia?
 *
 * 🔴 POR QUE ISTO EXISTE (medido 25/08/2026). A tela guardava essa resposta num
 * `useState(false)` que só era setado por um clique da sessão ATUAL. Quem abria
 * o conteúdo na segunda e voltava na terça encontrava o botão "Marcar como
 * realizado" desabilitado, com a mensagem "abra o conteúdo antes de concluir" —
 * tendo aberto. E como "Iniciar Evidências" exigia a marcação, a semana inteira
 * ficava trancada por um estado de React que não sobrevive a um F5.
 *
 * O tamanho disso: das 61 pessoas travadas em Ibipeba e Macaé, **24 tinham
 * evento de abertura registrado na semana em que estavam paradas**. Não era
 * desinteresse — era um botão cinza que deveria estar verde.
 *
 * A fonte é `trilha_eventos`, que já registrava tudo o que era preciso desde
 * sempre. Nenhuma coluna nova: o dado existia e ninguém o lia de volta.
 *
 * ⚠️ `tipo: 'bloqueio'` NÃO conta como abertura. Quem cai na semana trancada
 * pelo link da cadência gera evento toda semana, e tratá-lo como abertura
 * destravaria o botão de quem nunca viu o conteúdo — o mesmo motivo pelo qual a
 * telemetria separa os dois tipos.
 */
export async function jaAbriuConteudoDaSemana(semana: number) {
  try {
    const ctx = await requireUserAction();
    const colaboradorId = ctx.colaborador?.id;
    if (!colaboradorId || !ctx.empresaId || !Number.isFinite(Number(semana))) return { abriu: false };

    // 🔑 NADA VINDO DO CLIENTE DECIDE ESCOPO. A 1ª versão recebia `trilhaId` do
    // cliente, lia `trilhas` com service-role para descobrir o dono e comparava
    // — o padrão do `registrarEventoTrilha` ao lado. Aqui isso é
    // desnecessário: quem pergunta "já abri o conteúdo?" só pode perguntar por
    // si mesmo, e o colaborador e o tenant vêm da SESSÃO. Sem parâmetro de
    // escopo não há o que forjar, e `tenantDb` põe o `empresa_id` no WHERE.
    const tdb = tenantDb(ctx.empresaId);
    const { data, error } = await tdb.from('trilha_eventos')
      .select('id')
      .eq('colaborador_id', colaboradorId)
      .eq('semana', Number(semana))
      .in('tipo', ['abertura', 'formato'])
      .limit(1);

    // O supabase-js RETORNA `{ error }`. Falha de leitura NÃO pode virar "não
    // abriu": isso reintroduziria exatamente o botão travado que esta função
    // existe para destravar. Devolve o erro e a tela mantém o comportamento da
    // sessão — o clique de agora ainda libera.
    if (error) {
      console.error('[engajamento] jaAbriuConteudoDaSemana:', error.message);
      return { abriu: false, erro: error.message };
    }
    return { abriu: (data?.length || 0) > 0 };
  } catch {
    return { abriu: false };
  }
}
