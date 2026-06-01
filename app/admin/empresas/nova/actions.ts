'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';

export async function criarNovaEmpresa(dados) {
  const sb = await requireAdminSupabase('companies.manage');
  const slug = dados.nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await sb
    .from('empresas')
    .insert({ nome: dados.nome.trim(), segmento: dados.segmento || null, slug })
    .select('id, nome, segmento, slug')
    .single();
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.criar', empresaId: data.id, empresaSlug: data.slug,
    alvo: data.nome, detalhes: { segmento: data.segmento, slug: data.slug },
  });
  return { success: true, empresa: data };
}
