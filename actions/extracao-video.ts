'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { extrairConteudoDeVideo } from '@/lib/gemini-video';
import { criarModuloBaseDeTextoExtraido } from '@/actions/modulos-base';
import { tasks } from '@trigger.dev/sdk';
import type { extrairVideoTask } from '@/trigger/extracao-video';

// O resultado da extração vira um MÓDULO-BASE rascunho (matéria-prima canônica),
// não um micro_conteudo. Alcance por extração: GLOBAL (todos os tenants) ou
// EXCLUSIVO da empresa de origem.

// ── 1. Extrair texto-base de um vídeo (síncrono — YouTube/.mp4) ─────────────

export async function extrairVideo(empresaId: string | null, url: string) {
  try {
    await requireAdminAction('content.manage');
    if (!url?.trim()) return { error: 'Informe a URL do vídeo' };

    let locale = 'pt-BR';
    if (empresaId) {
      try {
        const sb = await requireAdminSupabase();
        const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', empresaId).maybeSingle();
        if (emp?.default_locale) locale = emp.default_locale;
      } catch { /* opcional */ }
    }

    const base = await extrairConteudoDeVideo(url.trim(), { locale });
    return { success: true, data: base };
  } catch (err: any) {
    console.error('[extrairVideo]', err);
    return { error: err?.message || 'Falha ao extrair o vídeo' };
  }
}

// ── 2. Gerar o MÓDULO-BASE rascunho a partir do texto-base (síncrono) ───────

/**
 * Estrutura o texto-base revisado num Módulo-Base rascunho. `escopoEmpresaId`
 * null = módulo global/canônico (todos os tenants); preenchido = exclusivo da
 * empresa. `locale` opcional (default da empresa-escopo ou pt-BR).
 */
export async function gerarModuloBaseDoVideo(escopoEmpresaId: string | null, dados: {
  url: string; titulo: string; texto_base: string; locale?: string;
}) {
  try {
    const ctx = await requireAdminAction('content.manage');
    if (!dados?.texto_base?.trim()) return { error: 'Texto-base vazio' };

    let locale = dados.locale;
    if (!locale && escopoEmpresaId) {
      const sb = await requireAdminSupabase();
      const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', escopoEmpresaId).maybeSingle();
      locale = emp?.default_locale || 'pt-BR';
    }

    const res = await criarModuloBaseDeTextoExtraido({
      textoBase: dados.texto_base,
      tituloVideo: dados.titulo,
      urlOrigem: dados.url,
      locale: locale || 'pt-BR',
      empresaId: escopoEmpresaId,
      createdBy: (ctx as any)?.email || 'extracao-video',
    });
    if (res.error || !res.id) return { error: res.error || 'Falha ao criar módulo-base' };
    return { success: true, moduloId: res.id, competencia: res.competencia, transicao: `${res.nivel_entrada}→${res.nivel_destino}`, avisos: res.avisos };
  } catch (err: any) {
    console.error('[gerarModuloBaseDoVideo]', err);
    return { error: err?.message || 'Falha ao gerar módulo-base' };
  }
}

// ── 3. Extração ASSÍNCRONA (Vimeo/TED/LMS/longos via worker trigger.dev) ────

/**
 * Cria o rastreador (extracoes_video, status=processing) e dispara o worker. O
 * worker extrai o texto-base e chama a rota interna que estrutura o módulo-base
 * rascunho. `origemEmpresaId` = de onde foi disparado (null = nível Vertho);
 * `escopoEmpresaId` = alvo do módulo (null = global/canônico).
 */
export async function submeterExtracaoAsync(origemEmpresaId: string | null, url: string, escopoEmpresaId: string | null) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!url?.trim()) return { error: 'Informe a URL do vídeo' };
    const ctx = await requireAdminAction('content.manage');

    const { data: novo, error } = await sb.from('extracoes_video').insert({
      origem_empresa_id: origemEmpresaId,
      escopo_empresa_id: escopoEmpresaId,
      escopo_global: !escopoEmpresaId,
      url: url.trim(),
      status: 'processing',
      created_by: (ctx as any)?.email || null,
    }).select('id').maybeSingle();
    if (error || !novo?.id) return { error: error?.message || 'Falha ao criar registro' };

    try {
      await tasks.trigger<typeof extrairVideoTask>('extrair-video', { extracaoId: novo.id });
    } catch (e: any) {
      await sb.from('extracoes_video').update({ status: 'error', error: e?.message?.slice(0, 500) }).eq('id', novo.id);
      return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
    }
    return { success: true, id: novo.id };
  } catch (err: any) {
    console.error('[submeterExtracaoAsync]', err);
    return { error: err?.message || 'Falha ao submeter' };
  }
}

/** Empresas para o seletor de alcance (extração no nível Vertho). */
export async function listarEmpresasParaEscopo() {
  try {
    await requireAdminAction('content.manage');
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('empresas').select('id, nome').order('nome');
    return { data: (data || []) as { id: string; nome: string }[] };
  } catch (err: any) {
    console.error('[listarEmpresasParaEscopo]', err);
    return { data: [] };
  }
}

/**
 * Lista as extrações (processando/erro/concluídas). `origemEmpresaId` = empresa
 * que disparou; null = nível Vertho (extrações sem empresa de origem).
 */
export async function listarExtracoesAndamento(origemEmpresaId: string | null) {
  try {
    await requireAdminAction();
    const sb = await requireAdminSupabase();
    let q = sb.from('extracoes_video')
      .select('id, url, titulo, status, error, escopo_empresa_id, modulo_base_id, modulo_base_ids, n_modulos, updated_at')
      .order('created_at', { ascending: false })
      .limit(20);
    q = origemEmpresaId ? q.eq('origem_empresa_id', origemEmpresaId) : q.is('origem_empresa_id', null);
    const { data } = await q;
    return { data: data || [] };
  } catch (err: any) {
    console.error('[listarExtracoesAndamento]', err);
    return { data: [] };
  }
}
