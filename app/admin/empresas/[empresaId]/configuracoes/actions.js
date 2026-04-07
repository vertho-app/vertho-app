'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadConfig(empresaId) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug, sys_config, ui_config')
    .eq('id', empresaId).single();
  if (error) return { success: false, error: error.message };
  return { success: true, empresa: data };
}

export async function salvarConfig(empresaId, sysConfig) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('empresas')
    .update({ sys_config: sysConfig })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Configurações salvas' };
}

export async function salvarBranding(empresaId, branding) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const sb = createSupabaseAdmin();

  const { data: current } = await sb.from('empresas')
    .select('ui_config')
    .eq('id', empresaId).single();

  const merged = { ...(current?.ui_config || {}), ...branding };

  const { error } = await sb.from('empresas')
    .update({ ui_config: merged })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: 'Branding salvo' };
}

export async function salvarSlug(empresaId, slug) {
  if (!empresaId || !slug) return { success: false, error: 'empresaId e slug obrigatórios' };

  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean || clean.length < 2) return { success: false, error: 'Slug deve ter pelo menos 2 caracteres (letras, números e hífens)' };

  const sb = createSupabaseAdmin();

  const { data: existing } = await sb.from('empresas')
    .select('id')
    .eq('slug', clean)
    .neq('id', empresaId)
    .single();

  if (existing) return { success: false, error: `O slug "${clean}" já está em uso por outra empresa` };

  const { error } = await sb.from('empresas')
    .update({ slug: clean })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `Slug atualizado para "${clean}"`, slug: clean };
}
