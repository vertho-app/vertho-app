import { createSupabaseAdmin } from '@/lib/supabase';
import { getDashboardView } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import { isMapeamentoCenariosLiberado, isPerfilComportamentalLiberado } from '@/lib/votacao/status';
import { PROGRESSO, TRILHA } from '@/lib/status';
import type { UserContext } from '@/types';
import { ehSemanaDeImplementacao, totalSemanasDoPlano } from '@/lib/season-engine/trilha-runtime';
import { estaAtrasada } from '@/lib/season-engine/atraso';
import { semanaLiberadaEm, semanaLiberadaPorData } from '@/lib/season-engine/week-gating';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import { colaboradoresComMapeamentoCompleto } from '@/lib/mapeamento-competencias';

/**
 * Loaders da home do dashboard — queries PURAS, sem 'use server' e sem auth
 * própria: recebem o contexto/colaborador já resolvido pela action chamadora.
 * É o que permite à home (`app/dashboard/home-actions.ts`) autenticar UMA vez
 * por pageview (antes eram 6 cadeias completas — uma por action/fetch).
 *
 * As actions originais (loadDashboardData, loadJornada, loadHomeKpis,
 * loadUltimosVideosColab, loadMeusPulsosPendentes, checkVotacaoStatus) viraram
 * wrappers finos — auth + delegar pra cá — mantendo assinatura e retorno.
 *
 * `shared` (opcional) traz dados pré-buscados pela home consolidada pra não
 * repetir queries sobrepostas (trilha latest, sys_config e count de respostas
 * eram refeitos 2-3× por pageview). `undefined` = não fornecido (o loader
 * consulta); `null` = já consultado e não existe.
 */
export interface HomeSharedData {
  trilha?: any;
  sysConfig?: any;
  respostasCount?: number;
}

/** Colunas que a jornada precisa no colaborador (superset do default do authz). */
export const JORNADA_COLAB_COLS =
  'id, nome_completo, email, cargo, area_depto, empresa_id, perfil_dominante, perfil_externo_dados, perfil_externo_pdf_path, created_at';

/**
 * ⚠️ FALLBACK, não a duração. Quem responde "quantas semanas" é o PLANO da
 * trilha — `totalSemanasDoPlano(plano, TOTAL_SEMANAS_FALLBACK)`.
 *
 * D1 (auditoria 22/08): este arquivo já documentava, duas linhas abaixo, que
 * `SEMANAS_IMPLEMENTACAO` era "fallback histórico" e delegava a
 * `ehSemanaDeImplementacao(plano, s)` — e deixava o TOTAL sem delegação
 * nenhuma. Os 5 presets valem 14 (regular), 10 (onboarding), 14 (regular_duo),
 * 3 (piloto) e 7 (jornada): quem está numa jornada lia "Semana 3 de 14" na
 * home, e o card "Próximo marco" anunciava pílulas de semanas que não existem
 * no plano dela.
 */
const TOTAL_SEMANAS_FALLBACK = 14;
// Fallback histórico: o formato de 14 semanas. Quem responde de verdade é o
// plano da trilha (ver `ehSemanaDeImplementacao`).
const SEMANAS_IMPLEMENTACAO = [4, 8, 12];
const MS_DIA = 24 * 60 * 60 * 1000;

// ── Dashboard (progresso + temporada + sys_config) ─────────────────────────

