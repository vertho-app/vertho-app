import { lerPaginas } from '@/lib/db/ler-paginas';
import { recortarElencoDemo } from '@/lib/demo/elenco-visivel';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getDashboardView } from '@/lib/authz';
import { tenantDb } from '@/lib/tenant-db';
import { hrefRelatorio, listarArtefatosRelatorio } from '@/lib/relatorios/relatorio-privado';
import { isMapeamentoCenariosLiberado, isPerfilComportamentalLiberado } from '@/lib/votacao/status';
import { FASE_FORA_DA_DEGUSTACAO, PROGRESSO, TRILHA } from '@/lib/status';
import type { UserContext } from '@/types';
import { colaboradorEmDegustacao } from '@/lib/demo/degustacao-mapeamento';
import { ehSemanaDeImplementacao, reavaliacaoConcluida } from '@/lib/season-engine/trilha-runtime';
import { duracaoDaTrilha } from '@/lib/season-engine/duracao-trilha';
import { estaAtrasada } from '@/lib/season-engine/atraso';
import { semanaLiberadaEm, semanaLiberadaPorData } from '@/lib/season-engine/week-gating';
import { consumiuConteudo } from '@/lib/season-engine/consumo-conteudo';
import { colaboradoresComMapeamentoCompleto, distribuicaoMapeamento, progressoMapeamentoPorPessoa } from '@/lib/mapeamento-competencias';
import { blocoEstaOffline } from '@/lib/blocos-offline';
import { empresaOuGlobal } from '@/lib/postgrest-valor';
import { INTERNAL_EMAIL_DOMAINS, isInternalEmail } from '@/lib/internal-emails';
import { escaparLike } from '@/lib/sql-like';
import { JANELA_ABERTA, trilhaDaParticipacao, type Janela } from '@/lib/turmas/janela';
import { artefatoDaJornadaAtual, carregarJornadaAtual } from '@/lib/turmas/jornada-atual';
import { competenciasParaContagem, progressoDoMapeamento } from '@/lib/assessment/competencias-do-mapeamento';
import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

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
  /** A trilha da JORNADA ATUAL (`carregarJornadaAtual`), não a mais recente da pessoa. */
  trilha?: any;
  /** Janela da participação ativa: decide se PDI e afins são desta jornada. */
  janela?: Janela;
  sysConfig?: any;
  /** Progresso do mapeamento pela régua do assessment (`carregarProgressoMapeamento`). */
  mapeamento?: ProgressoDoMapeamento;
  /** `empresas.is_demo`, lido junto com a config: decide se o mapeamento é o da degustação. */
  empresaIsDemo?: boolean;
}

export interface ProgressoDoMapeamento {
  respondidas: number;
  total: number;
}

/** Colunas que a jornada precisa no colaborador (superset do default do authz). */
export const JORNADA_COLAB_COLS =
  'id, nome_completo, email, cargo, area_depto, empresa_id, perfil_dominante, perfil_externo_dados, perfil_externo_pdf_path, created_at';

/** Colunas da trilha que a home lê (dashboard, jornada e KPIs). */
export const HOME_TRILHA_COLS =
  'cursos, competencia_foco, numero_temporada, status, temporada_plano, data_inicio, programa_modo, programa_config';

/**
 * A trilha e a janela da JORNADA ATUAL. A home lia "a trilha mais recente da
 * pessoa": quem entrou numa turma nova (Temporada 2 de Ibipeba, 09/10/2026) via a
 * jornada anterior em 100% e voltava para as semanas dela. Ver `lib/turmas/jornada-atual.ts`.
 */
async function jornadaDaHome(sb: any, colab: any, shared?: HomeSharedData): Promise<{ trilha: any; janela: Janela }> {
  // A home consolidada manda as duas juntas. Quem pré-buscou só a trilha (sem
  // janela) fica sem corte: o PDI vale como sempre valeu.
  if (shared?.trilha !== undefined) {
    return { trilha: shared.trilha, janela: shared.janela ?? JANELA_ABERTA };
  }
  const jornada = await carregarJornadaAtual(sb, colab.empresa_id, colab.id, HOME_TRILHA_COLS);
  return { trilha: jornada.trilha, janela: jornada.janela };
}

/**
 * Quantas competências do mapeamento a pessoa já respondeu, pela régua do
 * cabeçalho do assessment (`lib/assessment/competencias-do-mapeamento.ts`): o Top
 * 5 do cargo com o teto da degustação, e só resposta DE UMA DELAS conta.
 *
 * A home contava TODAS as respostas da pessoa contra o Top 5 do cargo. Com o Top 5
 * trocado para a temporada nova (Ibipeba, só Comunicação), as duas respostas da
 * jornada 1 davam "2 de 1": fase concluída, barra em 100% e botão "Ver resultado",
 * com o mapeamento novo intocado. Falha de leitura LANÇA.
 */
