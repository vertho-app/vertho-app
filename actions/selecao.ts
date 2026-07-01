'use server';
/**
 * Módulo de SELEÇÃO — Fase C, passo 1: gerar o PERFIL IDEAL (gabarito) de uma VAGA.
 *
 * A vaga (cargos_empresa.eh_vaga=true) não passa pela IA1 (que seleciona competências
 * pré-cadastradas por cargo). Então: a IA escolhe as competências relevantes do CATÁLOGO
 * a partir da DESCRIÇÃO da vaga → grava em top10_cargos → reusa a IA2 inteira (rodarIA2),
 * que gera o gabarito (telas 1-4) com todo o rigor/versionamento existente.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { callAI } from '@/actions/ai-client';
import { rodarIA2 } from '@/actions/fase1';
import { gerarRelatorioAdequacao } from '@/actions/adequacao-cargo';
import { exportarRankingPDFAdmin } from '@/actions/ranking-adequacao';

function dedupComps(comps: any[]): { id: string; nome: string; descricao: string }[] {
  const seen = new Map<string, any>();
  for (const c of comps || []) {
    const k = (c.cod_comp || c.nome || '').toLowerCase();
    if (k && !seen.has(k)) seen.set(k, { id: c.id, nome: c.nome, descricao: c.descricao || '' });
  }
  return [...seen.values()];
}

function extrairJson(raw: string): any {
  let s = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch { const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* */ } } }
  return null;
}

/** Gera o perfil ideal (gabarito) de uma vaga: seleciona competências da descrição + IA2. */
export async function gerarPerfilVaga(empresaId: string, nomeVaga: string): Promise<{ success: boolean; competencias?: number; error?: string }> {
  try {
    if (!empresaId || !nomeVaga?.trim()) return { success: false, error: 'Empresa e vaga obrigatórios.' };
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    const nome = nomeVaga.trim();

    const { data: vaga } = await sb.from('cargos_empresa')
      .select('nome, eh_vaga, descricao, principais_entregas, stakeholders, decisoes_recorrentes, tensoes_comuns, contexto_cultural')
      .eq('empresa_id', empresaId).eq('nome', nome).maybeSingle();
    if (!vaga) return { success: false, error: 'Vaga não encontrada.' };
    if (!vaga.eh_vaga) return { success: false, error: 'Este cargo não é uma vaga.' };
    if (!vaga.descricao && !vaga.principais_entregas) return { success: false, error: 'A vaga precisa de descrição/entregas antes de gerar o perfil. Complete pela tela de extração.' };

    const { data: compsRaw } = await sb.from('competencias').select('id, nome, descricao, cod_comp').eq('empresa_id', empresaId);
    const comps = dedupComps(compsRaw || []);
    if (comps.length < 3) return { success: false, error: 'Cadastre as competências da empresa antes de gerar o perfil da vaga.' };

    // 1) IA escolhe as competências relevantes do catálogo p/ esta vaga.
    const system = `Você seleciona, de um CATÁLOGO de competências, as que uma VAGA realmente exige. Escolha entre 8 e 12 competências, com base na descrição, entregas, stakeholders, decisões e tensões da vaga — priorize as que o trabalho de fato demanda; não force. Use os NOMES EXATOS do catálogo. Responda APENAS JSON: {"competencias": ["Nome Exato 1", "Nome Exato 2", ...]}. Sem markdown.`;
    const ctx = [
      `VAGA: ${nome}`,
      vaga.descricao && `Descrição: ${vaga.descricao}`,
      vaga.principais_entregas && `Entregas: ${vaga.principais_entregas}`,
      vaga.stakeholders && `Stakeholders: ${vaga.stakeholders}`,
      vaga.decisoes_recorrentes && `Decisões: ${vaga.decisoes_recorrentes}`,
      vaga.tensoes_comuns && `Tensões: ${vaga.tensoes_comuns}`,
    ].filter(Boolean).join('\n');
    const catalogo = comps.map((c) => `- ${c.nome}${c.descricao ? `: ${c.descricao.slice(0, 120)}` : ''}`).join('\n');
    const raw = await callAI(system, `${ctx}\n\nCATÁLOGO:\n${catalogo}\n\nEscolha as 8-12 competências mais relevantes para esta vaga.`, {}, 1200);
    const parsed = extrairJson(raw);
    const nomes: string[] = Array.isArray(parsed?.competencias) ? parsed.competencias : [];
    const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const escolhidas = comps.filter((c) => nomes.some((n) => norm(n) === norm(c.nome))).slice(0, 12);
    if (escolhidas.length < 3) return { success: false, error: 'A IA não conseguiu mapear competências do catálogo para esta vaga. Revise a descrição ou o catálogo.' };

    // 2) Grava as competências da vaga em top10_cargos (a IA2 lê daqui).
    await sb.from('top10_cargos').delete().eq('empresa_id', empresaId).eq('cargo', nome);
    for (let i = 0; i < escolhidas.length; i++) {
      await sb.from('top10_cargos').insert({ empresa_id: empresaId, cargo: nome, competencia_id: escolhidas[i].id, posicao: i + 1, justificativa: null });
    }

    // 3) Reusa a IA2 para gerar o gabarito da vaga (telas 1-4, versionado).
    const r2 = await rodarIA2(empresaId, {}, { cargoNome: nome });
    if (!(r2 as any)?.success) return { success: false, error: (r2 as any)?.error || 'Falha ao gerar o gabarito (IA2).' };
    return { success: true, competencias: escolhidas.length };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao gerar o perfil da vaga.' };
  }
}

/** Fase C, passo 2: avalia o POOL de candidatos (todos com DISC) contra o gabarito da vaga
 *  e gera o Ranking de Adequação. Reusa gerarRelatorioAdequacao (poolCompleto) → snapshot →
 *  exportarRankingPDFAdmin. Retorna a URL do ranking. */
export async function gerarRankingVaga(empresaId: string, nomeVaga: string, opts: { comAnaliseIA?: boolean } = {}): Promise<{ success: boolean; url?: string; avaliados?: number; error?: string }> {
  try {
    if (!empresaId || !nomeVaga?.trim()) return { success: false, error: 'Empresa e vaga obrigatórios.' };
    const sb = await requireAdminSupabase('admin.access');
    // Pool de candidatos = ocupantes dos cargos marcados "pool de candidatos" (ex.: "Em busca").
    // Se nenhum cargo estiver marcado, cai para todos com DISC (poolCompleto).
    const { data: poolRows } = await sb.from('cargos_empresa').select('nome').eq('empresa_id', empresaId).eq('eh_pool_candidatos', true);
    const poolCargos = (poolRows || []).map((r: any) => r.nome).filter(Boolean);
    const rel = await gerarRelatorioAdequacao(empresaId, nomeVaga.trim(), { comAnaliseIA: !!opts.comAnaliseIA, poolCompleto: poolCargos.length === 0, poolCargos: poolCargos.length ? poolCargos : undefined });
    if (!rel.success) return { success: false, error: rel.error };
    // Ranking PDF a partir do snapshot recém-gerado.
    const rk = await exportarRankingPDFAdmin(empresaId, nomeVaga.trim());
    if (!rk.success) return { success: false, error: (rk as any).error || 'Falha ao gerar o ranking.' };
    return { success: true, url: rk.url, avaliados: rel.avaliados };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Falha ao avaliar candidatos.' };
  }
}
