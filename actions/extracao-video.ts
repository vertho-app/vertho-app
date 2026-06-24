'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { extrairConteudoDeVideo } from '@/lib/gemini-video';
import { criarModulosDeTranscricao } from '@/actions/modulos-base';
import { parseDocument } from '@/lib/rag-ingest';
import { tasks } from '@trigger.dev/sdk';
import { regionOpts } from '@/lib/trigger-region';
import type { extrairVideoTask } from '@/trigger/extracao-video';
import type { estruturarMaterialTask } from '@/trigger/estruturar-material';

// O resultado da extração vira um MÓDULO-BASE rascunho (matéria-prima canônica),
// não um micro_conteudo. Alcance por extração: GLOBAL (todos os tenants) ou
// EXCLUSIVO da empresa de origem.

export type DirecionamentoExtracao = {
  pilar?: string | null;
  competencia?: string | null;
  competenciaBaseId?: string | null;
};

function limparDirecionamento(d?: DirecionamentoExtracao | null): DirecionamentoExtracao | null {
  const pilar = String(d?.pilar || '').trim().slice(0, 160);
  const competencia = String(d?.competencia || '').trim().slice(0, 220);
  const competenciaBaseId = String(d?.competenciaBaseId || '').trim();
  if (!pilar && !competencia && !competenciaBaseId) return null;
  return {
    pilar: pilar || null,
    competencia: competencia || null,
    competenciaBaseId: competenciaBaseId || null,
  };
}

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
 * Estrutura o texto-base revisado em Módulos-Base rascunho. Usa o segmentador →
 * pode gerar N módulos (um por tema/competência/descritor distinto), como nos
 * fluxos de material e vídeo longo. `escopoEmpresaId` null = global; preenchido
 * = exclusivo da empresa. `locale` opcional (default da empresa-escopo ou pt-BR).
 */
export async function gerarModuloBaseDoVideo(escopoEmpresaId: string | null, dados: {
  url: string; titulo: string; texto_base: string; locale?: string;
  direcionamento?: DirecionamentoExtracao | null;
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

    const res = await criarModulosDeTranscricao({
      transcricao: dados.texto_base,
      tituloVideo: dados.titulo,
      urlOrigem: dados.url,
      locale: locale || 'pt-BR',
      empresaId: escopoEmpresaId,
      createdBy: (ctx as any)?.email || 'extracao-video',
      direcionamento: limparDirecionamento(dados.direcionamento),
    });
    if (res.error || !res.modulos.length) return { error: res.error || 'Falha ao criar módulo-base' };
    return { success: true, modulos: res.modulos, n: res.modulos.length };
  } catch (err: any) {
    console.error('[gerarModuloBaseDoVideo]', err);
    return { error: err?.message || 'Falha ao gerar módulo-base' };
  }
}

// ── 2b. Extração de MATERIAL (PDF/DOCX/TXT) — mesmo pipeline, síncrono ──────

/**
 * Extrai o texto de um material (PDF/DOCX/TXT) e cria N Módulos-Base rascunho
 * pelo MESMO pipeline do vídeo longo: segmenta em temas → 1 módulo por tema.
 * Documento já é texto → roda síncrono (sem worker). `escopoEmpresaId` null =
 * módulo global/canônico; preenchido = exclusivo da empresa.
 */