export async function carregarDashboardData(ctx: UserContext, shared?: HomeSharedData) {
  const sb = createSupabaseAdmin();
  const colab: any = ctx.colaborador;
  const view = getDashboardView(ctx);

  const progressoQueries = [
    colab.cargo
      ? sb.from('cargos_empresa')
          .select('top5_workshop')
          .eq('empresa_id', colab.empresa_id)
          .eq('nome', colab.cargo)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .not('nivel_ia4', 'is', null),
  ] as const;

  const [
    { data: cargoEmp, error: errComp },
    { count: respondidas, error: errResp },
    { count: avaliadas, error: errAval },
  ] = await Promise.all(progressoQueries);

  // A régua da Fase 2 é o Top 5 do CARGO. Contar todas as competências da
  // empresa fazia a Bruna aparecer incompleta mesmo com 5/5 respondidas.
  const totalComp = Array.isArray(cargoEmp?.top5_workshop) ? cargoEmp.top5_workshop.length : 0;

  // `count` vem `null` quando a query falha, e `null || 0` = 0. Sem esta
  // checagem a home mostrava "0 de 0" e "0% de progresso" para quem respondeu
  // tudo — falha de banco escrita na tela como se fosse o estado da pessoa, a
  // mesma classe do certificado que acusava "participação < 75%" (F15).
  const erroContagem = errComp || errResp || errAval;
  if (erroContagem) {
    console.error('[home] contagens de progresso falharam:', erroContagem.message);
    colab.progressoIndisponivel = true;
  }

  colab.totalComp = totalComp || 0;
  colab.respondidas = respondidas || 0;
  colab.avaliadas = avaliadas || 0;
  colab.progresso = totalComp ? Math.round((respondidas / totalComp) * 100) : 0;

  // A mesma leitura acima também decide se existe avaliação para iniciar.
  const cargoSemCompetencias = totalComp === 0;

  // Dados de equipe (gestor/rh)
  let teamData = null;
  if (view === 'rh' || view === 'gestor') {
    let colabQuery = sb.from('colaboradores')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', colab.empresa_id);

    // Gestor vê apenas sua área
    if (view === 'gestor' && colab.area_depto) {
      colabQuery = colabQuery.eq('area_depto', colab.area_depto);
    }

    const [{ count: totalColabs }, { count: totalRespostas }] = await Promise.all([
      colabQuery,
      sb.from('respostas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', colab.empresa_id)
        .not('nivel_ia4', 'is', null),
    ]);

    teamData = { totalColabs: totalColabs || 0, totalRespostas: totalRespostas || 0 };
  }

  // Competência foco da trilha ativa (Motor de Temporadas) + sys_config da
  // empresa — pré-buscados pela home consolidada quando `shared` vem preenchido.
  let trilhaAtiva: any;
  let cfg: any;
  if (shared?.trilha !== undefined && shared?.sysConfig !== undefined) {
    trilhaAtiva = shared.trilha;
    cfg = shared.sysConfig || {};
  } else {
    const [trilhaAtivaRes, empCfgRes] = await Promise.all([
      sb.from('trilhas')
        .select('competencia_foco, numero_temporada, status, temporada_plano')
        .eq('colaborador_id', colab.id)
        .order('criado_em', { ascending: false })
        .limit(1).maybeSingle(),
      sb.from('empresas')
        .select('sys_config')
        .eq('id', colab.empresa_id)
        .maybeSingle(),
    ]);
    trilhaAtiva = trilhaAtivaRes.data;
    cfg = ((empCfgRes.data?.sys_config) as any) || {};
  }

  const competenciaFoco = trilhaAtiva?.competencia_foco || null;
  const temporadaPronta = !!(trilhaAtiva?.temporada_plano && Array.isArray(trilhaAtiva.temporada_plano) && trilhaAtiva.temporada_plano.length > 0 && trilhaAtiva.status !== TRILHA.ARQUIVADA);

  // Fonte externa de perfil (OPQ32, Hogan, etc.) — quando empresa tem
  // configurada, o colaborador não vai fazer mapeamento DISC nativo.
  const empresaPerfilExternoFonte = cfg.perfil_externo_fonte ?? null;
  const perfilComportamentalLiberado = isPerfilComportamentalLiberado(cfg);
  const mapeamentoCenariosLiberado = isMapeamentoCenariosLiberado(cfg);

  return {
    colaborador: colab,
    role: ctx.role,
    view,
    isPlatformAdmin: ctx.isPlatformAdmin,
    competenciaFoco,
    temporada: trilhaAtiva,
    temporadaPronta,
    teamData,
    empresaPerfilExternoFonte,
    perfilComportamentalLiberado,
    mapeamentoCenariosLiberado,
    cargoSemCompetencias,
  };
}

// ── Jornada (fases 1-5) ────────────────────────────────────────────────────

