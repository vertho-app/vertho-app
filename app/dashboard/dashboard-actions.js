'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, getDashboardView } from '@/lib/authz';

/**
 * Carrega dados do dashboard usando o papel explícito (coluna `role`).
 * Nunca infere papel por regex em `cargo`.
 */
export async function loadDashboardData(email) {
  if (!email) return { error: 'Nao autenticado' };

  const ctx = await getUserContext(email);
  if (!ctx?.colaborador) return { error: 'Colaborador nao encontrado para este e-mail' };

  const sb = createSupabaseAdmin();
  const colab = ctx.colaborador;
  const view = getDashboardView(ctx);

  // Progresso individual
  const { count: totalComp } = await sb.from('competencias')
    .select('id', { count: 'exact', head: true })
    .eq('empresa_id', colab.empresa_id);

  const { count: respondidas } = await sb.from('respostas')
    .select('id', { count: 'exact', head: true })
    .eq('colaborador_id', colab.id)
    .not('nivel_ia4', 'is', null);

  colab.totalComp = totalComp || 0;
  colab.respondidas = respondidas || 0;
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

  return {
    colaborador: colab,
    role: ctx.role,
    view,
    isPlatformAdmin: ctx.isPlatformAdmin,
    teamData,
  };
}
