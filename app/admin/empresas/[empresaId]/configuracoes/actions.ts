'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getAuthenticatedEmailFromAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { addVercelDomain, removeVercelDomain } from '@/lib/vercel-domain';

export async function loadConfig(empresaId) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug, sys_config, ui_config, default_locale')
    .eq('id', empresaId).single();
  if (error && /default_locale/i.test(error.message || '')) {
    const fallback = await sb.from('empresas')
      .select('id, nome, slug, sys_config, ui_config')
      .eq('id', empresaId).single();
    if (fallback.error) return { success: false, error: fallback.error.message };
    return { success: true, empresa: { ...fallback.data, default_locale: 'pt-BR' } };
  }
  if (error) return { success: false, error: error.message };
  return { success: true, empresa: data };
}

export async function salvarConfig(empresaId, sysConfig) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const { error } = await sb.from('empresas')
    .update({ sys_config: sysConfig })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'sys_config',
    detalhes: { campo: 'sys_config', chaves: Object.keys(sysConfig || {}) },
  });
  return { success: true, message: 'Configurações salvas' };
}

export async function salvarLocaleEmpresa(empresaId, defaultLocale) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const validLocales = ['pt-BR', 'pt-PT', 'es-ES'];
  if (!validLocales.includes(defaultLocale)) {
    return { success: false, error: `Locale inválido. Use: ${validLocales.join(', ')}` };
  }

  const { error } = await sb.from('empresas')
    .update({ default_locale: defaultLocale })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'default_locale',
    detalhes: { campo: 'default_locale', valor: defaultLocale },
  });
  return { success: true, message: 'Idioma padrão salvo' };
}

export async function salvarBranding(empresaId, branding) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  const { data: current } = await sb.from('empresas')
    .select('ui_config')
    .eq('id', empresaId).single();

  const merged = { ...(current?.ui_config || {}), ...branding };

  const { error } = await sb.from('empresas')
    .update({ ui_config: merged })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };
  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, alvo: 'branding',
    detalhes: { campo: 'ui_config', chaves: Object.keys(branding || {}) },
  });
  return { success: true, message: 'Branding salvo' };
}

// ── Gerenciar Roles da Equipe ──────────────────────────────────────────────

export async function loadEquipe(empresaId) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return [];
  const { data } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

export async function atualizarRole(colaboradorId, novoRole) {
  const sb = await requireAdminSupabase();
  if (!colaboradorId || !novoRole) return { success: false, error: 'Dados obrigatorios' };
  const validRoles = ['colaborador', 'gestor', 'rh', 'tutor'];
  if (!validRoles.includes(novoRole)) return { success: false, error: `Role invalido. Use: ${validRoles.join(', ')}` };

  const { error } = await sb.from('colaboradores')
    .update({ role: novoRole })
    .eq('id', colaboradorId);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `Role atualizado para ${novoRole}` };
}

export async function salvarSlug(empresaId, slug) {
  const sb = await requireAdminSupabase();
  if (!empresaId || !slug) return { success: false, error: 'empresaId e slug obrigatórios' };

  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean || clean.length < 2) return { success: false, error: 'Slug deve ter pelo menos 2 caracteres (letras, números e hífens)' };

  const { data: existing } = await sb.from('empresas')
    .select('id')
    .eq('slug', clean)
    .neq('id', empresaId)
    .single();

  if (existing) return { success: false, error: `O slug "${clean}" já está em uso por outra empresa` };

  const { data: prev } = await sb.from('empresas')
    .select('slug')
    .eq('id', empresaId)
    .single();
  const slugAnterior = prev?.slug;

  const { error } = await sb.from('empresas')
    .update({ slug: clean })
    .eq('id', empresaId);
  if (error) return { success: false, error: error.message };

  // Subdomínio antigo é removido automaticamente do Vercel; o novo precisa
  // ser vinculado manualmente pelo botão "Vincular ao Vercel".
  if (slugAnterior && slugAnterior !== clean) {
    removeVercelDomain(slugAnterior).catch(() => {});
  }

  await logAdminAction({
    adminEmail: (await getAuthenticatedEmailFromAction()) || 'desconhecido',
    acao: 'empresa.editar', empresaId, empresaSlug: clean, alvo: 'slug (subdomínio)',
    detalhes: { campo: 'slug', de: slugAnterior, para: clean },
  });

  return { success: true, message: `Slug atualizado para "${clean}". Lembre de vincular o novo subdomínio ao Vercel.`, slug: clean };
}

/**
 * Vincula o subdomínio do tenant ao projeto Vercel (emissão de SSL).
 * Acionado pelo botão "Vincular ao Vercel" no card de subdomínio em
 * /admin/empresas/[id]/configuracoes (aba Branding).
 */
export async function vincularDominioVercel(empresaId: string) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };

  const { data: empresa } = await sb.from('empresas')
    .select('slug, nome').eq('id', empresaId).maybeSingle();
  if (!empresa?.slug) return { success: false, error: 'Empresa sem slug definido' };

  const r = await addVercelDomain(empresa.slug);
  if ('skipped' in r && r.skipped) {
    return { success: false, error: 'VERCEL_TOKEN/PROJECT_ID não configurados em produção' };
  }
  if (!r.ok) {
    return { success: false, error: (r as any).error || 'Falha ao vincular ao Vercel' };
  }
  if (r.alreadyExists) {
    return { success: true, message: `${empresa.slug}.vertho.ai já estava vinculado.` };
  }
  return { success: true, message: `${empresa.slug}.vertho.ai vinculado. SSL será emitido em ~1 minuto.` };
}