export async function carregarJornada(colab: any, shared?: HomeSharedData) {
  const sb = createSupabaseAdmin();

  const cfg = shared?.sysConfig !== undefined
    ? (shared.sysConfig || {})
    : (((await sb.from('empresas')
        .select('sys_config')
        .eq('id', colab.empresa_id)
        .maybeSingle()).data?.sys_config) as any) || {};
  const empresaPerfilExternoFonte = cfg.perfil_externo_fonte ?? null;
  const usaPerfilExterno = !!empresaPerfilExternoFonte;
  const perfilComportamentalLiberado = isPerfilComportamentalLiberado(cfg);

  const fases = [];

  // Fase 1 — Diagnóstico comportamental.
  // Empresas com fonte externa/proprietária não fazem DISC na Vertho:
  // a etapa não deve bloquear o avanço para a avaliação de competências.
  const temDISC = !!colab.perfil_dominante;
  const temPerfilExterno = !!colab.perfil_externo_dados;
  fases.push({
    fase: 1,
    titulo: 'Diagnóstico',
    descricao: usaPerfilExterno
      ? 'Mapeamento comportamental conduzido pela empresa'
      : perfilComportamentalLiberado
        ? 'Mapeamento do perfil comportamental'
        : 'Aguardando liberação do perfil comportamental',
    status: (usaPerfilExterno || temDISC) ? 'completed' : 'pending',
    data: (temDISC || temPerfilExterno) ? null : null, // DISC date not stored separately
    usaPerfilExterno,
  });

  // Fase 2 — Avaliação (respostas de competências do fluxo do dashboard)
  // Total = quantas competências o cargo tem no top5_workshop
  const { data: cargoEmp } = await sb.from('cargos_empresa')
    .select('top5_workshop').eq('empresa_id', colab.empresa_id).eq('nome', colab.cargo).maybeSingle();
  const totalComp = (cargoEmp?.top5_workshop || []).length;

  // Respondidas = contagem de respostas do colab (qualquer canal, sem filtro de IA4)
  const respondidasCount = shared?.respostasCount !== undefined
    ? shared.respostasCount
    : ((await sb.from('respostas')
        .select('id', { count: 'exact', head: true })
        .eq('colaborador_id', colab.id)
        .eq('empresa_id', colab.empresa_id)).count || 0);

  const avaliacaoCompleta = totalComp > 0 && respondidasCount >= totalComp;
  const avaliacaoIniciada = respondidasCount > 0;
  fases.push({
    fase: 2,
    titulo: 'Avaliação',
    descricao: `Competências avaliadas: ${respondidasCount}/${totalComp}`,
    status: avaliacaoCompleta ? 'completed' : avaliacaoIniciada ? 'current' : 'pending',
    data: null,
  });

  // Trilha (necessária pra liberar Fase 3) — Motor de Temporadas
  const trilha = shared?.trilha !== undefined
    ? shared.trilha
    : (await sb.from('trilhas')
        .select('id, status, temporada_plano, competencia_foco, criado_em')
        .eq('colaborador_id', colab.id)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()).data;

  const temPlano = trilha?.temporada_plano && Array.isArray(trilha.temporada_plano) && trilha.temporada_plano.length > 0;

  // Fase 3 — PDI. Ele nasce da avaliação completa e antecede a jornada; exigir
  // trilha aqui invertia o funil e escondia um PDI que já existia.
  const { data: pdi } = await sb.from('relatorios')
    .select('id, gerado_em')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  let pdiStatus, pdiDesc;
  if (pdi) {
    pdiStatus = 'completed';
    pdiDesc = 'Plano de Desenvolvimento Individual';
  } else if (!avaliacaoCompleta) {
    pdiStatus = 'pending';
    pdiDesc = 'Conclua a avaliação para liberar seu PDI';
  } else {
    pdiStatus = 'pending';
    pdiDesc = 'Aguardando geração do PDI';
  }

  fases.push({
    fase: 3,
    titulo: 'PDI',
    descricao: pdiDesc,
    status: pdiStatus,
    data: pdi?.gerado_em || null,
    bloqueado: !pdi && !avaliacaoCompleta,
  });

  // Fase 4 — Temporada (já carregada acima)
  let semanaAtual = 1;
  if (temPlano) {
    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('semana, status').eq('trilha_id', trilha.id).order('semana');
    const concluidas = (progresso || []).filter(p => p.status === PROGRESSO.CONCLUIDO).length;
    semanaAtual = Math.min(totalSemanasDoPlano(trilha.temporada_plano, TOTAL_SEMANAS_FALLBACK), concluidas + 1);
  }

  const temporadaStatus = trilha?.status === TRILHA.CONCLUIDA ? 'completed'
    : (temPlano && trilha.status === TRILHA.ATIVA) ? 'current'
    : 'pending';

  fases.push({
    fase: 4,
    titulo: 'Temporada',
    descricao: temPlano
      ? `Semana ${semanaAtual} de ${totalSemanasDoPlano(trilha.temporada_plano, TOTAL_SEMANAS_FALLBACK)} · ${trilha.competencia_foco || ''}`
      : 'Aguardando geração da trilha personalizada',
    status: temporadaStatus,
    data: trilha?.criado_em || null,
  });

  // Fase 5 — Reavaliação
  // Check if there's a second round of respostas or a reavaliacao flag
  const { count: reavaliacoes } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('rodada', 2);

  fases.push({
    fase: 5,
    titulo: 'Reavaliação',
    descricao: 'Medição de evolução pós-capacitação',
    status: reavaliacoes > 0 ? 'completed' : 'pending',
    data: null,
  });

  return {
    colaborador: colab,
    fases,
    empresaPerfilExternoFonte,
    temPerfilExterno,
    // PDF original existe mesmo antes da extração rodar — e é ele que a pessoa
    // reconhece. Sem isto a Fase 1 fica "concluída" e sem destino clicável.
    temPdfPerfilExterno: !!colab.perfil_externo_pdf_path,
    perfilComportamentalLiberado,
  };
}

