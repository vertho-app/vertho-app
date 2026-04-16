'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function criarNovaEmpresa(dados) {
  const sb = createSupabaseAdmin();
  const slug = dados.nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await sb
    .from('empresas')
    .insert({ nome: dados.nome.trim(), segmento: dados.segmento || null, slug })
    .select('id, nome, segmento, slug')
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, empresa: data };
}