export async function extrairModulosDeMaterial(escopoEmpresaId: string | null, dados: {
  arquivoBase64: string; filename: string; mime?: string; locale?: string;
  direcionamento?: DirecionamentoExtracao | null;
}) {
  try {
    const ctx = await requireAdminAction('content.manage');
    if (!dados?.arquivoBase64) return { error: 'Anexe um arquivo (PDF, DOCX ou TXT)' };

    const buffer = Buffer.from(dados.arquivoBase64, 'base64');
    let texto = '';
    try {
      const parsed = await parseDocument(buffer, { mime: dados.mime, filename: dados.filename });
      texto = (parsed?.text || '').trim();
    } catch (e: any) {
      return { error: e?.message || 'Não foi possível ler o arquivo' };
    }
    if (texto.length < 200) return { error: 'Texto extraído muito curto (arquivo vazio, imagem/scan sem OCR, ou protegido).' };

    let locale = dados.locale;
    if (!locale && escopoEmpresaId) {
      const sb = await requireAdminSupabase();
      const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', escopoEmpresaId).maybeSingle();
      locale = emp?.default_locale || 'pt-BR';
    }

    const titulo = dados.filename.replace(/\.[^.]+$/, '').slice(0, 120);
    const res = await criarModulosDeTranscricao({
      transcricao: texto,
      tituloVideo: titulo,
      urlOrigem: `material:${dados.filename}`.slice(0, 80),
      locale: locale || 'pt-BR',
      empresaId: escopoEmpresaId,
      createdBy: (ctx as any)?.email || 'extracao-material',
      direcionamento: limparDirecionamento(dados.direcionamento),
    });
    if (res.error || !res.modulos.length) return { error: res.error || 'Falha ao criar módulos' };
    return { success: true, modulos: res.modulos, n: res.modulos.length, chars: texto.length };
  } catch (err: any) {
    console.error('[extrairModulosDeMaterial]', err);
    return { error: err?.message || 'Falha ao extrair material' };
  }
}

/**
 * Estruturação ASSÍNCRONA de material (PDF/DOCX/TXT). Parseia o texto na hora
 * (rápido) e enfileira a SEGMENTAÇÃO em background — materiais grandes (livros
 * de 50k+ palavras) levam minutos e estourariam a rota síncrona de 300s. O
 * registro (extracoes_video) já guarda o texto; a task só dispara a estruturação.
 */
export async function submeterMaterialAsync(
  escopoEmpresaId: string | null,
  dados: { arquivoBase64: string; filename: string; mime?: string; direcionamento?: DirecionamentoExtracao | null },
  origemEmpresaId: string | null = null,
) {
  try {
    const ctx = await requireAdminAction('content.manage');
    if (!dados?.arquivoBase64) return { error: 'Anexe um arquivo (PDF, DOCX ou TXT)' };
    const sb = await requireAdminSupabase('content.manage');

    const buffer = Buffer.from(dados.arquivoBase64, 'base64');
    let texto = '';
    try {
      const parsed = await parseDocument(buffer, { mime: dados.mime, filename: dados.filename });
      texto = (parsed?.text || '').trim();
    } catch (e: any) {
      return { error: e?.message || 'Não foi possível ler o arquivo' };
    }
    if (texto.length < 200) return { error: 'Texto extraído muito curto (arquivo vazio, imagem/scan sem OCR, ou protegido).' };

    const titulo = dados.filename.replace(/\.[^.]+$/, '').slice(0, 120);
    const direcionamento = limparDirecionamento(dados.direcionamento);
    const { data: novo, error } = await sb.from('extracoes_video').insert({
      origem_empresa_id: origemEmpresaId,
      escopo_empresa_id: escopoEmpresaId,
      escopo_global: !escopoEmpresaId,
      url: `material:${dados.filename}`.slice(0, 200),
      transcricao: texto,
      titulo,
      status: 'processing',
      created_by: (ctx as any)?.email || null,
      pilar_direcionador: direcionamento?.pilar || null,
      competencia_direcionadora: direcionamento?.competencia || null,
      competencia_base_id_direcionadora: direcionamento?.competenciaBaseId || null,
    }).select('id').maybeSingle();
    if (error || !novo?.id) return { error: error?.message || 'Falha ao criar registro' };

    try {
      await tasks.trigger<typeof estruturarMaterialTask>('estruturar-material', { extracaoId: novo.id }, regionOpts());
    } catch (e: any) {
      await sb.from('extracoes_video').update({ status: 'error', error: e?.message?.slice(0, 500) }).eq('id', novo.id);
      return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
    }
    return { success: true, id: novo.id, chars: texto.length };
  } catch (err: any) {
    console.error('[submeterMaterialAsync]', err);
    return { error: err?.message || 'Falha ao submeter material' };
  }
}