// ── KPIs da home (ciclo semanal) ───────────────────────────────────────────
// `jornadaR` pode ser o resultado da jornada OU a promise dele — a home
// consolidada passa a promise pra manter o paralelismo (a jornada só é
// aguardada no passo da fase, como antes acontecia dentro do loadHomeKpis).

export async function carregarHomeKpis(colab: any, jornadaR: Promise<any> | any, shared?: HomeSharedData): Promise<any> {
  try {
    const sb = createSupabaseAdmin();
    const agora = new Date();

    // ── Trilha + progresso (base de quase tudo) ──────────────────────────
    const trilha = shared?.trilha !== undefined
      ? shared.trilha
      : (await sb.from('trilhas')
          .select('id, cursos, competencia_foco, temporada_plano, data_inicio')
          .eq('colaborador_id', colab.id)
          .eq('empresa_id', colab.empresa_id)
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle()).data;

    const totalSemanas = totalSemanasDoPlano(trilha?.temporada_plano, TOTAL_SEMANAS_FALLBACK);

    // ── Qual é a semana da pessoa AGORA ─────────────────────────────────
    //
    // 🔴 Corrigido em 27/08. Isto vinha de
    // `.order('semana', {ascending:false}).limit(1)` sobre
    // `temporada_semana_progresso` — e essa é a MAIOR semana que existe na
    // tabela, não a semana em que a pessoa está. As 87 trilhas nascem com as
    // 14 linhas de uma vez (`montarTrilhas`), então aquilo respondia **14 para
    // todo mundo**, sempre.
    //
    // Não foi notado porque o mesmo select pedia `created_at`, coluna que
    // NUNCA existiu nesta tabela (ela tem `iniciado_em`/`concluido_em`): o
    // PostgREST devolvia 42703, o supabase-js RETORNA `{ error }` em vez de
    // lançar, e o `const { data: progresso }` descartava o erro. Com
    // `progresso` undefined, `semanaAtual` caía para 0 e os três blocos abaixo
    // (pílula, evidência, próximo marco) ficavam `null` — os cards
    // simplesmente não apareciam, com 941 linhas de progresso reais no banco.
    //
    // Quem responde "que semana liberou" é `week-gating`, a mesma régua da tela
    // `/dashboard/temporada` (data_inicio + (N-1)*7 dias às 03:00 BRT). Antes
    // este arquivo refazia a conta à mão a partir de um timestamp de linha, sem
    // o horário de corte — uma segunda régua para a mesma pergunta.
    let semanaAtual = 0;
    for (let n = 1; n <= totalSemanas; n++) {
      if (semanaLiberadaPorData(trilha?.data_inicio, n, agora)) semanaAtual = n;
    }

    // O progresso da semana CORRENTE — não o da última linha da tabela.
    let progresso: any = null;
    if (semanaAtual > 0) {
      const { data, error } = await sb.from('temporada_semana_progresso')
        .select('semana, conteudo_consumido, iniciado_em, concluido_em')
        .eq('colaborador_id', colab.id)
        .eq('empresa_id', colab.empresa_id)
        .eq('semana', semanaAtual)
        .maybeSingle();
      // Falha de leitura NÃO pode virar "semana 0" em silêncio: era exatamente
      // assim que este bloco morria.
      if (error) {
        // O `code` do Postgres é a parte acionável (42703 = coluna inexistente,
        // 42P01 = tabela). Log sem ele obriga a adivinhar a classe do erro.
        console.error(
          `[carregarHomeKpis] progresso da semana ${semanaAtual} falhou [${error.code || 'sem code'}]: ${error.message}`,
        );
      } else {
        progresso = data;
      }
    }

    const cursos = Array.isArray(trilha?.cursos) ? trilha.cursos : [];

    // ── 1. Pílula da semana ──────────────────────────────────────────────
    // Os status do CARD de pílula/evidência (concluida, em-curso, pendente…)
    // são domínio local de UI, consumido pelo page.tsx — não são
    // trilhas.status nem temporada_semana_progresso.status, então ficam
    // literais de propósito (ver config/status-literal-allowlist.json).
    let pilula = null;
    if (semanaAtual > 0) {
      // Tenta achar curso específico da semana; se não houver, usa o índice
      const cursoSemana = cursos[semanaAtual - 1] || null;
      // 🔑 A régua de "consumiu" é UMA só — `consumiuConteudo` (27/08). Aqui
      // estava `cursosProg.some(p => p?.semana === … && p?.concluido)`, que só
      // enxerga o formato ARRAY do campo. Das 941 linhas de hoje, **zero** estão
      // em array (838 `false`, 129 `true`), então essa expressão respondia
      // `false` mesmo para quem marcou a semana como realizada.
      const concluida = consumiuConteudo(progresso?.conteudo_consumido);
      pilula = {
        titulo: cursoSemana?.nome || `Pílula da semana ${semanaAtual}`,
        semana: semanaAtual,
        // D1: a barra da home dividia por 14 fixo. Quem manda é o plano.
        totalSemanas,
        status: concluida ? 'concluida' : 'em-curso',
        ehImplementacao: ehSemanaDeImplementacao(trilha?.temporada_plano, semanaAtual),
      };
    }

    // ── 2. Evidência da semana ──────────────────────────────────────────
    let evidencia = null;
    if (semanaAtual > 0) {
      let evid = null;
      try {
        const { data } = await sb.from('capacitacao')
          .select('id, created_at')
          .eq('colaborador_id', colab.id)
          .eq('empresa_id', colab.empresa_id)
          .eq('semana', semanaAtual)
          .eq('tipo', 'evidencia')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        evid = data;
      } catch (e) {
        console.warn('[loadHomeKpis] capacitacao query falhou (tabela pode não existir):', e?.message);
      }

      // A janela da semana vem da MESMA régua que libera a semana na tela
      // (`week-gating`), não de aritmética local sobre um timestamp de linha:
      // a liberação tem hora de corte (03:00 BRT) e refazê-la à mão aqui
      // produzia uma segunda régua, deslocada em até um dia.
      const inicioSemana = semanaLiberadaEm(trilha?.data_inicio, semanaAtual);
      const fimSemana = semanaLiberadaEm(trilha?.data_inicio, semanaAtual + 1);

      if (!inicioSemana || !fimSemana) {
        // Sem `data_inicio` não há janela — e um card de prazo chutado é pior
        // que card nenhum.
        evidencia = null;
      } else if (evid) {
        evidencia = { status: 'registrada', dataRegistro: evid.created_at };
      } else if (agora >= fimSemana) {
        const diasAtraso = Math.floor((agora.getTime() - fimSemana.getTime()) / MS_DIA);
        evidencia = { status: 'atrasada', diasAtraso };
      } else {
        const diasRestantes = Math.max(0, Math.ceil((fimSemana.getTime() - agora.getTime()) / MS_DIA));
        evidencia = { status: 'pendente', diasRestantes };
      }
    }

    // ── 3. Fase atual da jornada ─────────────────────────────────────────
    let faseAtual = null;
    try {
      const jr = await jornadaR;
      if (!jr?.error && jr?.fases?.length) {
        const fases = jr.fases;
        const proxima = fases.find(f => f.status !== 'completed');
        if (proxima) {
          faseAtual = { numero: proxima.fase, titulo: proxima.titulo, status: proxima.status };
        } else {
          // Tudo concluído
          const ultima = fases[fases.length - 1];
          faseAtual = { numero: ultima.fase, titulo: ultima.titulo, status: 'completed', concluida: true };
        }
      }
    } catch (e) {
      console.warn('[loadHomeKpis] loadJornada falhou:', e?.message);
    }

    // ── 4. Próximo marco (countdown em dias) ─────────────────────────────
    let proximoMarco = null;
    if (semanaAtual > 0 && trilha?.data_inicio) {
      const marcos = [];
      // D1: o horizonte é o do PLANO desta pessoa. Com 14 fixo, a jornada de 7
      // semanas ganhava 7 marcos de "próxima pílula" que não existem, e o
      // "Trilha conclui" caía ~7 semanas depois do fim real.
      for (let s = semanaAtual + 1; s <= totalSemanas; s++) {
        const dataSemana = semanaLiberadaEm(trilha.data_inicio, s);
        if (!dataSemana) continue;
        const diasAte = Math.ceil((dataSemana.getTime() - agora.getTime()) / MS_DIA);
        if (diasAte <= 0) continue;
        const ehImpl = ehSemanaDeImplementacao(trilha?.temporada_plano, s);
        const ehFim = s === totalSemanas;
        marcos.push({
          tipo: ehFim ? 'fim' : ehImpl ? 'implementacao' : 'pilula',
          semana: s,
          diasAte,
          label: ehFim ? 'Trilha conclui'
            : ehImpl ? 'Semana de Implementação'
            : 'Próxima pílula',
        });
      }
      // Pega o evento mais próximo no futuro
      marcos.sort((a, b) => a.diasAte - b.diasAte);
      proximoMarco = marcos[0] || null;
    }

    return {
      pilula,
      evidencia,
      fase: faseAtual,
      proximoMarco,
    };
  } catch (err) {
    console.error('[loadHomeKpis]', err);
    return { error: err?.message || 'Erro ao carregar KPIs' };
  }
}

