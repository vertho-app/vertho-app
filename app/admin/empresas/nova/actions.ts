'use server';

import { z } from 'zod';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { protectedAction } from '@/lib/auth/protected-action';
import { logAdminAction } from '@/lib/audit';

const CriarEmpresaSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório'),
  segmento: z.string().nullish(),
});

const _criarNovaEmpresa = protectedAction('companies.manage', CriarEmpresaSchema, async (ctx, dados) => {
  const sb = await requireAdminSupabase();
  const slug = dados.nome.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const { data, error } = await sb
    .from('empresas')
    .insert({ nome: dados.nome.trim(), segmento: dados.segmento || null, slug })
    .select('id, nome, segmento, slug')
    .single();
  if (error) throw new Error(error.message);
  await logAdminAction({
    adminEmail: ctx.email,
    acao: 'empresa.criar', empresaId: data.id, empresaSlug: data.slug,
    alvo: data.nome, detalhes: { segmento: data.segmento, slug: data.slug },
  });
  return { empresa: data };
});

export async function criarNovaEmpresa(dados: z.infer<typeof CriarEmpresaSchema>) {
  const r = await _criarNovaEmpresa(dados);
  return r.success
    ? { success: true as const, empresa: r.data!.empresa }
    : { success: false as const, error: r.error || 'Erro ao criar empresa' };
}