export async function carregarProgressoMapeamento(
  sb: any,
  colab: any,
  empresaIsDemo?: boolean,
): Promise<ProgressoDoMapeamento> {
  const degustacao = await colaboradorEmDegustacao(sb, colab, empresaIsDemo);
  const [competencias, respostasRes] = await Promise.all([
    competenciasParaContagem(sb, colab, degustacao),
    sb.from('respostas')
      .select('competencia_id, competencia_nome')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id),
  ]);
  if (respostasRes.error) throw new Error(`respostas: ${respostasRes.error.message}`);
  return progressoDoMapeamento(competencias, respostasRes.data || []);
}

/**
 * Quem responde "quantas semanas" é `duracaoDaTrilha(trilha)` (o plano da
 * trilha, ou o snapshot/carimbo dela quando o plano não veio no select): UMA
 * conta para a home, o WhatsApp, o certificado e o painel do gestor (R-29).
 * Não há literal de duração neste arquivo, de propósito.
 *
 * D1 (auditoria 22/08): este arquivo já documentava, duas linhas abaixo, que
 * `SEMANAS_IMPLEMENTACAO` era "fallback histórico" e delegava a
 * `ehSemanaDeImplementacao(plano, s)` — e deixava o TOTAL sem delegação
 * nenhuma. Os 5 presets valem 14 (regular), 12 (onboarding), 14 (regular_duo),
 * 3 (piloto) e 7 (jornada): quem está numa jornada lia "Semana 3 de 14" na
 * home, e o card "Próximo marco" anunciava pílulas de semanas que não existem
 * no plano dela.
 */
// Fallback histórico: o formato de 14 semanas. Quem responde de verdade é o
// plano da trilha (ver `ehSemanaDeImplementacao`).
const SEMANAS_IMPLEMENTACAO = [4, 8, 12];
const MS_DIA = 24 * 60 * 60 * 1000;

// ── Dashboard (progresso + temporada + sys_config) ─────────────────────────

