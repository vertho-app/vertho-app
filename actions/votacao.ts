'use server';

import crypto from 'crypto';
import { headers } from 'next/headers';
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { isMapeamentoCenariosLiberado, isPerfilComportamentalLiberado } from '@/lib/votacao/status';
import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { carregarVotacaoStatus } from '@/lib/home/loaders';
import { gravarSysConfig } from '@/lib/sys-config-escrita';
import { montarCedula, normalizarCargoDaCedula, type Cedula } from '@/lib/votacao/cedula';
import { ordenarRanking, somarVoto } from '@/lib/votacao/ranking';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

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

  // Cédula = Top 10 do cargo; sem Top 10, a matriz inteira (lib/votacao/cedula.ts).
  // Falha de leitura NÃO pode virar "cargo sem Top 10": a pessoa receberia a
  // matriz inteira sem ninguém saber por quê.
  const { data: top10, error: errTop10 } = await tdb.from('top10_cargos')
    .select('cargo, competencia:competencias(nome, cod_comp, descricao, pilar)');
  if (errTop10) return { error: 'Não foi possível carregar as competências. Tente de novo em instantes.' };

  let cedula = montarCedula({ cargo: colab.cargo, top10: (top10 || []) as any[], matriz: [] });
  if (cedula.fonte === 'matriz') {
    const { data: matriz, error: errMatriz, count: totalMatriz } = await tdb.from('competencias')
      .select('nome, cod_comp, descricao, pilar, cargo', { count: 'exact' })
      .not('cargo', 'is', null);
    // O PostgREST corta em 1.000 linhas calado: a matriz cortada tiraria
    // competências da cédula sem aviso.
    if (errMatriz || (matriz?.length ?? 0) < (totalMatriz ?? 0)) {
      return { error: 'Não foi possível carregar as competências. Tente de novo em instantes.' };
    }
    cedula = montarCedula({ cargo: colab.cargo, top10: [], matriz: matriz || [] });
  }
  const competencias = cedula.competencias;

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
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage', 'toggleVotacao');
  // As três flags de etapa vivem no MESMO objeto e são gravadas inteiras: sem a
  // trava otimista (`lib/sys-config-escrita`), dois toggles quase simultâneos
  // desfazem um ao outro — e etapa é o que libera a tela do participante.
  const r = await gravarSysConfig(sb, empresaId, (config) => {
    const proximo: Record<string, any> = { ...config, votacao_ativa: ativa };
    if (proximo.perfil_externo_fonte) {
      // Perfil externo (OPQ32/Hogan): o perfil nativo fica bloqueado sempre e NÃO
      // é etapa do fluxo. Só abrir a votação reinicia o mapeamento de cenários —
      // fechar não pode apagar uma liberação que o admin acabou de fazer.
      if (ativa) proximo.mapeamento_cenarios_liberado = false;
    } else if (ativa || proximo.perfil_comportamental_liberado !== true) {
      proximo.perfil_comportamental_liberado = false;
      proximo.mapeamento_cenarios_liberado = false;
    }
    return proximo;
  });

  if (!r.ok) return { success: false, error: r.erro };
  return { success: true, message: ativa ? 'Votação aberta' : 'Votação fechada' };
}

export async function togglePerfilComportamental(empresaId: string, liberado: boolean) {
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage', 'togglePerfilComportamental');
  const r = await gravarSysConfig(sb, empresaId, (config) => {
    // A pré-condição é reavaliada a cada tentativa: se a votação foi aberta
    // entre a leitura e a escrita, liberar aqui teria furado o gate.
    if (liberado && config.votacao_ativa === true) {
      return { erro: 'Feche a votação antes de liberar o perfil comportamental.' };
    }
    const proximo: Record<string, any> = { ...config, perfil_comportamental_liberado: liberado };
    // Cascata só vale onde o perfil É pré-requisito. Empresa com fonte externa
    // (OPQ32/Hogan) fica com o perfil bloqueado de forma permanente — arrastar os
    // cenários junto tornaria o mapeamento inalcançável nesses tenants.
    if (!liberado && !proximo.perfil_externo_fonte) proximo.mapeamento_cenarios_liberado = false;
    return proximo;
  });

  if (!r.ok) return { success: false, error: r.erro };
  return {
    success: true,
    message: liberado ? 'Perfil comportamental liberado' : 'Perfil comportamental bloqueado',
  };
}