// ── Últimos vídeos assistidos ──────────────────────────────────────────────

export async function carregarUltimosVideos(colabId: string, limit: number = 3) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('videos_watched')
    .select('video_id, seconds_watched, video_length, event_type, created_at')
    .eq('colaborador_id', colabId)
    .order('created_at', { ascending: false })
    .limit(limit * 3); // overfetch pra poder deduplicar

  const seen = new Set<string>();
  const items: any[] = [];
  for (const r of (data || [])) {
    if (!r.video_id || seen.has(r.video_id)) continue;
    seen.add(r.video_id);
    const length = Number(r.video_length) || 0;
    const watched = Number(r.seconds_watched) || 0;
    const pct = length > 0 ? Math.min(100, Math.round((watched / length) * 100)) : 0;
    items.push({
      videoId: r.video_id,
      secondsWatched: watched,
      videoLength: length,
      pct,
      concluido: r.event_type === 'play_finished' || pct >= 90,
      watchedAt: r.created_at,
    });
    if (items.length >= limit) break;
  }
  return { items };
}

// ── Pulsos pendentes ───────────────────────────────────────────────────────

export async function carregarPulsosPendentes(colabId: string) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('pulse_assignments')
    .select('id, pulse_moment, status, due_date, ciclo_id')
    .eq('colaborador_id', colabId)
    .in('status', ['pending', 'started'])
    .or(`due_date.is.null,due_date.gte.${new Date().toISOString().slice(0, 10)}`)
    .order('due_date', { ascending: true, nullsFirst: false });
  return data || [];
}