export async function carregarDashboardData(ctx: UserContext, shared?: HomeSharedData) {
  const sb = createSupabaseAdmin();
  const colab: any = ctx.colaborador;
  const view = getDashboardView(ctx);

  // A régua da Fase 2 é a do ASSESSMENT: o Top 5 do CARGO (com o teto da
  // degustação para o convidado), e só conta resposta de competência desse Top 5.
  // Contar todas as competências da empresa fazia a Bruna aparecer incompleta
  // mesmo com 5/5 respondidas; contar todas as RESPOSTAS da pessoa dava a
  // temporada nova por concluída com as respostas da anterior (09/10/2026).
  const [mapeamentoR, avaliadasR] = await Promise.allSettled([
    shared?.mapeamento !== undefined
      ? Promise.resolve(shared.mapeamento)
      : carregarProgressoMapeamento(sb, colab, shared?.empresaIsDemo),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .not('nivel_ia4', 'is', null),
  ]);
  const mapeamento = mapeamentoR.status === 'fulfilled' ? mapeamentoR.value : null;
  const avaliadas = avaliadasR.status === 'fulfilled' && !(avaliadasR.value as any).error
    ? (avaliadasR.value as any).count
    : null;

  // Falha de leitura não vira "0 de 0" nem "0% de progresso" para quem respondeu
  // tudo: falha de banco escrita na tela como se fosse o estado da pessoa, a
  // mesma classe do certificado que acusava "participação < 75%" (F15).
  if (!mapeamento || avaliadas === null) {
    console.error('[home] contagens de progresso falharam:',
      mapeamentoR.status === 'rejected' ? mapeamentoR.reason?.message : (avaliadasR as any).value?.error?.message || (avaliadasR as any).reason?.message);
    colab.progressoIndisponivel = true;
  }

  const totalComp = mapeamento?.total || 0;
  const respondidas = mapeamento?.respondidas || 0;
  colab.totalComp = totalComp;
  colab.respondidas = respondidas;
  colab.avaliadas = avaliadas || 0;
  colab.progresso = totalComp ? Math.round((respondidas / totalComp) * 100) : 0;

  // A mesma leitura acima também decide se existe avaliação para iniciar. Leitura
  // que falhou não afirma "cargo sem competências" (mandaria o gestor embora da home).
  const cargoSemCompetencias = !!mapeamento && totalComp === 0;

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

  // Competência foco da trilha da JORNADA ATUAL (Motor de Temporadas) + sys_config
  // da empresa — pré-buscados pela home consolidada quando `shared` vem preenchido.
  // `data_inicio` (em `HOME_TRILHA_COLS`): a home diz quando a jornada começa se a
  // semana 1 ainda não abriu.
  let trilhaAtiva: any;
  let cfg: any;
  if (shared?.trilha !== undefined && shared?.sysConfig !== undefined) {
    trilhaAtiva = shared.trilha;
    cfg = shared.sysConfig || {};
  } else {
    const [jornada, empCfgRes] = await Promise.all([
      jornadaDaHome(sb, colab, shared),
      sb.from('empresas')
        .select('sys_config')
        .eq('id', colab.empresa_id)
        .maybeSingle(),
    ]);
    trilhaAtiva = jornada.trilha;
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

  // `is_demo` vem na MESMA leitura da config: sem ela, a régua da degustação
  // pagaria uma consulta a mais por pageview de qualquer cliente real.
  let empresaIsDemo = shared?.empresaIsDemo;
  let cfg: any;
  if (shared?.sysConfig !== undefined) {
    cfg = shared.sysConfig || {};
  } else {
    const { data: empresa, error: erroEmpresa } = await sb.from('empresas')
      .select('sys_config, is_demo')
      .eq('id', colab.empresa_id)
      .maybeSingle();
    // Falha aqui deixa `is_demo` em aberto: a régua da degustação pergunta de
    // novo e, se falhar outra vez, registra a degradação.
    if (erroEmpresa) console.warn('[jornada] config da empresa indisponível:', erroEmpresa.message);
    cfg = ((empresa as any)?.sys_config as any) || {};
    if (empresaIsDemo === undefined && empresa) empresaIsDemo = (empresa as any).is_demo === true;
  }
  const empresaPerfilExternoFonte = cfg.perfil_externo_fonte ?? null;
  const usaPerfilExterno = !!empresaPerfilExternoFonte;
  const perfilComportamentalLiberado = isPerfilComportamentalLiberado(cfg);

  const fases = [];

  // Fase 1: Perfil (o Mapeamento Comportamental, DISC).
  // Empresas com fonte externa/proprietária não fazem DISC na Vertho:
  // a etapa não deve bloquear o avanço para a avaliação de competências.
  const temDISC = !!colab.perfil_dominante;
  const temPerfilExterno = !!colab.perfil_externo_dados;
  fases.push({
    fase: 1,
    titulo: 'Perfil',
    descricao: usaPerfilExterno
      ? 'Perfil comportamental conduzido pela empresa'
      : perfilComportamentalLiberado
        ? 'Perfil comportamental'
        : 'Aguardando liberação do perfil comportamental',
    status: (usaPerfilExterno || temDISC) ? 'completed' : 'pending',
    data: (temDISC || temPerfilExterno) ? null : null, // DISC date not stored separately
    usaPerfilExterno,
  });

  // Fase 2: Mapeamento de competências, pela régua do ASSESSMENT: o Top 5 do
  // cargo com o teto da degustação, e só resposta de competência desse Top 5
  // conta (`carregarProgressoMapeamento`). Falha de leitura lança.
  const [degustacao, mapeamento] = await Promise.all([
    colaboradorEmDegustacao(sb, colab, empresaIsDemo),
    shared?.mapeamento !== undefined
      ? Promise.resolve(shared.mapeamento)
      : carregarProgressoMapeamento(sb, colab, empresaIsDemo),
  ]);
  const totalComp = mapeamento.total;
  const respondidasCount = mapeamento.respondidas;

  const avaliacaoCompleta = totalComp > 0 && respondidasCount >= totalComp;
  const avaliacaoIniciada = respondidasCount > 0;
  fases.push({
    fase: 2,
    titulo: 'Mapeamento',
    descricao: `Competências mapeadas: ${respondidasCount}/${totalComp}`,
    status: avaliacaoCompleta ? 'completed' : avaliacaoIniciada ? 'current' : 'pending',
    data: null,
  });

  const retornoBase = {
    colaborador: colab,
    fases,
    empresaPerfilExternoFonte,
    temPerfilExterno,
    // PDF original existe mesmo antes da extração rodar — e é ele que a pessoa
    // reconhece. Sem isto a Fase 1 fica "concluída" e sem destino clicável.
    temPdfPerfilExterno: !!colab.perfil_externo_pdf_path,
    perfilComportamentalLiberado,
    degustacao,
  };

  // Na degustação a jornada acaba no resultado do mapeamento. PDI, temporada e
  // reavaliação não existem para o convidado: "bloqueada" prometeria que algo
  // as libera, e com a fase 2 concluída a 3 viraria "em curso" apontando para
  // um PDI que nunca será gerado.
  if (degustacao) {
    for (const [fase, titulo] of [[3, 'PDI'], [4, 'Desenvolvimento'], [5, 'Evolução']] as const) {
      fases.push({ fase, titulo, descricao: 'Fora da degustação', status: FASE_FORA_DA_DEGUSTACAO, data: null });
    }
    return retornoBase;
  }

  // Trilha da JORNADA ATUAL (necessária pra liberar Fase 3) — Motor de Temporadas.
  // Depois do ramo da degustação: o convidado não tem trilha e não paga a leitura.
  const jornadaAtual = await jornadaDaHome(sb, colab, shared);
  const trilha = jornadaAtual.trilha;

  const temPlano = trilha?.temporada_plano && Array.isArray(trilha.temporada_plano) && trilha.temporada_plano.length > 0;

  // Fase 3 — PDI. Ele nasce da avaliação completa e antecede a jornada; exigir
  // trilha aqui invertia o funil e escondia um PDI que já existia. O PDI de uma
  // jornada ANTERIOR não conta para a atual (nasceu antes do marco da participação).
  const { data: pdiMaisRecente, error: erroPdi } = await sb.from('relatorios')
    .select('id, gerado_em')
    .eq('colaborador_id', colab.id)
    .eq('empresa_id', colab.empresa_id)
    .eq('tipo', 'individual')
    .order('gerado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  // Falha de leitura não vira "sem PDI" (a jornada diria "Aguardando geração").
  if (erroPdi) throw new Error(`PDI: ${erroPdi.message}`);
  const pdi = pdiMaisRecente && artefatoDaJornadaAtual(pdiMaisRecente.gerado_em, jornadaAtual.janela) ? pdiMaisRecente : null;

  let pdiStatus, pdiDesc;
  if (pdi) {
    pdiStatus = 'completed';
    pdiDesc = 'Plano de Desenvolvimento Individual';
  } else if (!avaliacaoCompleta) {
    pdiStatus = 'pending';
    pdiDesc = 'Conclua o mapeamento para liberar seu PDI';
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

  // Fase 4: Desenvolvimento, as semanas da jornada (já carregada acima)
  let semanaAtual = 1;
  let progressoTrilha: Array<{ semana: number; status: string }> = [];
  if (temPlano) {
    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('semana, status').eq('trilha_id', trilha.id).order('semana');
    progressoTrilha = progresso || [];
    const concluidas = (progresso || []).filter(p => p.status === PROGRESSO.CONCLUIDO).length;
    semanaAtual = Math.min(duracaoDaTrilha(trilha), concluidas + 1);
  }

  const temporadaStatus = trilha?.status === TRILHA.CONCLUIDA ? 'completed'
    : (temPlano && trilha.status === TRILHA.ATIVA) ? 'current'
    : 'pending';

  fases.push({
    fase: 4,
    titulo: 'Desenvolvimento',
    descricao: temPlano
      ? `Semana ${semanaAtual} de ${duracaoDaTrilha(trilha)} · ${trilha.competencia_foco || ''}`
      : 'Aguardando a montagem da jornada',
    status: temporadaStatus,
    data: trilha?.criado_em || null,
    // A tela da jornada descreve esta fase por i18n, e o texto trazia "14
    // semanas" escrito à mão — numa jornada de 7 ele contradizia a própria
    // linha acima. O número viaja com a fase.
    totalSemanas: temPlano
      ? duracaoDaTrilha(trilha)
      : null,
  });

  // Fase 5, Reavaliação: é a AVALIAÇÃO FINAL da trilha (R-95, 03/10/2026).
  // Antes contava respostas com `rodada = 2`, que nenhum código grava: quem
  // fechava a avaliação final ficava em "4 de 5" para sempre. A medição de
  // evolução pós-capacitação é o Cenário B da trilha, e o sinal é a semana
  // dele concluída, a mesma régua da tela da temporada e do relatório. No
  // Personalizado SEM fechamento não há Cenário B: a trilha concluída é o fim
  // do programa e a fase conta como concluída (R-95, `reavaliacaoConcluida`).
  fases.push({
    fase: 5,
    titulo: 'Evolução',
    descricao: 'Medição da evolução na avaliação final',
    status: temPlano && reavaliacaoConcluida(trilha.temporada_plano, progressoTrilha, trilha.status) ? 'completed' : 'pending',
    data: null,
  });

  return retornoBase;
}

// ── KPIs da home (ciclo semanal) ───────────────────────────────────────────
// `jornadaR` pode ser o resultado da jornada OU a promise dele — a home
// consolidada passa a promise pra manter o paralelismo (a jornada só é
// aguardada no passo da fase, como antes acontecia dentro do loadHomeKpis).

export async function carregarHomeKpis(colab: any, jornadaR: Promise<any> | any, shared?: HomeSharedData): Promise<any> {
  try {
    const sb = createSupabaseAdmin();
    const agora = new Date();

    // ── Trilha da JORNADA ATUAL + progresso (base de quase tudo) ─────────
    const { trilha } = await jornadaDaHome(sb, colab, shared);

    const totalSemanas = duracaoDaTrilha(trilha);

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
    // Onboarding: a semana 1 é o Mapeamento (concluído, sem conteúdo nem
    // Evidências), e do dia em que a trilha nasce até a segunda em que a semana 2
    // abre o calendário aponta para ela. Não há pílula a anunciar nem prazo de
    // evidência a cobrar: os dois cards ficam de fora e o "próximo marco" diz
    // quando a semana 2 chega.
    const semanaAtualEhMapeamento = (Array.isArray(trilha?.temporada_plano) ? trilha.temporada_plano : [])
      .find((s: any) => Number(s?.semana) === semanaAtual)?.tipo === 'mapeamento';

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
    if (semanaAtual > 0 && !semanaAtualEhMapeamento) {
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
    if (semanaAtual > 0 && !semanaAtualEhMapeamento) {
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
      // Fase fora da degustação não é "a próxima": para o convidado, a última
      // fase que existe é a 2, e concluí-la é concluir a jornada dele.
      const fases = (jr?.fases || []).filter(f => f.status !== FASE_FORA_DA_DEGUSTACAO);
      if (!jr?.error && fases.length) {
        const proxima = fases.find(f => f.status !== 'completed');
        if (proxima) {
          faseAtual = { numero: proxima.fase, titulo: proxima.titulo, status: proxima.status, totalSemanas: proxima.totalSemanas ?? null };
        } else {
          // Tudo concluído
          const ultima = fases[fases.length - 1];
          faseAtual = { numero: ultima.fase, titulo: ultima.titulo, status: 'completed', concluida: true, totalSemanas: ultima.totalSemanas ?? null };
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
          label: ehFim ? 'Jornada conclui'
            : ehImpl ? 'Semana de aplicação'
            : 'Próximo conteúdo',
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
  // ⛔ Pulso é bloco OFF-LINE desde 31/08/2026 (lib/blocos-offline.ts).
  //
  // Corta ANTES da query, e não é economia de banco: este é exatamente o
  // caminho que produziu o card fantasma de 14/05 — 40 diretores de Macaé com
  // um "Pulso T0" pendente por 3 meses, vindo de um ciclo rascunho, porque o
  // filtro deixa `due_date` NULL passar e a home renderiza sem outra condição.
  // Com as telas em 404, um card que sobrasse aqui levaria a pessoa a uma
  // porta fechada — pior do que não mostrar nada.
  if (blocoEstaOffline('pulso')) return [];

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
      ? q.or(empresaOuGlobal(empresaId))
      : q.is('empresa_id', null);

    const { data, error } = await q;
    if (error) return [];
    return intercalarPorFormato(data || []);
  } catch (err) {
    console.error('[carregarCapacitacoes]', err);
    return [];
  }
}

/**
 * Alterna os formatos na vitrine, em vez de listar por data.
 *
 * A ordenação é `tipo_conteudo`, depois `created_at desc` — e conteúdo é gerado
 * em lote POR FORMATO. O resultado é que a pessoa abre a home e vê seis áudios
 * seguidos, não porque só exista áudio, mas porque o áudio foi o último lote a
 * rodar. `Medido: 02/09/2026` — a rede escolar tinha 6 textos, 6 cases e 6
 * áudios, e a primeira página mostrava só áudio.
 *
 * A ordem DENTRO de cada formato é preservada (core antes de complementar, mais
 * recente antes), então isto não reordena por relevância: só evita que um lote
 * ocupe a vitrine inteira.
 */
export function intercalarPorFormato<T extends { formato?: string | null }>(itens: T[]): T[] {
  const filas = new Map<string, T[]>();
  for (const item of itens) {
    const formato = String(item.formato || 'outro');
    if (!filas.has(formato)) filas.set(formato, []);
    filas.get(formato)!.push(item);
  }
  if (filas.size < 2) return itens;

  const ordem = [...filas.values()];
  const saida: T[] = [];
  while (saida.length < itens.length) {
    let avancou = false;
    for (const fila of ordem) {
      const proximo = fila.shift();
      if (proximo) { saida.push(proximo); avancou = true; }
    }
    // Guarda contra laço infinito se alguma fila mentir sobre o tamanho.
    if (!avancou) break;
  }
  return saida;
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
export async function carregarPanoramaRH(
  empresaId: string,
  opts: {
    colaboradorIds?: string[] | null;
    /**
     * Escopo de LEITURA de uma turma (`lib/turmas/escopo-leitura.ts`). Com ele, a população é
     * a da turma (quem está e quem já passou por ela) e a jornada de cada pessoa é a trilha DA
     * PARTICIPAÇÃO, não "qualquer trilha da pessoa": a Temporada 2 não herda a trilha ativa da
     * Turma 1 e a Turma 1 não some quando as pessoas seguem adiante. Perfil e mapeamento
     * continuam da PESSOA (o DISC acompanha quem muda de turma).
     */
    escopoTurma?: EscopoDeLeitura | null;
  } = {},
) {
  // `tenantDb` e não `createSupabaseAdmin`: os três números são de UMA empresa,
  // e o wrapper injeta o `empresa_id` em toda cadeia. `empresas` é a própria
  // linha do tenant (a chave é `id`, não `empresa_id`), então vai pelo `raw`.
  const tdb = tenantDb(empresaId);

  // Recorte por turma (mig 210). `null`/ausente = empresa inteira, que é como
  // esta função sempre se comportou. Quando vem lista, ela entra em TODA query
  // do painel. Meio painel recortado e meio não seria pior que nenhum recorte:
  // o operador leria "42% com perfil" ao lado de "38 em jornada" sem saber que
  // os dois numeradores falam de populações diferentes.
  //
  // `.in()` e não uma varredura filtrada em memória: os contadores continuam
  // sendo `count: 'exact'` no banco, sem o teto de 1.000 linhas do PostgREST
  // que transformaria tenant grande em amostra silenciosa. `Medido em 31/08`:
  // `.in()` com 3.000 uuids responde normalmente neste projeto.
  let ids = opts.colaboradorIds ?? null;
  const escopoTurma = opts.escopoTurma ?? null;
  // Com turma, a lista de pessoas é a da turma (interseção com a equipe, se vier os dois);
  // turma vazia = ninguém, nunca a empresa toda.
  if (escopoTurma) ids = ids ? ids.filter((id) => escopoTurma.participacaoPorColab.has(id)) : escopoTurma.colaboradorIds;
  // Contas da EQUIPE Vertho (`@vertho.ai`, fora as personas `.demo@`): a regra de
  // `lib/internal-emails.ts` as tira de TODA estatística agregada, e este painel
  // nunca aplicou. Medido 06/10/2026 na 4Life: a tela de Andamento dizia 27
  // pessoas com 3 delas da equipe (24 reais) e 18 com perfil onde eram 17.
  // O corte é por ID (`not.in`), não por `.or` no e-mail: e-mail nulo faz o `.or`
  // devolver NULL e some com a pessoa em silêncio. Preenchido depois de saber se
  // o tenant é demo (o elenco da demo já é curado por `recortarElencoDemo`).
  const internos: string[] = [];
  const recortar = <T>(query: T, coluna: string): T => {
    let q: any = query;
    if (ids) q = q.in(coluna, ids);
    if (internos.length) q = q.not(coluna, 'in', `(${internos.join(',')})`);
    return q as T;
  };

  // A empresa vem antes das contagens porque a régua de "tem perfil" depende
  // dela: quem usa fonte externa (OPQ32, Hogan) não faz DISC, e ali "sem perfil"
  // é "sem o PDF extraído".
  const empresaRes = await tdb.raw.from('empresas')
    .select('nome, sys_config, is_demo').eq('id', empresaId).maybeSingle();
  const fonteExterna = (empresaRes.data?.sys_config as any)?.perfil_externo_fonte ?? null;
  let elencoErro: any = null;
  if (empresaRes.data?.is_demo) {
    const elenco = await lerPaginas((inicio, fim) => tdb.from('colaboradores').select('id,email').order('id').range(inicio, fim));
    elencoErro = elenco.error;
    const permitidos = recortarElencoDemo<{ id: string; email: string }>(elenco.data || [], true).map(p => p.id);
    const turma = ids;
    ids = turma ? permitidos.filter(id => turma.includes(id)) : permitidos;
  }

  // Só tenant REAL: na demo o elenco inclui `convidado.*@vertho.ai`, que é
  // conteúdo do tenant e não equipe.
  let internosErro: any = null;
  if (!empresaRes.data?.is_demo) {
    for (const dominio of INTERNAL_EMAIL_DOMAINS) {
      const lidos = await lerPaginas((inicio, fim) => tdb.from('colaboradores')
        .select('id,email')
        .ilike('email', `%${escaparLike(dominio)}`)
        .order('id')
        .range(inicio, fim));
      internosErro = internosErro || lidos.error;
      internos.push(...(lidos.data || []).filter((c: any) => isInternalEmail(c.email)).map((c: any) => c.id as string));
    }
  }

  // Sem turma, a jornada é "qualquer trilha da pessoa" (como sempre foi). Com turma, as trilhas
  // vêm de uma leitura única e cada pessoa é medida na trilha da PARTICIPAÇÃO (abaixo).
  const semConsulta = { data: [] as any[], error: null as any };
  const [pessoasRes, participantesRes, comPerfilRes, trilhasPessoaRes, encerradasPessoaRes, assessRes, cargosRes, trilhasTurmaRes] = await Promise.all([
    recortar(tdb.from('colaboradores')
      .select('id', { count: 'exact', head: true })
      .neq('role', 'rh'), 'id'),
    recortar(tdb.from('colaboradores')
      .select('id, cargo')
      .neq('role', 'rh'), 'id'),
    // 🔑 `perfil_dominante`, não `disc_resultados`. É a MESMA coluna que o resto
    // do app usa para decidir se a pessoa tem perfil — o gate da home
    // (`precisaMapeamentoDISC`), o alerta do gestor e o mapa de perfis. Medido em
    // 25/08 no tenant `macae`: 144 pessoas têm `perfil_dominante` e só 105 têm
    // `disc_resultados` (as 39 vieram por importação, que carimba a letra e não
    // grava o JSON). Contar pelo JSON fazia este card dizer 105 enquanto a tela
    // de Equipe tratava 144 como mapeadas — dois números para a mesma pergunta.
    fonteExterna
      ? recortar(tdb.from('colaboradores')
          .select('id', { count: 'exact', head: true })
          .neq('role', 'rh')
          .not('perfil_externo_dados', 'is', null), 'id')
      : recortar(tdb.from('colaboradores')
          .select('id', { count: 'exact', head: true })
          .neq('role', 'rh')
          .or('perfil_dominante.not.is.null,perfil_externo_dados.not.is.null'), 'id'),
    escopoTurma ? semConsulta : recortar(tdb.from('trilhas')
      .select('id, colaborador_id, data_inicio, temporada_plano, programa_modo, programa_config')
      .eq('status', TRILHA.ATIVA), 'colaborador_id'),
    // Jornadas ENCERRADAS: é o que libera a tela de evolução. O veredito
    // (confirmada · parcial · estagnação · regressão) nasce no fechamento, então
    // antes da primeira conclusão aquela tela é seis KPIs zerados — e um atalho
    // para ela é um convite para o vazio.
    // A ENCERRADA pela operação (TRILHA.ENCERRADA, 09/10/2026) entra só para contar
    // como jornada INICIADA: não é "em jornada" nem "concluiu".
    escopoTurma ? semConsulta : lerPaginas((inicio, fim) => recortar(tdb.from('trilhas')
      .select('colaborador_id, status').in('status', [TRILHA.CONCLUIDA, TRILHA.ENCERRADA]).order('id').range(inicio, fim), 'colaborador_id')),
    // O Top 5 exige todas as páginas: as demos com simuladores passam de
    // mil descritores. Truncar a consulta transforma completos em pendentes.
    lerPaginas((inicio, fim) => recortar(tdb.from('descriptor_assessments').select('colaborador_id, competencia').order('id').range(inicio, fim), 'colaborador_id')),
    tdb.from('cargos_empresa').select('nome, top5_workshop'),
    escopoTurma
      ? lerPaginas((inicio, fim) => recortar(tdb.from('trilhas')
        .select('id, colaborador_id, data_inicio, temporada_plano, programa_modo, programa_config, status, turma_membro_id, criado_em')
        .in('status', [TRILHA.ATIVA, TRILHA.CONCLUIDA, TRILHA.ENCERRADA]).order('id').range(inicio, fim), 'colaborador_id'))
      : semConsulta,
  ]);

  // Com turma: cada pessoa na trilha da participação dela; ativa vira "em jornada", concluída vira "encerrada".
  let trilhasRes: { data: any[]; error: any } = trilhasPessoaRes as any;
  let encerradasRes: { data: any[]; error: any } = {
    data: ((encerradasPessoaRes as any).data || []).filter((t: any) => t.status !== TRILHA.ENCERRADA),
    error: (encerradasPessoaRes as any).error,
  };
  // Encerradas pela operação antes do fim: só entram em "jornadas iniciadas".
  let encerradasPelaOperacao: any[] = ((encerradasPessoaRes as any).data || []).filter((t: any) => t.status === TRILHA.ENCERRADA);
  if (escopoTurma) {
    const porPessoa = new Map<string, any[]>();
    for (const t of (trilhasTurmaRes.data || []) as any[]) {
      const lista = porPessoa.get(t.colaborador_id) || [];
      lista.push(t);
      porPessoa.set(t.colaborador_id, lista);
    }
    const ativas: any[] = [];
    const concluidas: any[] = [];
    const fechadas: any[] = [];
    for (const [colab, p] of escopoTurma.participacaoPorColab) {
      const alvo = trilhaDaParticipacao(p.id, p.janela, porPessoa.get(colab) || []);
      if (!alvo) continue;
      if (alvo.status === TRILHA.ATIVA) ativas.push(alvo);
      else if (alvo.status === TRILHA.CONCLUIDA) concluidas.push(alvo);
      else if (alvo.status === TRILHA.ENCERRADA) fechadas.push(alvo);
    }
    trilhasRes = { data: ativas, error: trilhasTurmaRes.error };
    encerradasRes = { data: concluidas, error: null };   // uma leitura só: o erro dela vive em `trilhasRes`
    encerradasPelaOperacao = fechadas;
  }

  const erro = empresaRes.error || elencoErro || internosErro || pessoasRes.error || participantesRes.error || comPerfilRes.error || trilhasRes.error
    || assessRes.error || cargosRes.error || encerradasRes.error;
  if (erro) console.error('[panorama-rh] contagens falharam:', erro.message);

  const trilhas = trilhasRes.data || [];
  const emJornada = new Set(trilhas.map((t: any) => t.colaborador_id)).size;
  const comMapeamento = colaboradoresComMapeamentoCompleto(
    participantesRes.data || [],
    cargosRes.data || [],
    assessRes.data || [],
  ).size;
  const progressoMapeamento = distribuicaoMapeamento(progressoMapeamentoPorPessoa(
    participantesRes.data || [],
    cargosRes.data || [],
    assessRes.data || [],
  ));

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
      totalSemanas: duracaoDaTrilha(t),
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
    progressoMapeamento,
    emJornada,
    emDia,
    atrasadas,
    jornadasEncerradas: new Set((encerradasRes.data || []).map(t => t.colaborador_id)).size,
    jornadasIniciadas: new Set([...trilhas, ...(encerradasRes.data || []), ...encerradasPelaOperacao].map(t => t.colaborador_id)).size,
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
 *  · DNA e PO  → arquivo no bucket PRIVADO `relatorios-pdf/{empresaId}/{dna,perfil-org}/{ts}.pdf`
 *                (R-74, 03/10/2026) ou, até a migração, na pasta antiga do bucket
 *                público `conteudos/final/{dna,perfil-org}/{empresaId}-{ts}.pdf`.
 *                Sem índice em tabela: lista-se a pasta da empresa, e na antiga
 *                filtra-se pelo PREFIXO do tenant (`search` do Storage é
 *                substring). A régua mora em `listarArtefatosRelatorio`.
 *
 * O link devolvido NÃO é do Storage: é a rota `/api/relatorios/organizacional`,
 * que confere a sessão (RH da empresa ou platform admin) no clique e só então
 * redireciona para um link assinado de 5 minutos. A tela promete "Leitura
 * segura"; com a URL pública permanente isso não era verdade.
 *
 * `Medido em 25/08`: macae tem 1 DNA e 1 PO (nenhum RH); ibipeba tem os três.
 */
export async function carregarRelatoriosGerenciais(empresaId: string) {
  const tdb = tenantDb(empresaId);

  const maisRecenteNoStorage = async (tipo: 'dna' | 'perfil-org') => {
    const { artefatos, erros } = await listarArtefatosRelatorio(tdb.storage, empresaId, tipo, '.pdf');
    if (erros.length) console.error(`[relatorios-gerenciais] list ${tipo}:`, erros.join(' | '));
    // O nome carrega o timestamp da geração; ordenar por ele evita depender de
    // `created_at`, que o Storage nem sempre devolve preenchido. Só o nome que
    // é SÓ timestamp (`rotulo === null`) é um documento da empresa.
    const ultimo = artefatos.find((a) => a.rotulo === null);
    if (!ultimo) return null;
    return {
      url: hrefRelatorio(ultimo.caminho),
      urlDownload: hrefRelatorio(ultimo.caminho, { download: true }),
      em: Number.isFinite(ultimo.ts) ? new Date(ultimo.ts).toISOString() : null,
    };
  };

  const [rhRes, dna, perfilOrg] = await Promise.all([
    tdb.from('relatorios')
      .select('id, gerado_em')
      .eq('tipo', 'rh')
      .order('gerado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    maisRecenteNoStorage('dna'),
    maisRecenteNoStorage('perfil-org'),
  ]);

  if (rhRes.error) console.error('[relatorios-gerenciais] relatorio de RH:', rhRes.error.message);

  return {
    rh: rhRes.data ? { url: `/api/relatorios/pdf?id=${rhRes.data.id}`, em: rhRes.data.gerado_em } : null,
    perfilOrg,
    dna,
  };
}
