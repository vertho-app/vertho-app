'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction, requireUserAction } from '@/lib/auth/action-context';
import { ingestDoc, deactivateDoc, listDocs } from '@/lib/rag';
import { parseAndChunk } from '@/lib/rag-ingest';
import { seedKnowledgeBase } from '@/lib/rag-seed';

/**
 * Lista empresas pra seletor (apenas platform admin enxerga todas).
 */
export async function listarEmpresas() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug')
    .order('nome');
  if (error) return { error: error.message };
  return { ok: true, empresas: data || [] };
}

/**
 * Lista docs ativos do tenant. RH da empresa ou platform admin.
 */
export async function listarDocsKB(empresaId) {
  const ctx = await requireUserAction();
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
export async function carregarDocKB(empresaId, docId) {
  const ctx = await requireUserAction();
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
export async function criarDocKB(payload) {
  const ctx = await requireUserAction();
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
export async function atualizarDocKB(docId, payload) {
  const ctx = await requireUserAction();

  const sb = createSupabaseAdmin();
  // Confere ownership
  const { data: existing } = await sb.from('knowledge_base')
    .select('empresa_id').eq('id', docId).maybeSingle();
  if (!existing) return { error: 'Doc não encontrado' };

  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === existing.empresa_id);
  if (!podeAcessar) return { error: 'Acesso restrito' };

  const updates: any = {};
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
export async function desativarDocKB(empresaId, docId) {
  const ctx = await requireUserAction();
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
 * Upload de arquivo (PDF/DOCX/TXT/MD): extrai texto, quebra em chunks por
 * seção e cria 1 doc por chunk. Cada chunk vira um row em knowledge_base
 * com title = "<arquivo>: <heading>" pra rastreabilidade.
 *
 * Server Action limit: 4MB no body (Next default). Se quiser >4MB, usar
 * signed URL upload (não implementado aqui — começo com small files).
 *
 * @param {string} email
 * @param {FormData} formData - { empresaId, categoria?, sourceUrl?, file: File }
 */
export async function uploadDocsArquivo(formData) {
  const ctx = await requireUserAction();

  const empresaId = formData.get('empresaId');
  const categoria = formData.get('categoria') || null;
  const sourceUrl = formData.get('sourceUrl') || null;
  const file = formData.get('file');

  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };
  if (!empresaId) return { error: 'empresaId obrigatório' };
  if (!file || typeof file === 'string') return { error: 'Arquivo obrigatório' };
  if (file.size > 4 * 1024 * 1024) return { error: 'Arquivo > 4MB. Quebre em partes.' };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const chunks = await parseAndChunk(buffer, { mime: file.type, filename: file.name });

    if (!chunks.length) return { error: 'Documento vazio ou ilegível' };

    const filenameBase = (file.name || 'documento').replace(/\.[^.]+$/, '');
    const ids = [];
    for (const c of chunks) {
      const titulo = `${filenameBase}: ${c.titulo}`.slice(0, 200);
      const id = await ingestDoc({
        empresaId,
        titulo,
        conteudo: c.conteudo,
        categoria,
        sourceUrl,
        criadoPor: ctx.colaborador?.id || null,
      });
      if (id) ids.push(id);
    }

    return {
      ok: true,
      message: `${ids.length} chunk(s) criado(s) a partir de ${file.name}`,
      chunks: ids.length,
    };
  } catch (err) {
    console.error('[uploadDocsArquivo]', err);
    return { error: err?.message || 'Falha ao processar arquivo' };
  }
}

/**
 * Popula a base com docs template (Vertho onboarding, política, etc).
 * Idempotente: pula docs que já existem (por título).
 */
export async function seedKB(empresaId) {
  const ctx = await requireUserAction();
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };
  if (!empresaId) return { error: 'empresaId obrigatório' };

  try {
    const r = await seedKnowledgeBase(empresaId);
    return { ok: true, message: `${r.criados} criados, ${r.pulados} já existiam`, ...r };
  } catch (err) {
    return { error: err?.message || 'Falha no seed' };
  }
}

/**
 * Preview de busca: roda kb_search pra testar relevância.
 */
export async function testarBuscaKB(empresaId, query) {
  const ctx = await requireUserAction();
  const podeAcessar = ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === empresaId);
  if (!podeAcessar) return { error: 'Acesso restrito' };
  if (!query?.trim()) return { ok: true, resultados: [] };

  const sb = createSupabaseAdmin();

  // Tenta RPC kb_search (FTS). Se falhar ou retornar vazio, fallback para ILIKE.
  let resultados: any[] = [];
  try {
    const { data, error } = await sb.rpc('kb_search', {
      p_empresa_id: empresaId,
      p_query: query.slice(0, 500),
      p_limit: 5,
    });
    if (!error && data?.length) return { ok: true, resultados: data };
    if (error) console.warn('[testarBuscaKB] kb_search falhou:', error.message);
  } catch (e: any) {
    console.warn('[testarBuscaKB] kb_search exception:', e?.message);
  }

  // Fallback: busca simples por ILIKE
  const termo = query.slice(0, 100).replace(/[%_]/g, '');
  const { data: fallback } = await sb.from('knowledge_base')
    .select('id, titulo, conteudo, categoria')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .ilike('conteudo', `%${termo}%`)
    .limit(5);

  if (fallback?.length) {
    resultados = fallback.map(r => ({ ...r, score: 0 }));
  } else {
    // Tenta por título
    const { data: byTitulo } = await sb.from('knowledge_base')
      .select('id, titulo, conteudo, categoria')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .ilike('titulo', `%${termo}%`)
      .limit(5);
    resultados = (byTitulo || []).map(r => ({ ...r, score: 0 }));
  }

  return { ok: true, resultados };
}
