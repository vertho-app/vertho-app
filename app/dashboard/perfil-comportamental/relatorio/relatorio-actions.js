'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { buildBehavioralReportPrompt } from '@/lib/prompts/behavioral-report-prompt';
import { callAI } from '@/actions/ai-client';

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/**
 * Carrega o Relatório Comportamental do colaborador.
 * - Usa cache (`report_texts` + `report_generated_at`) se < 30 dias e `force` for false.
 * - Caso contrário, monta o prompt e chama o LLM via callAI.
 * - Salva os textos gerados de volta no Supabase.
 */
export async function loadBehavioralReport(email, opts = {}) {
  try {
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
    if (!hasDISC) {
      return { error: 'Mapeamento comportamental ainda não realizado', semMapeamento: true };
    }

    const raw = mapSupabaseToCISRawData(colab);

    // 1) Cache válido?
    const force = !!opts.force;
    if (!force && colab.report_texts && colab.report_generated_at) {
      const age = Date.now() - new Date(colab.report_generated_at).getTime();
      if (age < CACHE_MAX_AGE_MS) {
        return { raw, texts: colab.report_texts, cached: true };
      }
    }

    // 2) Gera via LLM
    const prompt = buildBehavioralReportPrompt(raw);
    const system = 'Você é um analista comportamental sênior. Responda APENAS com JSON válido, sem markdown nem comentários.';
    const rawAnswer = await callAI(system, prompt, {}, 4096);

    // 3) Parseia (limpa code fences se vierem)
    const cleaned = String(rawAnswer || '')
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();

    let texts;
    try {
      texts = JSON.parse(cleaned);
    } catch (e) {
      console.error('[loadBehavioralReport] Falha ao parsear JSON do LLM:', cleaned.slice(0, 500));
      return { error: 'Erro ao interpretar resposta do modelo. Tente novamente.' };
    }

    // 4) Salva cache
    const sb = createSupabaseAdmin();
    await sb.from('colaboradores')
      .update({ report_texts: texts, report_generated_at: new Date().toISOString() })
      .eq('id', colab.id);

    return { raw, texts, cached: false };
  } catch (err) {
    console.error('[loadBehavioralReport]', err);
    return { error: err?.message || 'Erro ao carregar relatório' };
  }
}

/**
 * Força regeneração dos textos do LLM.
 */
export async function regenerarRelatorioComportamental(email) {
  return loadBehavioralReport(email, { force: true });
}

/**
 * Gera o PDF do relatório comportamental, sobe para o storage e devolve uma
 * signed URL com download forçado (mesmo padrão do PDI individual).
 */
export async function baixarRelatorioComportamentalPdf(email) {
  try {
    if (!email) return { error: 'Não autenticado' };

    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
    if (!hasDISC) return { error: 'Mapeamento comportamental ainda não realizado' };

    // Garante que temos textos LLM
    let texts = colab.report_texts;
    if (!texts) {
      const result = await loadBehavioralReport(email);
      if (result.error) return { error: result.error };
      texts = result.texts;
    }

    const raw = mapSupabaseToCISRawData(colab);
    const data = { raw, texts };

    const { renderToBuffer } = await import('@react-pdf/renderer');
    const React = (await import('react')).default;
    const { default: RelatorioComportamentalPDF } = await import('@/components/pdf/RelatorioComportamental');

    const buffer = await renderToBuffer(
      React.createElement(RelatorioComportamentalPDF, { data })
    );

    const sb = createSupabaseAdmin();
    const slug = (colab.nome_completo || 'relatorio').replace(/\s+/g, '-').toLowerCase();
    const filename = `vertho-comportamental-${slug}.pdf`;
    const path = `${colab.empresa_id}/comportamental-${slug}-${Date.now()}.pdf`;

    const { error: upErr } = await sb.storage
      .from('relatorios-pdf')
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return { error: `Falha ao salvar PDF: ${upErr.message}` };

    const { data: signed, error: signErr } = await sb.storage
      .from('relatorios-pdf')
      .createSignedUrl(path, 300, { download: filename });
    if (signErr) return { error: `Erro ao gerar link: ${signErr.message}` };

    return { success: true, url: signed.signedUrl, filename };
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}
