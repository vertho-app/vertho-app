'use server';

// Portal do Representante — biblioteca de materiais comerciais.
//
// Materiais são globais do canal (sem representante_id): RC lê os ativos,
// admin comercial (sales_channel.manage) gerencia o catálogo.
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeOrAdminAction,
  requireCommercialAdminAction,
} from '@/lib/sales/permissions';
import { MATERIAL_CATEGORIES } from '@/lib/sales/constants';
import type { SalesMaterial } from '@/lib/sales/types';

export async function listActiveSalesMaterials() {
  await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_materials')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('title');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesMaterial[] };
}

export async function listAllSalesMaterialsForAdmin() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_materials')
    .select('*')
    .order('category')
    .order('title');
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesMaterial[] };
}

/** Campos editáveis do material (validação compartilhada create/update). */
function materialPatchFromInput(input: Record<string, any>, requireAll: boolean): { patch: Record<string, any> } | { error: string } {
  const patch: Record<string, any> = {};
  if (requireAll || 'title' in input) {
    const title = String(input.title || '').trim();
    if (!title) return { error: 'Título é obrigatório' };
    patch.title = title;
  }
  if (requireAll || 'category' in input) {
    if (!MATERIAL_CATEGORIES.includes(input.category)) return { error: 'Categoria inválida' };
    patch.category = input.category;
  }
  for (const k of ['segment', 'description', 'file_url', 'external_url']) {
    if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k].trim() || null) : input[k] ?? null;
  }
  return { patch };
}

export async function createSalesMaterial(input: {
  title: string;
  category: string;
  segment?: string | null;
  description?: string | null;
  file_url?: string | null;
  external_url?: string | null;
}) {
  await requireCommercialAdminAction();
  const parsed = materialPatchFromInput(input, true);
  if ('error' in parsed) return { success: false as const, error: parsed.error };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_materials')
    .insert({ ...parsed.patch, is_active: true })
    .select('*').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as SalesMaterial };
}

export async function updateSalesMaterial(id: string, input: Record<string, any>) {
  await requireCommercialAdminAction();
  const parsed = materialPatchFromInput(input, false);
  if ('error' in parsed) return { success: false as const, error: parsed.error };

  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_materials')
    .update({ ...parsed.patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Arquiva (soft delete): sai da biblioteca dos RCs, preserva histórico. */
export async function archiveSalesMaterial(id: string) {
  await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_materials')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}
