'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';
import { ingestDoc, deactivateDoc, listDocs } from '@/lib/rag';

/**
 * Lista empresas pra seletor (apenas platform admin enxerga todas).
 */
export async function listarEmpresas(email) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug')
    .eq('ativa', true)
    .order('nome');
  if (error) return { error: error.message };
  return { ok: true, empresas: data || [] };
}

/**
 * Lista docs ativos do tenant. RH da empresa ou platform admin.
 */
export async function listarDocsKB(email, empresaId) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };
  // Platform admin pode ver qualquer empresa; RH só a sua
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };
  if (!empresaId) return { error: 'empresaId obrigatório' };

  const docs = await listDocs(empresaId);
  return { ok: true, docs };
}

/**
 * Carrega 1 doc completo pra editar.
 */
export async function carregarDocKB(email, empresaId, docId) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('knowledge_base')
    .select('id, empresa_id, titulo, conteudo, categoria, source_url, ativo, criado_em, atualizado_em')
    .eq('id', docId).eq('empresa_id', empresaId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Doc não encontrado' };
  return { ok: true, doc: data };
}

/**
 * Cria novo doc.
 */
export async function criarDocKB(email, payload) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === payload.empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };

  const { empresaId, titulo, conteudo, categoria, sourceUrl } = payload;
  if (!empresaId || !titulo || !conteudo) return { error: 'empresaId+titulo+conteudo obrigatórios' };
  if (titulo.length > 200) return { error: 'titulo > 200 chars' };
  if (conteudo.length > 20000) return { error: 'conteudo > 20k chars (quebre em docs menores)' };

  try {
    const id = await ingestDoc({
      empresaId,
      titulo: titulo.trim(),
      conteudo: conteudo.trim(),
      categoria: categoria || null,
      sourceUrl: sourceUrl || null,
      criadoPor: ctx.colaborador?.id || null,
    });
    return { ok: true, id };
  } catch (err) {
    return { error: err?.message || 'Erro ao criar' };
  }
}

/**
 * Atualiza doc existente.
 */
export async function atualizarDocKB(email, docId, payload) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };

  const sb = createSupabaseAdmin();
  // Confere ownership
  const { data: existing } = await sb.from('knowledge_base')
    .select('empresa_id').eq('id', docId).maybeSingle();
  if (!existing) return { error: 'Doc não encontrado' };

  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === existing.empresa_id);
  if (!podeAcessar) return { error: 'Acesso restrito' };

  const updates = {};
  if (typeof payload.titulo === 'string') {
    if (payload.titulo.length > 200) return { error: 'titulo > 200 chars' };
    updates.titulo = payload.titulo.trim();
  }
  if (typeof payload.conteudo === 'string') {
    if (payload.conteudo.length > 20000) return { error: 'conteudo > 20k chars' };
    updates.conteudo = payload.conteudo.trim();
  }
  if ('categoria' in payload) updates.categoria = payload.categoria || null;
  if ('sourceUrl' in payload) updates.source_url = payload.sourceUrl || null;
  if ('ativo' in payload) updates.ativo = !!payload.ativo;

  if (Object.keys(updates).length === 0) return { error: 'Nada pra atualizar' };

  const { error } = await sb.from('knowledge_base')
    .update(updates).eq('id', docId);
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Soft delete (desativa).
 */
export async function desativarDocKB(email, empresaId, docId) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };

  try {
    await deactivateDoc(empresaId, docId);
    return { ok: true };
  } catch (err) {
    return { error: err?.message || 'Erro ao desativar' };
  }
}

/**
 * Preview de busca: roda kb_search pra testar relevância.
 */
export async function testarBuscaKB(email, empresaId, query) {
  const ctx = await getUserContext(email);
  if (!ctx) return { error: 'Não autenticado' };
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };
  if (!query?.trim()) return { ok: true, resultados: [] };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.rpc('kb_search', {
    p_empresa_id: empresaId,
    p_query: query.slice(0, 500),
    p_limit: 5,
  });
  if (error) return { error: error.message };
  return { ok: true, resultados: data || [] };
}