// ── Votação (status rápido) ────────────────────────────────────────────────

export async function carregarVotacaoStatus(colab: any, shared?: HomeSharedData) {
  try {
    const config = shared?.sysConfig !== undefined
      ? (shared.sysConfig || {})
      : ((await createSupabaseAdmin().from('empresas')
          .select('sys_config').eq('id', colab.empresa_id).maybeSingle()).data?.sys_config) || {};
    const votacaoAtiva = config.votacao_ativa === true;
    const perfilComportamentalLiberado = isPerfilComportamentalLiberado(config);
    const mapeamentoCenariosLiberado = isMapeamentoCenariosLiberado(config);
    if (!votacaoAtiva) return { votacaoAtiva: false, jaVotou: false, perfilComportamentalLiberado, mapeamentoCenariosLiberado };

    const tdb = tenantDb(colab.empresa_id);
    const { data: voto } = await (tdb.from('votacao_competencias') as any)
      .select('id')
      .eq('colaborador_id', colab.id)
      .maybeSingle();

    return { votacaoAtiva: true, jaVotou: !!voto, perfilComportamentalLiberado, mapeamentoCenariosLiberado };
  } catch {
    return null;
  }
}

// ── Capacitação recomendada (micro_conteudos da competência foco) ──────────
// Mesma query da API route /api/capacitacao-recomendada, já com o tenant
// resolvido pela sessão (a route validava o empresa_id vindo do client).

