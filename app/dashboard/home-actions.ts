'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, findColabByEmail } from '@/lib/authz';
import {
  carregarDashboardData,
  carregarJornada,
  carregarHomeKpis,
  carregarUltimosVideos,
  carregarPulsosPendentes,
  carregarVotacaoStatus,
  carregarCapacitacoes,
  carregarPanoramaRH,
  carregarRelatoriosGerenciais,
  JORNADA_COLAB_COLS,
  type HomeSharedData,
} from '@/lib/home/loaders';
import { carregarContextoTurma } from '@/lib/turmas';
import { getDashboardView } from '@/lib/authz';
import { findReadyPersonalizedVideo, personalizedGreetingCopy } from '@/lib/video/personalized-ready';

/**
 * Carregamento CONSOLIDADO da home do dashboard.
 *
 * Antes: o page.tsx disparava 4 server actions em paralelo + 1 sequencial +
 * 1 fetch de API route, cada um refazendo a cadeia de auth completa
 * (auth.getUser → resolve tenant → colaboradores → platform_admins) — 6× por
 * pageview. Aqui: UMA cadeia de auth, uma pré-busca compartilhada (trilha
 * latest, sys_config e count de respostas eram consultados 2-3×) e os loaders
 * de lib/home em paralelo.
 *
 * Resiliência por seção: cada loader roda isolado (Promise.allSettled) e uma
 * falha derruba só a própria seção — fallbacks iguais aos que a home já
 * tolerava ({ error }, { items: [] }, [], null).
 */
export async function loadHomeData() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Colaborador nao encontrado para este e-mail' };

  const colab = ctx.colaborador as any;
  // A jornada precisa de colunas fora do default do authz (perfil_externo_dados)
  const colabJornada = (await findColabByEmail(email, JORNADA_COLAB_COLS)) || colab;

  const sb = createSupabaseAdmin();

  // Pré-busca compartilhada — superset das colunas que dashboard, KPIs e
  // jornada consultavam separadamente na trilha latest.
  const [trilhaRes, empCfgRes, respRes] = await Promise.all([
    sb.from('trilhas')
      // `data_inicio` é o que `carregarHomeKpis` usa para saber em que semana a
      // pessoa está (via week-gating). Sem ela no shared, os cards de pílula,
      // evidência e próximo marco não têm janela e não aparecem.
      .select('id, cursos, competencia_foco, numero_temporada, status, temporada_plano, criado_em, data_inicio')
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id)
      .order('criado_em', { ascending: false })
      .limit(1).maybeSingle(),
    sb.from('empresas')
      .select('sys_config')
      .eq('id', colab.empresa_id)
      .maybeSingle(),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .eq('empresa_id', colab.empresa_id),
  ]);
  // `sysConfig` do shared é a config EFETIVA (empresa → turma → participação),
  // não a da empresa crua: todos os loaders que decidem etapa (votação, perfil,
  // assessment) herdam o override da turma por este ponto único. Sem turma, o
  // resolvedor devolve a config da empresa inalterada — compatibilidade total.
  const ctxTurma = await carregarContextoTurma(
    sb, colab.empresa_id, colab.id, (empCfgRes.data?.sys_config as any) || {},
  );
  const shared: HomeSharedData = {
    trilha: trilhaRes.data ?? null,
    sysConfig: ctxTurma.config,
    respostasCount: respRes.count ?? 0,
  };

  // O RH é ADMIN da empresa, não participante: a home dele é o panorama do
  // tenant. Os cinco loaders de jornada (KPIs, vídeos, pulsos, votação,
  // capacitação) alimentam blocos que a home do RH não desenha — rodá-los seria
  // pagar seis consultas por pageview para jogar fora. Ver `carregarPanoramaRH`.
  if (getDashboardView(ctx) === 'rh') {
    const [dashboardRH, panoramaRH, relatoriosRH] = await Promise.allSettled([
      carregarDashboardData(ctx, shared),
      carregarPanoramaRH(colab.empresa_id),
      carregarRelatoriosGerenciais(colab.empresa_id),
    ]);
    return {
      dashboard: dashboardRH.status === 'fulfilled' ? dashboardRH.value : { error: 'Erro ao carregar dashboard' },
      panoramaRH: panoramaRH.status === 'fulfilled' ? panoramaRH.value : null,
      relatoriosRH: relatoriosRH.status === 'fulfilled' ? relatoriosRH.value : null,
      kpis: null,
      ultimosVideos: { items: [] as any[] },
      pulsos: [] as any[],
      votacao: null,
      capacitacoes: [] as any[],
    };
  }

  const dashboardP = carregarDashboardData(ctx, shared);
  const jornadaP = carregarJornada(colabJornada, shared);

  async function carregarCapacitacoesPersonalizadas(competencia: string | null) {
    const items = await carregarCapacitacoes(colab.empresa_id, competencia, 12);
    const greeting = personalizedGreetingCopy(colab.nome_completo);

    return Promise.all(items.map(async (item: any) => {
      if (item.formato !== 'video' || !item.modulo_base_id) return item;
      const personalized = await findReadyPersonalizedVideo(sb, {
        empresaId: colab.empresa_id,
        colaboradorId: colab.id,
        cargo: colab.cargo,
        perfilDominante: colab.perfil_dominante,
        moduloBaseId: item.modulo_base_id,
      });
      if (!personalized) return item;
      return {
        ...item,
        titulo: greeting.title,
        descricao: greeting.description,
        bunny_video_id: personalized.bunnyVideoId,
        video_personalizado: true,
      };
    }));
  }

  const [dashboardR, kpisR, videosR, pulsosR, votacaoR, capacR] = await Promise.allSettled([
    dashboardP,
    // KPIs aguarda a jornada internamente (só no passo da fase) — paralelo
    carregarHomeKpis(colabJornada, jornadaP, shared),
    carregarUltimosVideos(colab.id, 3),
    carregarPulsosPendentes(colab.id),
    carregarVotacaoStatus(colab, shared),
    // Capacitações depende da competência foco (vem da trilha, via seção
    // dashboard) — encadeado na promise, sem roundtrip extra do client.
    dashboardP.then(d => carregarCapacitacoesPersonalizadas(d?.competenciaFoco ?? null)),
  ]);

  const val = (r: PromiseSettledResult<any>, fallback: any): any =>
    r.status === 'fulfilled' ? r.value : fallback;

  return {
    dashboard: val(dashboardR, { error: 'Erro ao carregar dashboard' }),
    panoramaRH: null,
    relatoriosRH: null,
    kpis: val(kpisR, { error: 'Erro ao carregar KPIs' }),
    ultimosVideos: val(videosR, { items: [] as any[] }),
    pulsos: val(pulsosR, [] as any[]),
    votacao: val(votacaoR, null),
    capacitacoes: val(capacR, [] as any[]),
  };
}
