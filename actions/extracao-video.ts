'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { callAI } from '@/actions/ai-client';
import { extrairConteudoDeVideo } from '@/lib/gemini-video';
import { tasks } from '@trigger.dev/sdk';
import type { extrairVideoTask } from '@/trigger/extracao-video';

// ── 1. Extrair texto-base de um vídeo (não salva ainda) ─────────────────────

export async function extrairVideo(empresaId: string | null, url: string) {
  try {
    await requireAdminAction('content.manage');
    if (!url?.trim()) return { error: 'Informe a URL do vídeo' };

    // Competências COM descritores + locale da empresa (a IA escolhe o par
    // competência › descritor de uma lista real, e a saída sai no idioma do programa).
    let competencias: { competencia: string; descritores: string[] }[] = [];
    let locale = 'pt-BR';
    if (empresaId) {
      try {
        const sb = await requireAdminSupabase();
        const { data } = await sb.from('competencias').select('nome, nome_curto').eq('empresa_id', empresaId).order('nome');
        const map = new Map<string, Set<string>>();
        for (const c of (data || []) as any[]) {
          if (!c.nome) continue;
          if (!map.has(c.nome)) map.set(c.nome, new Set());
          if (c.nome_curto) map.get(c.nome)!.add(c.nome_curto);
        }
        competencias = [...map.entries()].map(([competencia, descs]) => ({ competencia, descritores: [...descs].sort() }));
        const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', empresaId).maybeSingle();
        if (emp?.default_locale) locale = emp.default_locale;
      } catch { /* opcional */ }
    }

    const base = await extrairConteudoDeVideo(url.trim(), { competencias, locale });
    return { success: true, data: base };
  } catch (err: any) {
    console.error('[extrairVideo]', err);
    return { error: err?.message || 'Falha ao extrair o vídeo' };
  }
}

// ── FASE 3: extração ASSÍNCRONA (Vimeo/TED/LMS/longos via worker Cloud Run) ──

/**
 * Cria um micro_conteudo placeholder (status=processing) e dispara o Cloud Run
 * Job que extrai o texto-base em background. O admin escolhe competência/
 * descritor no envio (não vê a extração antes). O worker preenche título +
 * texto-base e marca done.
 */
export async function submeterExtracaoAsync(empresaId: string | null, url: string, competencia: string, descritor: string) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!url?.trim()) return { error: 'Informe a URL do vídeo' };
    if (!competencia || !descritor) return { error: 'Escolha competência e descritor' };

    const { data: novo, error } = await sb.from('micro_conteudos').insert({
      empresa_id: empresaId,
      titulo: 'Processando…',
      descricao: `Extração em background · ${competencia} › ${descritor}`,
      formato: 'video',
      url: url.trim(),
      competencia, descritor,
      nivel_min: 1.0, nivel_max: 4.0,
      tipo_conteudo: 'core',
      origem: 'empresa_video',
      versao: 1,
      ativo: false,
      extracao_status: 'processing',
      extracao_em: new Date().toISOString(),
    }).select('id').maybeSingle();
    if (error || !novo?.id) return { error: error?.message || 'Falha ao criar registro' };

    try {
      await tasks.trigger<typeof extrairVideoTask>('extrair-video', { microConteudoId: novo.id });
    } catch (e: any) {
      await sb.from('micro_conteudos').update({ extracao_status: 'error', extracao_error: e?.message?.slice(0, 500) }).eq('id', novo.id);
      return { error: `Não foi possível iniciar o processamento: ${e?.message || 'erro'}` };
    }
    return { success: true, id: novo.id };
  } catch (err: any) {
    console.error('[submeterExtracaoAsync]', err);
    return { error: err?.message || 'Falha ao submeter' };
  }
}

/** Lista as extrações em background (processando/erro/recém-concluídas) da empresa. */
export async function listarExtracoesAndamento(empresaId: string | null) {
  try {
    await requireAdminAction();
    if (!empresaId) return { data: [] };
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('micro_conteudos')
      .select('id, titulo, url, competencia, descritor, extracao_status, extracao_error, extracao_em')
      .eq('empresa_id', empresaId)
      .not('extracao_status', 'is', null)
      .order('extracao_em', { ascending: false })
      .limit(20);
    return { data: data || [] };
  } catch (err: any) {
    console.error('[listarExtracoesAndamento]', err);
    return { data: [] };
  }
}

/** Competências + descritores da empresa, para os dropdowns da tela. */
export async function loadCompetenciasDescritores(empresaId: string | null) {
  try {
    await requireAdminAction();
    if (!empresaId) return { data: [] };
    const sb = await requireAdminSupabase();
    const { data } = await sb.from('competencias')
      .select('nome, nome_curto')
      .eq('empresa_id', empresaId)
      .order('nome');
    const map = new Map<string, Set<string>>();
    for (const c of (data || []) as any[]) {
      if (!c.nome) continue;
      if (!map.has(c.nome)) map.set(c.nome, new Set());
      if (c.nome_curto) map.get(c.nome)!.add(c.nome_curto);
    }
    const lista = [...map.entries()].map(([competencia, descs]) => ({ competencia, descritores: [...descs].sort() }));
    return { data: lista };
  } catch (err: any) {
    console.error('[loadCompetenciasDescritores]', err);
    return { data: [] };
  }
}

