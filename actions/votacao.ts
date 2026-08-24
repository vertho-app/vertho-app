'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { isMapeamentoCenariosLiberado, isPerfilComportamentalLiberado } from '@/lib/votacao/status';
import { requireAdminSupabase, requireEmpresaSupabaseStrict } from '@/lib/admin-supabase';
import { carregarVotacaoStatus } from '@/lib/home/loaders';

// Heurística leve pra classificar device a partir do user-agent.
// Não tenta cobrir 100% dos casos — só os principais. Bots vão pra 'bot'.
function detectDeviceType(ua: string | null): 'mobile' | 'tablet' | 'desktop' | 'bot' {
  if (!ua) return 'desktop';
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|googlebot|bingbot|yandex|baiduspider/.test(s)) return 'bot';
  if (/ipad|tablet|kindle|playbook|silk/.test(s)) return 'tablet';
  if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini|mobile/.test(s)) return 'mobile';
  return 'desktop';
}

// SHA-256 truncado em 16 chars pra distinguir devices sem armazenar IP raw.
// Salt fixo por ambiente seria ideal, mas pra propósito de "veio do mesmo
// IP?" o truncado suficiente.
function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

async function captureRequestMetadata() {
  try {
    const h = await headers();
    const userAgent = h.get('user-agent') || null;
    // x-forwarded-for em Vercel: "client_ip, proxy1, proxy2" — pega o primeiro
    const fwd = h.get('x-forwarded-for') || '';
    const ip = fwd.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    return {
      device_type: detectDeviceType(userAgent),
      user_agent: userAgent ? userAgent.slice(0, 500) : null,  // limite defensivo
      ip_hash: hashIp(ip),
    };
  } catch {
    return { device_type: null, user_agent: null, ip_hash: null };
  }
}

// ── Check rápido: votação aberta? já votou? ──────────────────────────────