export async function toggleMapeamentoCenarios(empresaId: string, liberado: boolean) {
  const sb = await requireEmpresaSupabase(empresaId, 'settings.company.manage', 'toggleMapeamentoCenarios');
  const r = await gravarSysConfig(sb, empresaId, (config) => {
    if (liberado && config.votacao_ativa === true) {
      return { erro: 'Feche a votação antes de liberar o mapeamento de cenários.' };
    }
    const proximo: Record<string, any> = { ...config };
    // Liberar cenários arrasta o perfil junto (pré-requisito) — EXCETO em empresa
    // com fonte externa de perfil, onde o DISC nativo não existe e o perfil deve
    // permanecer bloqueado.
    if (liberado && !proximo.perfil_externo_fonte) {
      proximo.perfil_comportamental_liberado = true;
    }
    proximo.mapeamento_cenarios_liberado = liberado;
    return proximo;
  });

  if (!r.ok) return { success: false, error: r.erro };
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
      somarVoto(grupo.ranking, voto.competencias_escolhidas); // 1º = 5 pts … 5º = 1 (lib/votacao/ranking.ts)
      if (voto.sugestao_nova) grupo.sugestoes.push({ nome: c.nome_completo, sugestao: voto.sugestao_nova });
    } else {
      grupo.faltam.push(c.nome_completo);
    }
  }

  // Fonte da cédula por cargo (lib/votacao/cedula.ts): o admin vê, ANTES de
  // abrir, se cada cargo vota na Top 10 ou na matriz inteira. Leitura que falha
  // vira `null` ("não deu para ler"), nunca "cargo sem Top 10".
  const { data: top10All, error: errTop10 } = await tdb.from('top10_cargos')
    .select('cargo, competencia:competencias(nome, cod_comp, descricao, pilar)');
  const { data: matrizAll, error: errMatriz, count: totalMatriz } = await tdb.from('competencias')
    .select('nome, cod_comp, descricao, pilar, cargo', { count: 'exact' })
    .not('cargo', 'is', null);
  const cedulaLegivel = !errTop10 && !errMatriz && (matrizAll?.length ?? 0) >= (totalMatriz ?? 0);
  const cedulaDoCargo = (cargo: string): { fonte: Cedula['fonte']; total: number } | null => {
    if (!cedulaLegivel) return null;
    const c = montarCedula({ cargo, top10: (top10All || []) as any[], matriz: matrizAll || [] });
    return { fonte: c.fonte, total: c.competencias.length };
  };

  // Ordem: pontos, votos, e depois mais vezes em 1º lugar (2º, 3º…). Empate que
  // sobra sai marcado, não escondido numa ordem arbitrária. Régua em
  // `lib/votacao/ranking.ts`.
  const resultado: Record<string, any> = {};
  for (const [cargo, dados] of Object.entries(porCargo)) {
    const d = dados as any;
    const rankingArr = ordenarRanking(d.ranking);

    const cedula = cedulaDoCargo(cargo);
    resultado[cargo] = {
      total: d.total,
      votaram: d.votaram,
      faltam: d.faltam,
      ranking: rankingArr,
      sugestoes: d.sugestoes,
      cedula,
    };

    // Votação aberta com cargo votando na matriz inteira: o fallback existe de
    // propósito (cédula vazia travaria a pessoa), mas não pode ficar invisível.
    // Registrado AQUI, na leitura do admin, e não a cada cédula aberta: por
    // pessoa, um cargo grande estouraria o volume da R10 com um só motivo.
    if (votacaoAtiva && cedula?.fonte === 'matriz') {
      await registrarDegradacao({
        fluxo: 'votacao',
        tipo: DEGRADACAO.CEDULA_SEM_TOP10,
        chave: `${empresaId}:${normalizarCargoDaCedula(cargo)}`,
        empresaId,
        severidade: 'aviso',
        detalhe: { cargo, competencias: cedula.total, pessoas: d.total },
      });
    }
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
