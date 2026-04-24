'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, getDashboardView } from '@/lib/authz';

/**
 * Carrega dados do dashboard usando o papel explícito (coluna `role`).
 * Nunca infere papel por regex em `cargo`.
 */
export async function loadDashboardData() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Colaborador nao encontrado para este e-mail' };

  const sb = createSupabaseAdmin();
  const colab: any = ctx.colaborador;
  const view = getDashboardView(ctx);

  // Progresso individual
  const { count: totalComp } = await sb.from('competencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', colab.empresa_id);

  // Qualquer resposta conta como "iniciou avaliação" (independente de IA4 ter rodado)
  const { count: respondidas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id);

  // Avaliadas = com nivel_ia4 (usado por fluxos a jusante)
  const { count: avaliadas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .not('nivel_ia4', 'is', null);

  colab.totalComp = totalComp || 0;
  colab.respondidas = respondidas || 0;
  colab.avaliadas = avaliadas || 0;
  colab.progresso = totalComp ? Math.round((respondidas / totalComp) * 100) : 0;

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

    const { count: totalColabs } = await colabQuery;

    const { count: totalRespostas } = await sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', colab.empresa_id)
      .not('nivel_ia4', 'is', null);

    teamData = { totalColabs: totalColabs || 0, totalRespostas: totalRespostas || 0 };
  }

  // Competência foco da trilha ativa (Motor de Temporadas)
  const { data: trilhaAtiva } = await sb.from('trilhas')
    .select('competencia_foco, numero_temporada, status, temporada_plano')
    .eq('colaborador_id', colab.id)
    .order('criado_em', { ascending: false })
    .limit(1).maybeSingle();
  const competenciaFoco = trilhaAtiva?.competencia_foco || null;
  const temporadaPronta = !!(trilhaAtiva?.temporada_plano && Array.isArray(trilhaAtiva.temporada_plano) && trilhaAtiva.temporada_plano.length > 0 && trilhaAtiva.status !== 'arquivada');

  return {
    colaborador: colab,
    role: ctx.role,
    view,
    isPlatformAdmin: ctx.isPlatformAdmin,
    competenciaFoco,
    temporada: trilhaAtiva,
    temporadaPronta,
    teamData,
  };
}

export async function loadAvatarData() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return null;
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('nome_completo, foto_url')
    .eq('email', email)
    .maybeSingle();
  return data || { nome_completo: email, foto_url: null };
}
