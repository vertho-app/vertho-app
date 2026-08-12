'use server';

import { tenantDb } from '@/lib/tenant-db';
import type { AIConfig } from './ai-client';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { excludeInternalEmails } from '@/lib/internal-emails';
import { hasDiscMapeado } from '@/lib/disc-status';
// Núcleo da IA4 (prompt + consolidação + persistência) vive em lib/ para a task
// de lote e os scripts o chamarem sem passar por HTTP — este arquivo é
// `'use server'`, onde todo export vira endpoint e só async é exportável.
import {
  IA4_COLAB_COLS,
  avaliarUmaRespostaCore, carregarContextoLoteIA4,
} from '@/lib/ia4-avaliacao';
import { reavaliarRespostaCore } from '@/lib/ia4-reavaliacao';

/**
 * Fila da IA4 = pendentes clássicas (avaliacao_ia IS NULL) + PRESAS: respostas
 * com avaliacao_ia gravado mas ZERO linhas em descriptor_assessments para o
 * mesmo (colaborador, competencia) — legado do bug em que a avaliação era
 * gravada antes do upsert de notas (achado 1.4 do FMEA-PIPELINE). Incluir as
 * presas na fila é o reparo self-service: o admin roda a IA4 normal e elas são
 * reprocessadas (rodarIA4Uma também deixou de recusá-las).
 *
 * Custo: 2 queries extras por chamada (avaliadas da empresa + assessments dos
 * colaboradores envolvidos, ambas com poucas colunas) — aceitável para a tela
 * admin e evita um NOT EXISTS por resposta via RPC/PostgREST.
 */
async function _buscarFilaIA4(tdb: any): Promise<{ data?: any[]; error?: string }> {
  const { data: pendentes, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .is('avaliacao_ia', null)
    .not('r1', 'is', null);
  if (error) return { error: error.message };

  const { data: avaliadas, error: errAv } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, competencia_nome')
    .not('avaliacao_ia', 'is', null)
    .not('r1', 'is', null);
  if (errAv) return { error: errAv.message };

  let presas: any[] = [];
  const colabIds = [...new Set((avaliadas || []).map((r: any) => r.colaborador_id).filter(Boolean))] as string[];
  if (colabIds.length) {
    // Só nota com origem 'ia4' "desprende" a resposta: uma nota MANUAL na mesma
    // competência não significa que a IA4 persistiu — sem o filtro, a presa saía
    // da fila e o reparo self-service não a alcançava mais.
    const { data: assessments, error: errAss } = await tdb.from('descriptor_assessments')
      .select('colaborador_id, competencia')
      .eq('origem', 'ia4')
      .in('colaborador_id', colabIds);
    if (errAss) return { error: errAss.message };
    const comNotas = new Set((assessments || []).map((a: any) => `${a.colaborador_id}|${a.competencia}`));
    presas = (avaliadas || [])
      .filter((r: any) => r.colaborador_id && r.competencia_nome && !comNotas.has(`${r.colaborador_id}|${r.competencia_nome}`))
      .map((r: any) => ({ ...r, presa_sem_notas: true }));
  }
  return { data: [...(pendentes || []), ...presas] };
}

export async function listarPendentesIA4(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', data: [] };
  const tdb = tenantDb(empresaId);
  const fila = await _buscarFilaIA4(tdb);
  if (fila.error) return { success: false, error: fila.error, data: [] };
  const presas = (fila.data || []).filter((r: any) => r.presa_sem_notas).length;
  return { success: true, data: fila.data || [], presas };
}

export async function rodarIA4Uma(
  empresaId: string, respostaId: string, aiConfig: AIConfig = {},
): Promise<{ success: boolean; message?: string; error?: string }> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId || !respostaId) return { success: false, error: 'empresaId e respostaId obrigatórios' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: resp, error: respErr } = await tdb.from('respostas')
      .select('*').eq('id', respostaId).single();
    if (respErr || !resp) return { success: false, error: respErr?.message || 'Resposta não encontrada' };
    if (resp.avaliacao_ia) {
      // "Já avaliada" só vale com as notas persistidas PELA IA4: avaliacao_ia SEM
      // linhas ia4 em descriptor_assessments é o estado preso do achado 1.4 —
      // reprocessa. (Nota manual na mesma competência não conta: é outra origem.)
      const { count } = await tdb.from('descriptor_assessments')
        .select('colaborador_id', { count: 'exact', head: true })
        .eq('origem', 'ia4')
        .eq('colaborador_id', resp.colaborador_id)
        .eq('competencia', resp.competencia_nome || '');
      if ((count ?? 0) > 0) return { success: true, message: 'Já avaliada' };
      console.warn(`[IA4] resposta ${respostaId} avaliada mas SEM notas de descritor — reprocessando (achado 1.4)`);
    }

    const colabIds = [resp.colaborador_id].filter(Boolean);
    const { data: colabs } = await tdb.from('colaboradores')
      .select(IA4_COLAB_COLS)
      .in('id', colabIds);
    const colab = colabs?.[0] || {};

    // Contexto institucional consolidado por empresa (F-I10 — era `.limit(1)`, uma
    // escola sorteada da rede aplicada ao mapeamento de TODAS as respostas).
    const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sbRaw, empresaId);

    return await avaliarUmaRespostaCore(tdb, sbRaw, resp, colab, empresa, contextoPPP, aiConfig);
  } catch (err: any) {
    console.error('[IA4uma] ERRO:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return { success: false, error: err.message };
  }
}