// ── 2. Salvar o vídeo + texto-base na biblioteca (micro_conteudos) ──────────

export async function salvarVideoExtraido(empresaId: string | null, dados: {
  url: string; titulo: string; resumo?: string; texto_base: string;
  competencia?: string | null; descritor?: string | null;
  duracao_min?: number | null; nivelMin?: number; nivelMax?: number;
}) {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!dados?.url || !dados?.texto_base) return { error: 'URL e texto-base são obrigatórios' };
    if (!dados.competencia || !dados.descritor) return { error: 'Defina competência e descritor antes de salvar' };

    const { data: novo, error } = await sb.from('micro_conteudos').insert({
      empresa_id: empresaId,
      titulo: dados.titulo || 'Vídeo da empresa',
      descricao: dados.resumo || `Vídeo da empresa · ${dados.competencia} › ${dados.descritor}`,
      formato: 'video',
      duracao_min: dados.duracao_min ?? null,
      url: dados.url,                  // referencia o vídeo na plataforma da empresa
      conteudo_inline: dados.texto_base, // texto-base = matéria-prima dos complementos
      competencia: dados.competencia,
      descritor: dados.descritor,
      nivel_min: dados.nivelMin ?? 1.0,
      nivel_max: dados.nivelMax ?? 4.0,
      tipo_conteudo: 'core',
      origem: 'empresa_video',
      versao: 1,
      ativo: true,
    }).select('id, titulo').maybeSingle();

    if (error) return { error: error.message };
    return { success: true, id: novo?.id };
  } catch (err: any) {
    console.error('[salvarVideoExtraido]', err);
    return { error: err?.message || 'Falha ao salvar' };
  }
}

// ── 3. Gerar um complemento (texto/podcast) a partir do texto-base ──────────

const FORMATO_LABEL: Record<string, string> = { texto: 'um artigo de apoio', audio: 'um roteiro de podcast (3-4 min)' };

export async function gerarComplementoDoVideo(microConteudoId: string, formato: 'texto' | 'audio') {
  try {
    const sb = await requireAdminSupabase('content.manage');
    if (!microConteudoId) return { error: 'micro_conteudo obrigatório' };
    if (!FORMATO_LABEL[formato]) return { error: 'formato inválido' };

    const { data: base } = await sb.from('micro_conteudos')
      .select('id, empresa_id, titulo, competencia, descritor, conteudo_inline, nivel_min, nivel_max, cargo')
      .eq('id', microConteudoId).maybeSingle();
    if (!base?.conteudo_inline) return { error: 'Texto-base não encontrado' };

    const system = `Você é um designer instrucional da Vertho. A partir do TEXTO-BASE extraído de um vídeo da empresa, escreva ${FORMATO_LABEL[formato]} COMPLEMENTAR — que aprofunda e aplica o conteúdo do vídeo, sem repeti-lo literalmente. Português do Brasil. ${formato === 'audio'
      ? 'Saída: TÍTULO na 1ª linha, depois um bloco "=== NARRAÇÃO (TEXTO LIMPO) ===" com a narração corrida pronta para TTS.'
      : 'Saída: markdown com título (#), seções e uma seção final "## Para refletir". Mínimo 6.000 caracteres.'}`;
    const user = `Competência: ${base.competencia} › ${base.descritor}\nTítulo do vídeo: ${base.titulo}\n\nTEXTO-BASE (do vídeo da empresa):\n${String(base.conteudo_inline).slice(0, 8000)}\n\nEscreva o complemento.`;

    const { getModelForTask } = await import('@/lib/ai-tasks');
    const model = await getModelForTask(base.empresa_id, formato === 'audio' ? 'conteudo_podcast' : 'conteudo_texto');
    let locale: any = undefined;
    if (base.empresa_id) {
      const { data: emp } = await sb.from('empresas').select('default_locale').eq('id', base.empresa_id).maybeSingle();
      if (emp?.default_locale) locale = emp.default_locale;
    }
    const maxTokens = formato === 'texto' ? 8000 : 4096;
    const gerado = (await callAI(system, user, { model }, maxTokens, locale ? { locale } : {})).trim();
    if (!gerado) return { error: 'Geração vazia' };

    const titulo = (gerado.match(/^#?\s*(.+)$/m)?.[1] || `Complemento · ${base.titulo}`).replace(/^TÍTULO:\s*/i, '').slice(0, 120);

    const { data: novo, error } = await sb.from('micro_conteudos').insert({
      empresa_id: base.empresa_id,
      titulo,
      descricao: `Complemento do vídeo · ${base.competencia} › ${base.descritor}`,
      formato,
      conteudo_inline: gerado,
      competencia: base.competencia,
      descritor: base.descritor,
      nivel_min: base.nivel_min ?? 1.0,
      nivel_max: base.nivel_max ?? 4.0,
      tipo_conteudo: 'complemento',
      cargo: base.cargo || 'todos',
      origem: 'complemento_video',
      versao: 1,
      ativo: formato === 'texto',
    }).select('id, titulo').maybeSingle();

    if (error) return { error: error.message };
    return { success: true, id: novo?.id, formato };
  } catch (err: any) {
    console.error('[gerarComplementoDoVideo]', err);
    return { error: err?.message || 'Falha ao gerar complemento' };
  }
}