/**
 * Estruturação ASSÍNCRONA de um texto-base já extraído/revisado. É o plano B
 * do fluxo síncrono de vídeo: se a etapa "Gerar módulo(s)-base" demorar ou
 * falhar, preservamos o texto e deixamos o worker estruturar via rota interna.
 */
export async function submeterTextoBaseAsync(
  escopoEmpresaId: string | null,
  dados: { textoBase: string; titulo?: string; url?: string; direcionamento?: DirecionamentoExtracao | null },
  origemEmpresaId: string | null = null,
) {
  try {
    const ctx = await requireAdminAction('content.manage');
    const texto = String(dados?.textoBase || '').trim();
    if (texto.length < 40) return { error: 'Texto-base muito curto para estruturar' };
    const sb = await requireAdminSupabase('content.manage');

    const titulo = String(dados?.titulo || 'Texto-base de vídeo').trim().slice(0, 120);
    const url = String(dados?.url || `texto-base:${titulo}`).trim().slice(0, 200);
    const direcionamento = limparDirecionamento(dados.direcionamento);
    const { data: novo, error } = await sb.from('extracoes_video').insert({
      origem_empresa_id: origemEmpresaId,
      escopo_empresa_id: escopoEmpresaId,
      escopo_global: !escopoEmpresaId,
      url,
      transcricao: texto,
      titulo,
      status: 'processing',
      created_by: (ctx as any)?.email || null,
      pilar_direcionador: direcionamento?.pilar || null,
      competencia_direcionadora: direcionamento?.competencia || null,
      competencia_base_id_direcionadora: direcionamento?.competenciaBaseId || null,
    }).select('id').maybeSingle();
    if (error || !novo?.id) return { error: error?.message || 'Falha ao criar registro' };

    try {
      await tasks.trigger<typeof estruturarMaterialTask>('estruturar-material', { extracaoId: novo.id }, regionOpts());
    } catch (e: any) {
      await sb.from('extracoes_video').update({ status: 'error', error: e?.message?.slice(0, 500) }).eq('id', novo.id);
      return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
    }
    return { success: true, id: novo.id, chars: texto.length };
  } catch (err: any) {
    console.error('[submeterTextoBaseAsync]', err);
    return { error: err?.message || 'Falha ao submeter texto-base' };
  }
}

// ── 3. Extração ASSÍNCRONA (Vimeo/TED/LMS/longos via worker trigger.dev) ────

/**
 * Cria o rastreador (extracoes_video, status=processing) e dispara o worker. O
 * worker extrai o texto-base e chama a rota interna que estrutura o módulo-base
 * rascunho. `origemEmpresaId` = de onde foi disparado (null = nível Vertho);
 * `escopoEmpresaId` = alvo do módulo (null = global/canônico).
 */
