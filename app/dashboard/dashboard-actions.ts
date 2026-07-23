'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext, getDashboardView, findColabByEmail } from '@/lib/authz';
import { isMapeamentoCenariosLiberado, isPerfilComportamentalLiberado } from '@/lib/votacao/status';

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

  const progressoQueries = [
    sb.from('competencias')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', colab.empresa_id),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id),
    sb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', colab.id)
      .not('nivel_ia4', 'is', null),
  ] as const;

  const [
    { count: totalComp },
    { count: respondidas },
    { count: avaliadas },
  ] = await Promise.all(progressoQueries);

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

    const [{ count: totalColabs }, { count: totalRespostas }] = await Promise.all([
      colabQuery,
      sb.from('respostas')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', colab.empresa_id)
        .not('nivel_ia4', 'is', null),
    ]);

    teamData = { totalColabs: totalColabs || 0, totalRespostas: totalRespostas || 0 };
  }

  // Competência foco da trilha ativa (Motor de Temporadas)
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

  const trilhaAtiva = trilhaAtivaRes.data;
  const competenciaFoco = trilhaAtiva?.competencia_foco || null;
  const temporadaPronta = !!(trilhaAtiva?.temporada_plano && Array.isArray(trilhaAtiva.temporada_plano) && trilhaAtiva.temporada_plano.length > 0 && trilhaAtiva.status !== 'arquivada');

  // Fonte externa de perfil (OPQ32, Hogan, etc.) — quando empresa tem
  // configurada, o colaborador não vai fazer mapeamento DISC nativo.
  const empCfg = empCfgRes.data;
  const cfg = (empCfg?.sys_config as any) || {};
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
  };
}

export async function loadAvatarData(emailHint?: string) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const emailSessao = await getAuthenticatedEmailFromAction();
    if (!emailSessao) return null;

    let email = emailSessao;
    // Gate de POSSE (auditoria 23/07, grupo C): o hint vinha do client — qualquer
    // autenticado consultava nome/foto/avatar de qualquer pessoa. Fora do self,
    // só com posse (gestor da área, RH/tutor do tenant, platform admin).
    if (emailHint && emailHint.trim().toLowerCase() !== emailSessao) {
      const { canViewColabJourney } = await import('@/lib/authz');
      const ctx = await getUserContext(emailSessao);
      const alvo = await findColabByEmail(emailHint, 'id, empresa_id, area_depto');
      if (!canViewColabJourney(ctx, alvo)) return null;
      email = emailHint.trim().toLowerCase();
    }

    const data = await findColabByEmail(email, 'nome_completo, foto_url, avatar_preset');
    return data || { nome_completo: email, foto_url: null, avatar_preset: null };
  } catch (err) {
    console.error('[loadAvatarData]', err);
    return null;
  }
}
