/**
 * NUCLEO do roll-up de engajamento da trilha (headless, SEM gate).
 *
 * Extraido de `actions/engajamento.ts::getEngajamentoEmpresa` (02/09/2026) para
 * atender a uma segunda superficie: a tela de engajamento do TIME, na visao do
 * gestor. O gestor ve os mesmos sinais que o admin, recortados aos liderados.
 *
 * Por que nucleo, e nao uma segunda consulta na tela do gestor: as reguas daqui
 * ja custaram caro para ficarem certas (o que conta como consumo, a atribuicao
 * do carimbo de pilula a semana, o vazamento dos plays legados sem semana). Uma
 * copia nao diverge no dia em que nasce; diverge na primeira correcao que so um
 * dos lados recebe — e ai o admin e o gestor discordam sobre a mesma pessoa.
 *
 * `colaboradorIds` recorta a populacao. Ausente = tenant inteiro (uso do admin);
 * lista vazia = ninguem (fail-closed, nunca "empresa toda").
 *
 * QUEM AUTORIZA E O CHAMADOR: este arquivo nao aplica gate. A action de admin
 * exige `requireAdminAction`; a do gestor resolve o proprio escopo e passa a
 * lista de liderados.
 */
import { tenantDb } from '@/lib/tenant-db';
import { formatoPreferido } from '@/lib/season-engine/kit/entrega-semana';
import { PROGRESSO } from '@/lib/status';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import { derivarPosicaoJornada } from '@/lib/engajamento/posicao-jornada';

/**
 * Regua UNICA de consumo — `lib/season-engine/consumo-conteudo`. Era uma copia
 * local, e havia outras cinco pelo app com criterios que discordavam entre si.
 */
const consumiuFlag = consumiuConteudo;

/**
 * O supabase-js RETORNA `{ data, error }`. Numa tela de engajamento isso é
 * especialmente traiçoeiro: erro de banco e "ninguem engajou" produzem
 * exatamente o mesmo painel — tudo zerado — e o gestor conclui que o time
 * sumiu quando na verdade a consulta falhou. Aqui todo erro e registrado, e o
 * da POPULACAO sobe ao chamador (ver `erro` no resumo).
 */
