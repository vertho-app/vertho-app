'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';

// ── Colaborador: carregar competências para votar ─────────────────────────

export async function loadCompetenciasParaVotar() {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  const colab = await findColabByEmail(email, 'id, nome_completo, cargo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const sb = createSupabaseAdmin();
  const tdb = tenantDb(colab.empresa_id);

  // Verificar se votação está ativa
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', colab.empresa_id).maybeSingle();
  const votacaoAtiva = empresa?.sys_config?.votacao_ativa === true;
  if (!votacaoAtiva) return { error: 'Votação não está aberta no momento' };

  // Buscar TODAS as competências do cargo (não só Top 10)
  const { data: comps } = await tdb.from('competencias')
    .select('id, nome, cod_comp, descricao, pilar')
    .eq('cargo', colab.cargo);

  // Deduplicar por cod_comp (descritores geram múltiplas linhas)
  const uniqueMap: Record<string, any> = {};
  (comps || []).forEach(c => {
    const key = c.cod_comp || c.nome;
    if (!uniqueMap[key]) uniqueMap[key] = { nome: c.nome, cod_comp: c.cod_comp, descricao: c.descricao, pilar: c.pilar };
  });
  const competencias = Object.values(uniqueMap).sort((a: any, b: any) => a.nome.localeCompare(b.nome));

  // Buscar voto existente
  const { data: votoExist } = await (tdb.from('votacao_competencias') as any)
    .select('competencias_escolhidas, sugestao_nova, votado_em')
    .eq('colaborador_id', colab.id)
    .maybeSingle();

  return {
    colaborador: { id: colab.id, nome: colab.nome_completo, cargo: colab.cargo },
    competencias,
    votoExistente: votoExist || null,
  };
}

// ── Colaborador: salvar voto ──────────────────────────────────────────────

export async function salvarVoto(competencias: string[], sugestaoNova?: string) {
  const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
  const email = await getAuthenticatedEmailFromAction();
  if (!email) return { error: 'Não autenticado' };

  if (!Array.isArray(competencias) || competencias.length !== 5) {
    return { error: 'Selecione exatamente 5 competências' };
  }

  const colab = await findColabByEmail(email, 'id, cargo, empresa_id');
  if (!colab) return { error: 'Colaborador não encontrado' };

  const tdb = tenantDb(colab.empresa_id);

  const { error } = await (tdb.from('votacao_competencias') as any).upsert({
    colaborador_id: colab.id,
    cargo: colab.cargo,
    competencias_escolhidas: competencias,
    sugestao_nova: sugestaoNova?.trim() || null,
    votado_em: new Date().toISOString(),
  }, { onConflict: 'empresa_id,colaborador_id' });

  if (error) return { error: error.message };
  return { success: true, message: 'Voto registrado com sucesso!' };
}

// ── Admin: abrir/fechar votação ───────────────────────────────────────────

export async function toggleVotacao(empresaId: string, ativa: boolean) {
  const { requireAdminAction } = await import('@/lib/auth/action-context');
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();

  const config = empresa?.sys_config || {};
  config.votacao_ativa = ativa;

  const { error } = await sb.from('empresas')
    .update({ sys_config: config }).eq('id', empresaId);

  if (error) return { success: false, error: error.message };
  return { success: true, message: ativa ? 'Votação aberta' : 'Votação fechada' };
}

// ── Admin: carregar resultados da votação ─────────────────────────────────

export async function loadResultadosVotacao(empresaId: string) {
  const { requireAdminAction } = await import('@/lib/auth/action-context');
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const tdb = tenantDb(empresaId);

  // Verificar status
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();
  const votacaoAtiva = empresa?.sys_config?.votacao_ativa === true;

  // Todos os colaboradores
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, cargo');

  // Todos os votos
  const { data: votos } = await (tdb.from('votacao_competencias') as any)
    .select('colaborador_id, cargo, competencias_escolhidas, sugestao_nova, votado_em');

  const votosMap = new Map((votos || []).map((v: any) => [v.colaborador_id, v]));

  // Agrupar por cargo
  const porCargo: Record<string, any> = {};
  for (const c of (colabs || [])) {
    if (!c.cargo) continue;
    if (!porCargo[c.cargo]) porCargo[c.cargo] = { total: 0, votaram: 0, faltam: [], ranking: {}, sugestoes: [] };
    const grupo = porCargo[c.cargo];
    grupo.total++;

    const voto: any = votosMap.get(c.id);
    if (voto) {
      grupo.votaram++;
      const escolhidas = Array.isArray(voto.competencias_escolhidas) ? voto.competencias_escolhidas : [];
      escolhidas.forEach((comp: string, idx: number) => {
        if (!grupo.ranking[comp]) grupo.ranking[comp] = { votos: 0, pontos: 0 };
        grupo.ranking[comp].votos++;
        grupo.ranking[comp].pontos += (5 - idx); // 1o lugar = 5 pts, 5o = 1 pt
      });
      if (voto.sugestao_nova) grupo.sugestoes.push({ nome: c.nome_completo, sugestao: voto.sugestao_nova });
    } else {
      grupo.faltam.push(c.nome_completo);
    }
  }

  // Ordenar rankings por pontos
  const resultado: Record<string, any> = {};
  for (const [cargo, dados] of Object.entries(porCargo)) {
    const d = dados as any;
    const rankingArr = Object.entries(d.ranking)
      .map(([nome, stats]: [string, any]) => ({ nome, votos: stats.votos, pontos: stats.pontos }))
      .sort((a, b) => b.pontos - a.pontos);

    resultado[cargo] = {
      total: d.total,
      votaram: d.votaram,
      faltam: d.faltam,
      ranking: rankingArr,
      sugestoes: d.sugestoes,
    };
  }

  return { votacaoAtiva, resultado };
}

// ── Admin: aprovar Top 5 da votação ───────────────────────────────────────

export async function aprovarTop5Votacao(empresaId: string, cargo: string, top5: string[]) {
  const { requireAdminAction } = await import('@/lib/auth/action-context');
  await requireAdminAction();

  if (!Array.isArray(top5) || top5.length !== 5) return { success: false, error: 'Selecione exatamente 5' };

  const tdb = tenantDb(empresaId);
  const { error } = await tdb.from('cargos_empresa')
    .update({ top5_workshop: top5 })
    .eq('nome', cargo);

  if (error) return { success: false, error: error.message };
  return { success: true, message: `Top 5 aprovado para ${cargo}` };
}