export async function rodarIA4(empresaId: string, aiConfig: AIConfig = {}) {
  // Sem escape hatch: este arquivo é `'use server'`, então todo export é endpoint
  // HTTP e uma flag de bypass seria escolhida pelo CLIENTE. O id desta action
  // estava PUBLICADO no bundle do browser. Caminho headless → núcleo sem gate em
  // `lib/` (modelo `lib/blueprint/core.ts`), nunca uma flag.
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // Buscar respostas pendentes — inclui as "presas" (avaliacao_ia gravado sem
    // notas de descritor, legado do achado 1.4) via _buscarFilaIA4.
    const fila = await _buscarFilaIA4(tdb);
    if (fila.error) return { success: false, error: fila.error };
    if (!fila.data?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };
    const { data: respostas, error: respErr } = await tdb.from('respostas')
      .select('*')
      .in('id', fila.data.map((r: any) => r.id));

    if (respErr) return { success: false, error: respErr.message };
    if (!respostas?.length) return { success: true, message: 'Nenhuma resposta pendente de avaliação' };

    // Buscar colaboradores com perfil CIS
    const colabIds = [...new Set(respostas.map((r: any) => r.colaborador_id).filter(Boolean))];
    const { data: colabs } = await tdb.from('colaboradores')
      .select(IA4_COLAB_COLS)
      .in('id', colabIds);
    const colabMap: Record<string, any> = {};
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });

    // Contexto institucional consolidado por empresa (F-I10). Vai no `cachedUserPrefix`
    // do IA4, então é lido 1× por lote — consolidar não multiplica custo.
    const { empresa, contextoPPP } = await carregarContextoLoteIA4(tdb, sbRaw, empresaId);

    let avaliadas = 0, erros = 0, ultimoErro = '';

    for (const resp of respostas) {
      try {
        const colab = colabMap[resp.colaborador_id] || {};
        const r = await avaliarUmaRespostaCore(tdb, sbRaw, resp, colab, empresa, contextoPPP, aiConfig);
        if (r.success) avaliadas++;
        else { erros++; ultimoErro = r.error || 'Erro desconhecido'; }
      } catch (e: any) {
        erros++;
        ultimoErro = e.message;
        console.error(`[IA4] ERRO no colab ${resp.colaborador_id?.slice(0,8)} / comp ${resp.competencia_nome}:`, e.message);
      }
    }

    return { success: true, message: `IA4 concluída: ${avaliadas} avaliadas${erros ? `, ${erros} erros` : ''}${ultimoErro ? ` — ${ultimoErro}` : ''}` };
  } catch (err: any) {
    console.error('[IA4] ERRO GERAL:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    return { success: false, error: err.message };
  }
}

// ── Re-avaliar resposta (revisão controlada com feedback do check) ──────────


export async function reavaliarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return reavaliarRespostaCore(sbRaw, respostaId, aiConfig);
}

// ── Re-checar UMA resposta ───────────────────────────────────────────────────

export async function rechecarResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const { checarUmaResposta } = await import('./check-ia4');
  return checarUmaResposta(respostaId, aiConfig);
}

// ── Ver fila de IA4 ─────────────────────────────────────────────────────────

