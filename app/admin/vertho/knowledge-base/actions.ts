'use server';

import { requireAdminSupabase, requireEmpresaSupabase } from '@/lib/admin-supabase';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction, requireUserAction, requirePermissionAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { ingestDoc, deactivateDoc, listDocs } from '@/lib/rag';
import { parseAndChunk } from '@/lib/rag-ingest';
import { seedKnowledgeBase } from '@/lib/rag-seed';
import { escaparLike } from '@/lib/sql-like';

/**
 * 🔴 O gate desta tela é de PERMISSÃO, e não de papel (reanálise de 05/10/2026).
 *
 * Todas as actions daqui abriam com `ctx.isPlatformAdmin || (ctx.role === 'rh' && ctx.empresaId === id)`.
 * Só que o R-73 (02/10) tirou `knowledge_base.manage` do RH justamente porque nenhuma tela do RH usa
 * a base, e as actions seguiram abertas ao RH da empresa pelo action id (e ao Admin Sócio, que é
 * `isPlatformAdmin` mas não tem escrita). A tela mora em `/admin/vertho`, que é da plataforma.
 *  · LER (listar, abrir, testar a busca): `admin.access`, que o RH não tem e o sócio tem;
 *  · ESCREVER (criar, editar, desativar, subir arquivo, semear): `knowledge_base.manage`, só do admin
 *    master. O tenant continua conferido (`requireEmpresaSupabase`/`assertTenantAccessAction`).
 * A recusa volta como `{ error }`, o contrato que a tela já trata; falha de login segue lançando.
 */
// `any` de propósito: com o tipo `{ error: string }` declarado, a união que a tela lê (`r.error`, `r.docs`)
// perdia a normalização que os literais `{ error }` e `{ ok, docs }` tinham no mesmo corpo, e a tela não compilava.
function recusaDaKB(e: any): any {
  if (/^FORBIDDEN/.test(String(e?.message))) return { error: 'Acesso restrito' };
  throw e;
}

/**
 * Lista empresas pra seletor (apenas platform admin enxerga todas).
 */
export async function listarEmpresas() {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas')
    .select('id, nome, slug')
    .order('nome');
  if (error) return { error: error.message };
  return { ok: true, empresas: data || [] };
}

/**
 * Lista docs ativos do tenant. Só a plataforma (leitura: `admin.access`).
 */
export async function listarDocsKB(empresaId) {
  try { await requireEmpresaSupabase(empresaId, 'admin.access', 'kb.listar'); } catch (e) { return recusaDaKB(e); }
  if (!empresaId) return { error: 'empresaId obrigatório' };

  const docs = await listDocs(empresaId);
  return { ok: true, docs };
}

/**
 * Carrega 1 doc completo pra editar.
 */
export async function carregarDocKB(empresaId, docId) {
  try { await requireEmpresaSupabase(empresaId, 'admin.access', 'kb.carregar'); } catch (e) { return recusaDaKB(e); }

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
  try { await requireEmpresaSupabase(payload?.empresaId, 'knowledge_base.manage', 'kb.criar'); } catch (e) { return recusaDaKB(e); }
  const ctx = await requireUserAction();

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
  // Permissão ANTES de tocar o banco (não vira oráculo de id) e o tenant vem da LINHA, como em
  // `deletarNotaAssessment`: o cliente manda o id do documento, não o da empresa.
  let ctx;
  try { ctx = await requirePermissionAction('knowledge_base.manage'); } catch (e) { return recusaDaKB(e); }

  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('knowledge_base')
    .select('empresa_id').eq('id', docId).maybeSingle();
  if (!existing) return { error: 'Doc não encontrado' };

  try { await assertTenantAccessAction(ctx, existing.empresa_id); } catch (e) { return recusaDaKB(e); }

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
  try { await requireEmpresaSupabase(empresaId, 'knowledge_base.manage', 'kb.desativar'); } catch (e) { return recusaDaKB(e); }

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
  const empresaId = formData?.get?.('empresaId');
  const categoria = formData?.get?.('categoria') || null;
  const sourceUrl = formData?.get?.('sourceUrl') || null;
  const file = formData?.get?.('file');

  try { await requireEmpresaSupabase(empresaId, 'knowledge_base.manage', 'kb.upload'); } catch (e) { return recusaDaKB(e); }
  const ctx = await requireUserAction();
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
  try { await requireEmpresaSupabase(empresaId, 'knowledge_base.manage', 'kb.seed'); } catch (e) { return recusaDaKB(e); }
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
  try { await requireEmpresaSupabase(empresaId, 'admin.access', 'kb.testar'); } catch (e) { return recusaDaKB(e); }
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

  // Fallback: busca simples por ILIKE (ativo != false inclui NULL e true)
  const termo = query.slice(0, 100).replace(/[%_]/g, '');
  const { data: fallback } = await sb.from('knowledge_base')
    .select('id, titulo, conteudo, categoria')
    .eq('empresa_id', empresaId)
    .neq('ativo', false)
    .ilike('conteudo', `%${escaparLike(termo)}%`)
    .limit(5);

  if (fallback?.length) {
    resultados = fallback.map(r => ({ ...r, score: 0 }));
  } else {
    const { data: byTitulo } = await sb.from('knowledge_base')
      .select('id, titulo, conteudo, categoria')
      .eq('empresa_id', empresaId)
      .neq('ativo', false)
      .ilike('titulo', `%${escaparLike(termo)}%`)
      .limit(5);
    resultados = (byTitulo || []).map(r => ({ ...r, score: 0 }));
  }

  return { ok: true, resultados };
}
