'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { findColabByEmail } from '@/lib/authz';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { buildBehavioralReportPrompt } from '@/lib/prompts/behavioral-report-prompt';
import { callAI } from '@/actions/ai-client';

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const BUCKET = 'relatorios-pdf';

// ── Helpers internos ────────────────────────────────────────────────────────

async function gerarTextosLLM(raw) {
  const prompt = buildBehavioralReportPrompt(raw);
  const system = 'Você é um analista comportamental sênior. Responda APENAS com JSON válido, sem markdown nem comentários.';
  const rawAnswer = await callAI(system, prompt, {}, 4096);

  const cleaned = String(rawAnswer || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(cleaned);
}

async function renderPdfBuffer(data) {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const React = (await import('react')).default;
  const { default: RelatorioComportamentalPDF } = await import('@/components/pdf/RelatorioComportamental');

  return renderToBuffer(
    React.createElement(RelatorioComportamentalPDF, { data })
  );
}

function pdfPathFor(colab) {
  const slug = (colab.nome_completo || 'relatorio').replace(/\s+/g, '-').toLowerCase();
  return {
    path: `${colab.empresa_id}/comportamental-${slug}-${Date.now()}.pdf`,
    filename: `vertho-comportamental-${slug}.pdf`,
    slug,
  };
}

// ── Public actions ──────────────────────────────────────────────────────────

/**
 * Carrega o Relatório Comportamental do colaborador.
 * - Usa cache (`report_texts` + `report_generated_at`) se < 30 dias e `force` for false.
 * - Caso contrário, monta o prompt e chama o LLM via callAI, salvando o resultado.
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
    let texts;
    try {
      texts = await gerarTextosLLM(raw);
    } catch (e) {
      console.error('[loadBehavioralReport] Falha ao parsear JSON do LLM:', e);
      return { error: 'Erro ao interpretar resposta do modelo. Tente novamente.' };
    }

    // 3) Salva cache
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

async function fetchColabPorId(colabId) {
  if (!colabId) return null;
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select(CIS_COLUMNS)
    .eq('id', colabId)
    .maybeSingle();
  return data || null;
}

/**
 * Gera textos LLM (se faltar) + renderiza PDF + upa pro bucket + salva path
 * em `colaboradores.comportamental_pdf_path`. Usado tanto pelo fire-and-forget
 * do fim do mapeamento quanto pelo fluxo de download.
 *
 * Aceita o colab inteiro (caller já consultou), um email, OU um colabId.
 */
export async function gerarEsalvarRelatorioComportamental({ email, colab: inputColab, colabId } = {}) {
  try {
    let colab = inputColab;
    if (!colab && email) {
      colab = await findColabByEmail(email, CIS_COLUMNS);
    }
    if (!colab && colabId) {
      colab = await fetchColabPorId(colabId);
    }
    if (!colab) return { error: 'Colaborador não encontrado' };

    const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
    if (!hasDISC) return { error: 'Mapeamento comportamental ainda não realizado' };

    const sb = createSupabaseAdmin();
    const raw = mapSupabaseToCISRawData(colab);

    // 1) Textos LLM — reusa cache se válido
    let texts = null;
    if (colab.report_texts && colab.report_generated_at) {
      const age = Date.now() - new Date(colab.report_generated_at).getTime();
      if (age < CACHE_MAX_AGE_MS) texts = colab.report_texts;
    }
    if (!texts) {
      texts = await gerarTextosLLM(raw);
      await sb.from('colaboradores')
        .update({ report_texts: texts, report_generated_at: new Date().toISOString() })
        .eq('id', colab.id);
    }

    // 2) Renderiza PDF
    const buffer = await renderPdfBuffer({ raw, texts });

    // 3) Upload no bucket
    const { path, filename } = pdfPathFor(colab);
    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });
    if (upErr) return { error: `Falha ao salvar PDF: ${upErr.message}` };

    // 4) Salva path
    await sb.from('colaboradores')
      .update({ comportamental_pdf_path: path })
      .eq('id', colab.id);

    return { success: true, path, filename };
  } catch (err) {
    console.error('[gerarEsalvarRelatorioComportamental]', err);
    return { error: err?.message || 'Erro ao gerar relatório' };
  }
}

/**
 * Força regeneração dos textos do LLM (e re-gera o PDF).
 */
export async function regenerarRelatorioComportamental(email) {
  const result = await loadBehavioralReport(email, { force: true });
  if (result.error) return result;
  // re-gera o PDF com os novos textos
  await gerarEsalvarRelatorioComportamental({ email });
  return result;
}

// Shared helper usado pelo fluxo /dashboard (email) e pelo /admin (colabId)
async function _baixarPdfParaColab(colab) {
  const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
  if (!hasDISC) return { error: 'Mapeamento comportamental ainda não realizado' };

  const sb = createSupabaseAdmin();
  const slug = (colab.nome_completo || 'relatorio').replace(/\s+/g, '-').toLowerCase();
  const filename = `vertho-comportamental-${slug}.pdf`;

  // Caminho já salvo? Reusa.
  let path = colab.comportamental_pdf_path;

  // Se não tem, gera na hora
  if (!path) {
    const result = await gerarEsalvarRelatorioComportamental({ colab });
    if (result.error) return { error: result.error };
    path = result.path;
  }

  const { data: signed, error: signErr } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, 300, { download: filename });
  if (signErr) return { error: `Erro ao gerar link: ${signErr.message}` };

  return { success: true, url: signed.signedUrl, filename };
}

/**
 * Gera signed URL para baixar o PDF do colaborador autenticado.
 * Usado pela página `/dashboard/perfil-comportamental/relatorio`.
 */
export async function baixarRelatorioComportamentalPdf(email) {
  try {
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _baixarPdfParaColab(colab);
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}

/**
 * Variante usada pelo admin (tela /admin/fit) para baixar o PDF de qualquer
 * colaborador pelo id. Não exige autenticação do próprio colab.
 */
export async function baixarRelatorioComportamentalPdfPorId(colabId) {
  try {
    if (!colabId) return { error: 'colabId obrigatório' };
    const colab = await fetchColabPorId(colabId);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _baixarPdfParaColab(colab);
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdfPorId]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}
