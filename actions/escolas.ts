'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';

// ── Normalização de nomes ─────────────────────────────────────────────────────
function foldKey(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // tira acentos
    .toLowerCase()
    .replace(/[.\-_/]+/g, ' ')
    .replace(/\b(escola|colegio|col|cm|c m|em|e m|grupo escolar|ge|creche municipal)\b/g, ' ') // prefixos comuns
    .replace(/\s+/g, ' ').trim();
}

// Título amigável a partir do rótulo cru (preserva o que o usuário digitou, só limpa caixa).
function displayNome(raw: string): string {
  const t = String(raw || '').trim().replace(/\s+/g, ' ');
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Central = Secretaria/administrativo/time interno (não é escola → usa rede).
function ehCentral(key: string): boolean {
  return /sec educa|secretaria|administrativ|pedagogic|gabinete|nucleo|vertho/.test(key);
}

// Match conservador escola↔PPP: compartilham um token "forte" (≥4 letras) ou um contém o outro.
function casaPPP(escolaKey: string, pppKey: string): boolean {
  if (!escolaKey || !pppKey) return false;
  if (escolaKey.includes(pppKey) || pppKey.includes(escolaKey)) return true;
  const a = new Set(escolaKey.split(' ').filter((t) => t.length >= 4));
  return pppKey.split(' ').some((t) => t.length >= 4 && a.has(t));
}

/**
 * Normaliza area_depto → tabela `escolas` e SUGERE colaboradores.escola_id.
 * Idempotente. Não mexe na entrega do assessment (isso é fase 3); aqui só
 * popula o registro e o vínculo sugerido para revisão humana.
 */
export async function normalizarEscolasDaEmpresa(empresaId: string) {
  await requireAdminSupabase('companies.manage');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);

  const { data: colabs } = await tdb.from('colaboradores').select('id, area_depto');
  if (!colabs?.length) return { success: false, error: 'Sem colaboradores' };

  const { data: ppps } = await tdb.from('ppp_escolas')
    .select('id, escola').eq('status', 'extraido');
  const pppList = (ppps || []).map((p: any) => ({ id: p.id, key: foldKey(p.escola), nome: p.escola }));

  // Agrupa colaboradores por chave normalizada de area_depto.
  const grupos = new Map<string, { display: string; origens: Set<string>; central: boolean; colabIds: string[] }>();
  for (const c of colabs as any[]) {
    const raw = (c.area_depto || '').trim();
    if (!raw) continue; // sem area_depto → fica sem escola (rede)
    const key = foldKey(raw);
    if (!key) continue;
    if (!grupos.has(key)) grupos.set(key, { display: displayNome(raw), origens: new Set(), central: ehCentral(key), colabIds: [] });
    const g = grupos.get(key)!;
    g.origens.add(raw);
    g.colabIds.push(c.id);
  }

  const resumo: any[] = [];
  for (const [key, g] of grupos) {
    const pppMatch = g.central ? null : pppList.find((p) => casaPPP(key, p.key));
    // upsert escola por (empresa, lower(nome))
    const { data: ex } = await tdb.from('escolas').select('id').eq('nome', g.display).maybeSingle();
    let escolaId = ex?.id;
    if (escolaId) {
      await tdb.from('escolas').update({
        ppp_escola_id: pppMatch?.id || null, is_central: g.central,
        area_depto_origens: Array.from(g.origens), updated_at: new Date().toISOString(),
      }).eq('id', escolaId);
    } else {
      const { data: nova } = await tdb.from('escolas').insert({
        nome: g.display, ppp_escola_id: pppMatch?.id || null, is_central: g.central,
        area_depto_origens: Array.from(g.origens),
      }).select('id').single();
      escolaId = nova?.id;
    }
    if (escolaId) {
      // Sugere o vínculo (central → null = rede).
      await tdb.from('colaboradores').update({ escola_id: g.central ? null : escolaId }).in('id', g.colabIds);
    }
    resumo.push({ escola: g.display, central: g.central, ppp: pppMatch?.nome || null, colaboradores: g.colabIds.length, origens: Array.from(g.origens) });
  }

  resumo.sort((a, b) => b.colaboradores - a.colaboradores);
  return { success: true, escolas: resumo.length, comPPP: resumo.filter((r) => r.ppp).length, resumo };
}

/** Lista escolas + colaboradores, para a tela de revisão. */
export async function loadEscolas(empresaId: string) {
  await requireAdminSupabase();
  const tdb = tenantDb(empresaId);
  const { data: escolas } = await tdb.from('escolas')
    .select('id, nome, ppp_escola_id, is_central, area_depto_origens').order('nome');
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, cargo, area_depto, escola_id').order('nome_completo');
  const { data: ppps } = await tdb.from('ppp_escolas').select('id, escola').eq('status', 'extraido');
  return { escolas: escolas || [], colaboradores: colabs || [], ppps: ppps || [] };
}

/** Revisão: reatribui a escola de um colaborador (null = rede). */
export async function definirEscolaColaborador(empresaId: string, colaboradorId: string, escolaId: string | null) {
  await requireAdminSupabase('companies.manage');
  const tdb = tenantDb(empresaId);
  if (!colaboradorId) return { success: false, error: 'colaboradorId obrigatório' };
  const { error } = await tdb.from('colaboradores').update({ escola_id: escolaId || null }).eq('id', colaboradorId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Revisão: liga/desliga PPP, flag central e renomeia uma escola. */
export async function atualizarEscola(empresaId: string, escolaId: string, patch: { ppp_escola_id?: string | null; is_central?: boolean; nome?: string }) {
  await requireAdminSupabase('companies.manage');
  const tdb = tenantDb(empresaId);
  if (!escolaId) return { success: false, error: 'escolaId obrigatório' };
  const upd: any = { updated_at: new Date().toISOString() };
  if ('ppp_escola_id' in patch) upd.ppp_escola_id = patch.ppp_escola_id || null;
  if ('is_central' in patch) upd.is_central = !!patch.is_central;
  if (patch.nome) upd.nome = patch.nome.trim();
  const { error } = await tdb.from('escolas').update(upd).eq('id', escolaId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