export async function verFilaIA4(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { count: pendentes } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .is('avaliacao_ia', null)
      .not('r1', 'is', null);

    const { count: avaliadas } = await tdb.from('respostas')
      .select('id', { count: 'exact', head: true })
      .not('avaliacao_ia', 'is', null);

    return {
      success: true,
      message: `Fila IA4: ${pendentes || 0} pendentes, ${avaliadas || 0} avaliadas`,
      pendentes: pendentes || 0,
      avaliadas: avaliadas || 0,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ── Carregar respostas com avaliação ─────────────────────────────────────────

export async function loadRespostasAvaliadas(empresaId: string) {
  const sbRaw = await requireAdminSupabase();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data, error } = await tdb.from('respostas')
    .select('id, colaborador_id, competencia_id, cenario_id, r1, r2, r3, r4, nivel_simulado, avaliacao_ia, nivel_ia4, nota_ia4, status_ia4, payload_ia4, pontos_fortes, pontos_atencao, feedback_ia4, created_at')
    .not('r1', 'is', null)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return [];

  const colabIds = [...new Set(data.map((r: any) => r.colaborador_id).filter(Boolean))];
  const colabMap: Record<string, any> = {};
  if (colabIds.length) {
    const { data: colabs } = await tdb.from('colaboradores').select('id, nome_completo, cargo').in('id', colabIds);
    (colabs || []).forEach((c: any) => { colabMap[c.id] = c; });
  }

  const compIds = [...new Set(data.map((r: any) => r.competencia_id).filter(Boolean))];
  const compMap: Record<string, any> = {};
  if (compIds.length) {
    const { data: comps } = await tdb.from('competencias').select('id, nome, cod_comp').in('id', compIds);
    (comps || []).forEach((c: any) => { compMap[c.id] = c; });
  }

  const cenIds = [...new Set(data.map((r: any) => r.cenario_id).filter(Boolean))];
  const cenMap: Record<string, any> = {};
  if (cenIds.length) {
    // banco_cenarios é misto → raw
    const { data: cens } = await sbRaw.from('banco_cenarios').select('id, titulo, alternativas').in('id', cenIds);
    (cens || []).forEach((c: any) => { cenMap[c.id] = c; });
  }

  return data.map((r: any) => ({
    ...r,
    colaborador_nome: colabMap[r.colaborador_id]?.nome_completo || '—',
    colaborador_cargo: colabMap[r.colaborador_id]?.cargo || '—',
    competencia_nome: compMap[r.competencia_id]?.nome || '—',
    competencia_cod: compMap[r.competencia_id]?.cod_comp || '',
    cenario_titulo: cenMap[r.cenario_id]?.titulo || '—',
    cenario_perguntas: cenMap[r.cenario_id]?.alternativas || [],
  }));
}

/**
 * Roster de colaboradores ELEGÍVEIS ao Diagnóstico — usado para calcular % de
 * diagnósticos/cenários realizados e listar quem falta. Exclui:
 * - contas internas (@vertho.ai);
 * - quem ainda NÃO fez o mapeamento comportamental (DISC), pré-requisito das
 *   próximas etapas. Sem DISC, o colaborador não é cobrado de diagnóstico nem
 *   de cenários (não infla o denominador).
 *
 * O cruzamento com quem já respondeu é feito na tela (via colaborador_id das
 * respostas).
 */
export async function loadRosterDiagnostico(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return [];
  const tdb = tenantDb(empresaId);
  const { data } = await excludeInternalEmails(
    tdb.from('colaboradores')
      .select('id, nome_completo, cargo, perfil_dominante, d_natural, i_natural, s_natural, c_natural')
      .order('nome_completo')
  );
  // DISC realizado = perfil dominante + ao menos um eixo D/I/S/C preenchido.
  return (data || [])
    .filter((c: any) => hasDiscMapeado(c))
    .map((c: any) => ({ id: c.id, nome_completo: c.nome_completo, cargo: c.cargo }));
}

// ── Relatórios ──────────────────────────────────────────────────────────────

export async function gerarRelatoriosIndividuais(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatórios individuais: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioGestor(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório gestor: funcionalidade em desenvolvimento' };
}

export async function gerarRelatorioRH(_empresaId: string, _aiConfig: AIConfig = {}) {
  return { success: true, message: 'Relatório RH: funcionalidade em desenvolvimento' };
}

export async function enviarRelIndividuais(_empresaId: string) {
  return { success: true, message: 'Envio individuais: funcionalidade em desenvolvimento' };
}

export async function enviarRelGestor(_empresaId: string) {
  return { success: true, message: 'Envio gestor: funcionalidade em desenvolvimento' };
}

export async function enviarRelRH(_empresaId: string) {
  return { success: true, message: 'Envio RH: funcionalidade em desenvolvimento' };
}