function checar(nome: string, res: { data: any; error: any }): any[] | null {
  if (res.error) {
    console.error(`[engajamento] ${nome}:`, res.error.message);
    return null;
  }
  return res.data;
}

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
export async function rollUpEngajamento(
  empresaId: string,
  semana?: number | null,
  colaboradorIds?: string[] | null,
) {
  if (!empresaId) return { resumo: null, colaboradores: [], semanas: [] };
  // tenantDb embute o empresa_id no WHERE — o escopo deixa de depender de
  // lembrar do .eq() em cada uma das 4 queries.
  const tdb = tenantDb(empresaId);
  const semFiltro = Number.isFinite(Number(semana)) && Number(semana) > 0 ? Number(semana) : null;

  // 1) População = inscritos na cadência. Traz as prefs p/ derivar o formato PRINCIPAL
  //    de cada colab (o denominador das métricas por formato).
  const recorte = Array.isArray(colaboradorIds) ? colaboradorIds : null;
  // Recorte fail-closed: lista VAZIA nao vira 'empresa toda'. Um gestor sem
  // liderados tem que ver zero, nunca o tenant inteiro.
  if (recorte && recorte.length === 0) return { resumo: { inscritos: 0 }, colaboradores: [], semanas: [1] };

  let enviosQuery = tdb.from('fase4_envios')
    .select('colaborador_id, semana_atual, status, data_inicio, ultima_evidencia_em, ultima_pilula1_em, ultima_pilula2_em, colaboradores!inner(nome_completo, cargo, pref_video_curto, pref_video_longo, pref_audio, pref_texto, pref_estudo_caso)');
  if (recorte) enviosQuery = enviosQuery.in('colaborador_id', recorte);
  const enviosRes = await enviosQuery;
  if (enviosRes.error) {
    console.error('[engajamento] populacao:', enviosRes.error.message);
    // `erro` distingue falha de vazio: sem ele a tela diria "ninguem na
    // cadencia" para uma consulta que nem chegou a responder.
    return { resumo: { inscritos: 0, erro: enviosRes.error.message }, colaboradores: [], semanas: [1] };
  }
  const envios = enviosRes.data;
  if (!envios?.length) return { resumo: { inscritos: 0 }, colaboradores: [], semanas: [1] };

  // `semana_atual` é o RELÓGIO da cadência, não a posição individual. Para
  // dizer onde cada pessoa realmente está, carregamos a trilha mais recente e
  // depois aplicamos a MESMA régua sequencial usada pelos links da cadência.
  const colaboradorIdsDaPopulacao = [...new Set((envios as any[])
    .map((e) => e.colaborador_id)
    .filter(Boolean))];
  const trilhaPorColab = new Map<string, any>();
  let trilhasConfiaveis = colaboradorIdsDaPopulacao.length > 0;
  if (colaboradorIdsDaPopulacao.length) {
    const trilhasRes = await tdb.from('trilhas')
      .select('id, colaborador_id, numero_temporada, temporada_plano, data_inicio')
      .in('colaborador_id', colaboradorIdsDaPopulacao)
      .order('numero_temporada', { ascending: false });
    if (trilhasRes.error) {
      trilhasConfiaveis = false;
      console.error('[engajamento] posição individual — trilhas:', trilhasRes.error.message);
    } else {
      for (const trilha of (trilhasRes.data || []) as any[]) {
        if (!trilhaPorColab.has(trilha.colaborador_id)) trilhaPorColab.set(trilha.colaborador_id, trilha);
      }
    }
  }

  // 2) Eventos (opcionalmente escopados por semana).
  let evQuery = tdb.from('trilha_eventos')
    .select('colaborador_id, pilula, semana, formato, tipo, criado_em');
  if (semFiltro) evQuery = evQuery.eq('semana', semFiltro);
  if (recorte) evQuery = evQuery.in('colaborador_id', recorte);
  const eventos = checar('eventos da trilha', await evQuery) || [];

  // 3) Playback de vídeo — com filtro, SÓ a semana exata. Legados (semana NULL,
  //    pré-15/07) entram apenas na visão "Todas as semanas": o `.or(is.null)`
  //    anterior fazia a semana 2 exibir os plays da semana 1.
  let vidQuery = tdb.from('videos_watched')
    .select('colaborador_id, event_type, seconds_watched, video_length')
    .in('event_type', ['play_started', 'play_progress', 'play_finished']);
  if (semFiltro) vidQuery = vidQuery.eq('semana', semFiltro);
  if (recorte) vidQuery = vidQuery.in('colaborador_id', recorte);
  const videos = checar('playback de video', await vidQuery) || [];

  // 4) Consumo explícito + evidência (status). A posição individual precisa do
  // histórico completo; o filtro de métricas é aplicado em memória depois.
  let progQuery = tdb.from('temporada_semana_progresso')
    .select('trilha_id, colaborador_id, semana, tipo, status, conteudo_consumido');
  if (recorte) progQuery = progQuery.in('colaborador_id', recorte);
  const progressoRes = await progQuery;
  const progressoConfiavel = !progressoRes.error;
  const progressoCompleto = checar('progresso semanal', progressoRes) || [];
  const progresso = semFiltro
    ? progressoCompleto.filter((p) => Number(p.semana) === semFiltro)
    : progressoCompleto;

  // 5) Tira-Dúvidas (tutor): só ids das linhas COM conversa — o JSONB do
  //    transcript pesa e aqui só interessa o "usou/não usou".
  let tutorQuery = tdb.from('temporada_semana_progresso')
    .select('colaborador_id, semana')
    .not('tira_duvidas', 'is', null);
  if (semFiltro) tutorQuery = tutorQuery.eq('semana', semFiltro);
  if (recorte) tutorQuery = tutorQuery.in('colaborador_id', recorte);
  const tutorRows = checar('uso do tira-duvidas', await tutorQuery) || [];

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

  // Só o progresso da trilha MAIS RECENTE define a posição. Misturar temporadas
  // faria uma conclusão antiga liberar uma semana da jornada atual.
  const progressoJornadaPorColab = new Map<string, any[]>();
  for (const p of progressoCompleto) {
    const trilhaAtual = trilhaPorColab.get(p.colaborador_id);
    if (!trilhaAtual || p.trilha_id !== trilhaAtual.id) continue;
    const lista = progressoJornadaPorColab.get(p.colaborador_id) || [];
    lista.push(p);
    progressoJornadaPorColab.set(p.colaborador_id, lista);
  }

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
    const semanaCalendario = Number(e.semana_atual) || 1;
    const trilhaAtual = trilhaPorColab.get(e.colaborador_id);
    const posicao = derivarPosicaoJornada({
      semanaCalendario,
      dataInicio: trilhaAtual?.data_inicio || e.data_inicio,
      plano: trilhaAtual?.temporada_plano || [],
      progresso: progressoJornadaPorColab.get(e.colaborador_id) || [],
      confiavel: trilhasConfiaveis && progressoConfiavel && !!trilhaAtual,
    });

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
      // Compatibilidade: consumidores antigos ainda leem `semanaAtual` como
      // calendário. As telas novas usam os nomes sem ambiguidade abaixo.
      semanaAtual: semanaCalendario,
      semanaCalendario,
      semanaAcessivel: posicao.semanaAcessivel,
      jornadaAtrasada: posicao.atrasada,
      semanaAcessivelConcluida: posicao.semanaConcluida,
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