export async function checkVotacaoStatus() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return null;

    const colab = await findColabByEmail(email, 'id, empresa_id');
    if (!colab) return null;

    return await carregarVotacaoStatus(colab);
  } catch {
    return null;
  }
}

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

  // Buscar TODAS as competências da empresa e filtrar por cargo com normalização
  // (case-insensitive + sem acentos). Match exato falha quando a IA cadastra
  // "Coordenação Pedagógica" e o colab tem "coordenacao pedagogica".
  const norm = (s: string | null | undefined) =>
    (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const cargoColabN = norm(colab.cargo);

  const { data: compsRaw } = await tdb.from('competencias')
    .select('id, nome, cod_comp, descricao, pilar, cargo')
    .not('cargo', 'is', null);

  const comps = (compsRaw || []).filter((c: any) => norm(c.cargo) === cargoColabN);

  // Deduplicar por cod_comp (descritores geram múltiplas linhas)
  const uniqueMap: Record<string, any> = {};
  comps.forEach((c: any) => {
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
  const meta = await captureRequestMetadata();

  const { error } = await (tdb.from('votacao_competencias') as any).upsert({
    colaborador_id: colab.id,
    cargo: colab.cargo,
    competencias_escolhidas: competencias,
    sugestao_nova: sugestaoNova?.trim() || null,
    votado_em: new Date().toISOString(),
    device_type: meta.device_type,
    user_agent: meta.user_agent,
    ip_hash: meta.ip_hash,
  }, { onConflict: 'empresa_id,colaborador_id' });

  if (error) return { error: error.message };
  return { success: true, message: 'Voto registrado com sucesso!' };
}

// ── Admin: abrir/fechar votação ───────────────────────────────────────────

export async function toggleVotacao(empresaId: string, ativa: boolean) {
  const sb = await requireEmpresaSupabaseStrict(empresaId, 'settings.company.manage', 'votacao.toggle');
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();

  const config = empresa?.sys_config || {};
  config.votacao_ativa = ativa;
  if (config.perfil_externo_fonte) {
    // Perfil externo (OPQ32/Hogan): o perfil nativo fica bloqueado sempre e NÃO
    // é etapa do fluxo. Só abrir a votação reinicia o mapeamento de cenários —
    // fechar não pode apagar uma liberação que o admin acabou de fazer.
    if (ativa) config.mapeamento_cenarios_liberado = false;
  } else if (ativa || config.perfil_comportamental_liberado !== true) {
    config.perfil_comportamental_liberado = false;
    config.mapeamento_cenarios_liberado = false;
  }

  const { error } = await sb.from('empresas')
    .update({ sys_config: config }).eq('id', empresaId);

  if (error) return { success: false, error: error.message };
  return { success: true, message: ativa ? 'Votação aberta' : 'Votação fechada' };
}

export async function togglePerfilComportamental(empresaId: string, liberado: boolean) {
  const sb = await requireEmpresaSupabaseStrict(empresaId, 'settings.company.manage', 'votacao.perfil_comportamental');
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();

  const config = empresa?.sys_config || {};
  if (liberado && config.votacao_ativa === true) {
    return { success: false, error: 'Feche a votação antes de liberar o perfil comportamental.' };
  }

  config.perfil_comportamental_liberado = liberado;
  // Cascata só vale onde o perfil É pré-requisito. Empresa com fonte externa
  // (OPQ32/Hogan) fica com o perfil bloqueado de forma permanente — arrastar os
  // cenários junto tornaria o mapeamento inalcançável nesses tenants.
  if (!liberado && !config.perfil_externo_fonte) config.mapeamento_cenarios_liberado = false;

  const { error } = await sb.from('empresas')
    .update({ sys_config: config }).eq('id', empresaId);

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    message: liberado ? 'Perfil comportamental liberado' : 'Perfil comportamental bloqueado',
  };
}

export async function toggleMapeamentoCenarios(empresaId: string, liberado: boolean) {
  const sb = await requireEmpresaSupabaseStrict(empresaId, 'settings.company.manage', 'votacao.mapeamento_cenarios');
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();

  const config = empresa?.sys_config || {};
  if (liberado && config.votacao_ativa === true) {
    return { success: false, error: 'Feche a votação antes de liberar o mapeamento de cenários.' };
  }

  // Liberar cenários arrasta o perfil junto (pré-requisito) — EXCETO em empresa
  // com fonte externa de perfil, onde o DISC nativo não existe e o perfil deve
  // permanecer bloqueado.
  if (liberado && !config.perfil_externo_fonte) {
    config.perfil_comportamental_liberado = true;
  }

  config.mapeamento_cenarios_liberado = liberado;

  const { error } = await sb.from('empresas')
    .update({ sys_config: config }).eq('id', empresaId);

  if (error) return { success: false, error: error.message };
  return {
    success: true,
    message: liberado ? 'Mapeamento de cenários liberado' : 'Mapeamento de cenários bloqueado',
  };
}

// ── Admin: carregar resultados da votação ─────────────────────────────────

export async function loadResultadosVotacao(empresaId: string) {
  const sb = await requireAdminSupabase();
  const tdb = tenantDb(empresaId);

  // Verificar status
  const { data: empresa } = await sb.from('empresas')
    .select('sys_config').eq('id', empresaId).maybeSingle();
  const config = empresa?.sys_config || {};
  const votacaoAtiva = config.votacao_ativa === true;
  const perfilComportamentalLiberado = isPerfilComportamentalLiberado(config);
  const mapeamentoCenariosLiberado = isMapeamentoCenariosLiberado(config);
  // Fonte externa de perfil: a UI precisa explicar por que o perfil fica
  // bloqueado sem que isso seja uma pendência (e sem travar os cenários).
  const perfilExternoFonte = config.perfil_externo_fonte || null;

  // Todos os colaboradores (exclui internos @vertho.ai das estatísticas)
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, cargo')
    .not('email', 'ilike', '%@vertho.ai');

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

  // Ordenar rankings por pontos (desc) com desempate por votos (desc).
  // Lógica: pontos pesam por intensidade (1ª > 2ª > 3ª escolha), mas em
  // caso de empate, quanto mais votantes escolheram a competência, maior
  // o consenso — então mais votos = melhor posição no desempate.
  const resultado: Record<string, any> = {};
  for (const [cargo, dados] of Object.entries(porCargo)) {
    const d = dados as any;
    const rankingArr = Object.entries(d.ranking)
      .map(([nome, stats]: [string, any]) => ({ nome, votos: stats.votos, pontos: stats.pontos }))
      .sort((a, b) => b.pontos - a.pontos || b.votos - a.votos);

    resultado[cargo] = {
      total: d.total,
      votaram: d.votaram,
      faltam: d.faltam,
      ranking: rankingArr,
      sugestoes: d.sugestoes,
    };
  }

  return { votacaoAtiva, perfilComportamentalLiberado, mapeamentoCenariosLiberado, perfilExternoFonte, resultado };
}

// ── Admin: aprovar Top 5 da votação ───────────────────────────────────────

export async function aprovarTop5Votacao(empresaId: string, cargo: string, top: string[]) {
  const { requireAdminAction } = await import('@/lib/auth/action-context');
  await requireAdminAction('content.manage');

  if (!Array.isArray(top) || top.length < 1) {
    return { success: false, error: 'Selecione ao menos 1 competência' };
  }
  // Dedup mantendo ordem
  const dedup = Array.from(new Set(top.map((s) => String(s).trim()).filter(Boolean)));
  if (dedup.length === 0) return { success: false, error: 'Nenhuma competência válida' };

  const tdb = tenantDb(empresaId);
  const { error } = await tdb.from('cargos_empresa')
    .update({ top5_workshop: dedup })
    .eq('nome', cargo);

  if (error) return { success: false, error: error.message };
  return { success: true, message: `${dedup.length} competência${dedup.length === 1 ? '' : 's'} aprovada${dedup.length === 1 ? '' : 's'} para ${cargo}` };
}