export async function submeterExtracaoAsync(origemEmpresaId: string | null, url: string, escopoEmpresaId: string | null, direcionamentoRaw?: DirecionamentoExtracao | null) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!url?.trim()) return { error: 'Informe a URL do vídeo' };
    const ctx = await requireAdminAction('content.manage');
    const direcionamento = limparDirecionamento(direcionamentoRaw);

    const { data: novo, error } = await sb.from('extracoes_video').insert({
      origem_empresa_id: origemEmpresaId,
      escopo_empresa_id: escopoEmpresaId,
      escopo_global: !escopoEmpresaId,
      url: url.trim(),
      status: 'processing',
      created_by: (ctx as any)?.email || null,
      pilar_direcionador: direcionamento?.pilar || null,
      competencia_direcionadora: direcionamento?.competencia || null,
      competencia_base_id_direcionadora: direcionamento?.competenciaBaseId || null,
    }).select('id').maybeSingle();
    if (error || !novo?.id) return { error: error?.message || 'Falha ao criar registro' };

    try {
      await tasks.trigger<typeof extrairVideoTask>('extrair-video', { extracaoId: novo.id }, regionOpts());
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

/** Opções opcionais para orientar a extração/segmentação por pilar e competência. */
export async function listarDirecionadoresExtracao(empresaId?: string | null) {
  try {
    await requireAdminAction('content.manage');
    const sb = await requireAdminSupabase();

    const { data: baseRows } = await sb.from('competencias_base')
      .select('id, nome, nome_curto, pilar, segmento, descritor_completo')
      .order('pilar').order('nome')
      .limit(1000);

    const bases = (baseRows || []) as any[];
    const baseByName = new Map<string, any>();
    for (const b of bases) {
      const key = String(b.nome || '').trim().toLowerCase();
      if (key && !baseByName.has(key)) baseByName.set(key, b);
      const shortKey = String(b.nome_curto || '').trim().toLowerCase();
      if (shortKey && !baseByName.has(shortKey)) baseByName.set(shortKey, b);
    }

    let empresaRows: any[] = [];
    if (empresaId) {
      const { data } = await sb.from('competencias')
        .select('nome, nome_curto, pilar, cargo, descritor_completo')
        .eq('empresa_id', empresaId)
        .order('pilar').order('nome')
        .limit(1000);
      empresaRows = (data || []) as any[];
    }

    const competencias: {
      nome: string;
      pilar: string | null;
      competenciaBaseId: string | null;
      origem: 'empresa' | 'base';
      detalhe?: string | null;
    }[] = [];
    const seen = new Set<string>();
    const add = (row: any, origem: 'empresa' | 'base') => {
      const nome = String(row.nome_curto || row.nome || '').trim();
      if (!nome) return;
      const pilar = String(row.pilar || '').trim() || null;
      const match = origem === 'base'
        ? row
        : baseByName.get(nome.toLowerCase()) || baseByName.get(String(row.nome || '').trim().toLowerCase());
      const key = `${origem}|${pilar || ''}|${nome.toLowerCase()}|${match?.id || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      competencias.push({
        nome,
        pilar,
        competenciaBaseId: match?.id || null,
        origem,
        detalhe: row.descritor_completo || row.cargo || row.segmento || null,
      });
    };

    empresaRows.forEach((r) => add(r, 'empresa'));
    bases.forEach((r) => add(r, 'base'));

    const pilares = Array.from(new Set(competencias.map((c) => c.pilar).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b));
    return { data: { pilares, competencias } };
  } catch (err: any) {
    console.error('[listarDirecionadoresExtracao]', err);
    return { data: { pilares: [], competencias: [] } };
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

/**
 * Exclui UMA entrada do histórico de extrações (tabela extracoes_video). É só um
 * LOG — a FK p/ modulos_base_conteudo é ON DELETE SET NULL, então apagar a entrada
 * NÃO apaga os módulos já gerados.
 */
export async function excluirExtracao(id: string) {
  try {
    await requireAdminAction('content.manage');
    const sb = await requireAdminSupabase();
    const { error } = await sb.from('extracoes_video').delete().eq('id', id);
    if (error) return { error: error.message };
    return { ok: true };
  } catch (err: any) {
    return { error: err?.message || 'Falha ao excluir extração' };
  }
}

/**
 * Limpa o histórico de extrações do escopo de origem listado, PRESERVANDO as que
 * ainda estão 'processing' (pra não perder a linha que a task em andamento atualiza).
 * Não afeta os módulos gerados (FK SET NULL).
 */
export async function limparHistoricoExtracoes(origemEmpresaId: string | null) {
  try {
    await requireAdminAction('content.manage');
    const sb = await requireAdminSupabase();
    let q = sb.from('extracoes_video').delete({ count: 'exact' }).neq('status', 'processing');
    q = origemEmpresaId ? q.eq('origem_empresa_id', origemEmpresaId) : q.is('origem_empresa_id', null);
    const { error, count } = await q;
    if (error) return { error: error.message };
    return { ok: true, removidas: count ?? 0 };
  } catch (err: any) {
    return { error: err?.message || 'Falha ao limpar histórico' };
  }
}