export async function carregarCapacitacoes(empresaId: string | null, competencia: string | null, limit: number = 12) {
  if (!competencia) return [];
  try {
    const sb = createSupabaseAdmin();
    let q = sb.from('micro_conteudos')
      .select('id, titulo, descricao, formato, descritor, bunny_video_id, url, conteudo_inline, duracao_min, tipo_conteudo, modulo_base_id, created_at')
      .eq('competencia', competencia)
      .eq('ativo', true)
      .order('tipo_conteudo', { ascending: true }) // 'core' antes de 'complementar'
      .order('created_at', { ascending: false })
      .limit(limit);

    // Sempre escopa: tenant do usuário + conteúdo global (NULL). Sem tenant
    // (ex.: platform admin sem empresa_id) → só o conteúdo global.
    q = empresaId
      ? q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`)
      : q.is('empresa_id', null);

    const { data, error } = await q;
    if (error) return [];
    return data || [];
  } catch (err) {
    console.error('[carregarCapacitacoes]', err);
    return [];
  }
}

// ── Panorama do RH (Admin da empresa) ──────────────────────────────────────

/**
 * A home do RH não é a jornada DELE — é o estado da EMPRESA.
 *
 * O papel `rh` se chama "Admin da empresa" (`lib/permissions.ts`) e não
 * participa do programa: medido em 24/08/2026, **0 dos 8 colaboradores com
 * `role='rh'` têm sessão de avaliação**, e nenhum tem trilha em tenant de
 * cliente. Mesmo assim a home renderizava a jornada de 5 fases, com o CTA
 * principal convidando a "fazer o mapeamento comportamental" e a barra de
 * progresso presa em 0% — a tela pedia à administradora que fizesse o
 * diagnóstico que ela aplica nos outros.
 *
 * ⚠️ Os três números são de PESSOAS, não de ocorrências. `respostas` tem uma
 * linha por competência respondida, então contá-las e chamar de "avaliados"
 * multiplicaria cada pessoa pelo tamanho do Top 5 — a classe do "N ocorrências
 * ≠ N pessoas". Por isso `emJornada` deduplica `colaborador_id` em código (a
 * pessoa pode ter mais de uma trilha ao longo das temporadas) e os outros dois
 * contam a própria tabela de pessoas.
 *
 * `indisponivel` existe porque `count` vem `null` quando a query falha, e
 * `null || 0` = 0: sem isso a home anunciaria "0 pessoas" para uma empresa
 * inteira por causa de um erro de banco — o mesmo modo de falha do F15.
 */
export async function carregarPanoramaRH(empresaId: string) {
  // `tenantDb` e não `createSupabaseAdmin`: os três números são de UMA empresa,
  // e o wrapper injeta o `empresa_id` em toda cadeia. `empresas` é a própria
  // linha do tenant (a chave é `id`, não `empresa_id`), então vai pelo `raw`.
  const tdb = tenantDb(empresaId);

  // A empresa vem antes das contagens porque a régua de "tem perfil" depende
  // dela: quem usa fonte externa (OPQ32, Hogan) não faz DISC, e ali "sem perfil"
  // é "sem o PDF extraído".
  const empresaRes = await tdb.raw.from('empresas')
    .select('nome, sys_config').eq('id', empresaId).maybeSingle();
  const fonteExterna = (empresaRes.data?.sys_config as any)?.perfil_externo_fonte ?? null;

  const [pessoasRes, participantesRes, comPerfilRes, trilhasRes, encerradasRes, assessRes, cargosRes] = await Promise.all([
    tdb.from('colaboradores')
      .select('id', { count: 'exact', head: true })
      .neq('role', 'rh'),
    tdb.from('colaboradores')
      .select('id, cargo')
      .neq('role', 'rh'),
    // 🔑 `perfil_dominante`, não `disc_resultados`. É a MESMA coluna que o resto
    // do app usa para decidir se a pessoa tem perfil — o gate da home
    // (`precisaMapeamentoDISC`), o alerta do gestor e o mapa de perfis. Medido em
    // 25/08 no tenant `macae`: 144 pessoas têm `perfil_dominante` e só 105 têm
    // `disc_resultados` (as 39 vieram por importação, que carimba a letra e não
    // grava o JSON). Contar pelo JSON fazia este card dizer 105 enquanto a tela
    // de Equipe tratava 144 como mapeadas — dois números para a mesma pergunta.
    fonteExterna
      ? tdb.from('colaboradores')
          .select('id', { count: 'exact', head: true })
          .neq('role', 'rh')
          .not('perfil_externo_dados', 'is', null)
      : tdb.from('colaboradores')
          .select('id', { count: 'exact', head: true })
          .neq('role', 'rh')
          .or('perfil_dominante.not.is.null,perfil_externo_dados.not.is.null'),
    tdb.from('trilhas')
      .select('id, colaborador_id, data_inicio, temporada_plano')
      .eq('status', TRILHA.ATIVA),
    // Jornadas ENCERRADAS: é o que libera a tela de evolução. O veredito
    // (confirmada · parcial · estagnação · regressão) nasce no fechamento, então
    // antes da primeira conclusão aquela tela é seis KPIs zerados — e um atalho
    // para ela é um convite para o vazio.
    tdb.from('trilhas')
      .select('id', { count: 'exact', head: true })
      .eq('status', TRILHA.CONCLUIDA),
    // Uma linha por DESCRITOR avaliado — o maior tenant hoje tem 576 (macae).
    // Traz só a coluna que identifica a pessoa e deduplica em código: é o
    // "quantas PESSOAS" que a tela pergunta, não quantas notas existem.
    tdb.from('descriptor_assessments').select('colaborador_id, competencia'),
    tdb.from('cargos_empresa').select('nome, top5_workshop'),
  ]);

  const erro = pessoasRes.error || participantesRes.error || comPerfilRes.error || trilhasRes.error
    || assessRes.error || cargosRes.error || encerradasRes.error;
  if (erro) console.error('[panorama-rh] contagens falharam:', erro.message);

  const trilhas = trilhasRes.data || [];
  const emJornada = new Set(trilhas.map((t: any) => t.colaborador_id)).size;
  const comMapeamento = colaboradoresComMapeamentoCompleto(
    participantesRes.data || [],
    cargosRes.data || [],
    assessRes.data || [],
  ).size;

  // Progresso das trilhas ativas — uma linha por semana de cada trilha (~530 no
  // maior tenant). É o que separa "em jornada" de "andando": sem isto, 38 ativas
  // parecem 38 pessoas em dia, e `Medido em 25/08` 30 delas estão atrasadas.
  const progressoPorTrilha = new Map<string, number>();
  if (trilhas.length > 0) {
    const { data: progs, error: errProg } = await tdb.from('temporada_semana_progresso')
      .select('trilha_id, status')
      .in('trilha_id', trilhas.map((t: any) => t.id));
    if (errProg) console.error('[panorama-rh] progresso falhou:', errProg.message);
    for (const p of progs || []) {
      if (p.status !== PROGRESSO.CONCLUIDO) continue;
      progressoPorTrilha.set(p.trilha_id, (progressoPorTrilha.get(p.trilha_id) || 0) + 1);
    }
  }

  let emDia = 0;
  let atrasadas = 0;
  for (const t of trilhas) {
    const atrasada = estaAtrasada({
      dataInicio: t.data_inicio,
      totalSemanas: totalSemanasDoPlano(t.temporada_plano, TOTAL_SEMANAS_FALLBACK),
      semanasConcluidas: progressoPorTrilha.get(t.id) || 0,
    });
    // `null` (trilha sem data de início) não entra em nenhum dos dois: a soma
    // dos dois pode ser menor que `emJornada`, e isso é honesto — melhor que
    // carimbar "em dia" quem não dá para avaliar.
    if (atrasada === true) atrasadas++;
    else if (atrasada === false) emDia++;
  }

  return {
    empresaNome: empresaRes.data?.nome || null,
    pessoas: pessoasRes.count || 0,
    comPerfil: comPerfilRes.count || 0,
    comMapeamento,
    emJornada,
    emDia,
    atrasadas,
    jornadasEncerradas: encerradasRes.count || 0,
    indisponivel: !!erro,
  };
}

// ── Relatórios gerenciais da empresa (o que o RH leva para a diretoria) ────

/**
 * Os três documentos de GESTÃO que a plataforma entrega no fim do ciclo —
 * Relatório de RH, Perfil Organizacional e DNA Organizacional. É a etapa 5 do
 * material do CONARH menos o Relatório do Gestor, que é da liderança direta e
 * não do RH.
 *
 * Consome, não gera: os três nascem de ações de plataforma
 * (`gerarDnaOrganizacional`, `gerarPerfilOrganizacional`, e o de RH pelo
 * pipeline de relatórios). Aqui só se lê o que já existe — pela decisão de
 * 24/08, quem gera é a Vertho.
 *
 * Onde cada um mora é diferente, e é por isso que este loader existe:
 *  · RH        → linha em `relatorios` (tipo='rh'), PDF por `/api/relatorios/pdf`
 *                — rota que já autoriza `rh` do mesmo tenant;
 *  · DNA e PO  → arquivo em `conteudos/final/{dna,perfil-org}/{empresaId}-{ts}.pdf`,
 *                sem índice em tabela. Lista-se o diretório e filtra-se pelo
 *                PREFIXO do tenant — `search` do Storage é substring, então
 *                confiar só nele deixaria passar arquivo de outra empresa cujo
 *                nome contivesse o id.
 *
 * `Medido em 25/08`: macae tem 1 DNA e 1 PO (nenhum RH); ibipeba tem os três.
 */
export async function carregarRelatoriosGerenciais(empresaId: string) {
  const tdb = tenantDb(empresaId);

  const maisRecenteNoStorage = async (pasta: string) => {
    const { data, error } = await tdb.storage.from('conteudos').list(pasta, {
      limit: 1000,
      search: empresaId,
    });
    if (error) { console.error(`[relatorios-gerenciais] list ${pasta}:`, error.message); return null; }
    const prefixo = `${empresaId}-`;
    const arquivos = (data || [])
      .filter((f: any) => f.name.startsWith(prefixo) && f.name.endsWith('.pdf'))
      // O nome carrega o timestamp da geração — ordenar por ele evita depender
      // de `created_at`, que o Storage nem sempre devolve preenchido.
      .sort((a: any, b: any) => Number(b.name.slice(prefixo.length, -4)) - Number(a.name.slice(prefixo.length, -4)));
    if (arquivos.length === 0) return null;
    const nome = arquivos[0].name;
    const { data: pub } = tdb.storage.from('conteudos').getPublicUrl(`${pasta}/${nome}`);
    const ts = Number(nome.slice(prefixo.length, -4));
    return { url: pub.publicUrl, em: Number.isFinite(ts) ? new Date(ts).toISOString() : null };
  };

  const [rhRes, dna, perfilOrg] = await Promise.all([
    tdb.from('relatorios')
      .select('id, gerado_em')
      .eq('tipo', 'rh')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    maisRecenteNoStorage('final/dna'),
    maisRecenteNoStorage('final/perfil-org'),
  ]);

  if (rhRes.error) console.error('[relatorios-gerenciais] relatorio de RH:', rhRes.error.message);

  return {
    rh: rhRes.data ? { url: `/api/relatorios/pdf?id=${rhRes.data.id}`, em: rhRes.data.gerado_em } : null,
    perfilOrg,
    dna,
  };
}
