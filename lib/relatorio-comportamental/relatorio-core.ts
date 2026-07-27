import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { findColabByEmail } from '@/lib/authz';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { buildBehavioralReportPrompt } from '@/lib/prompts/behavioral-report-prompt';
import { callAI } from '@/actions/ai-client';
import { BEHAVIORAL_REPORT_SCHEMA_VERSION, isCurrentBehavioralReport } from '@/lib/behavioral-report-schema';
import { storageSlug } from '@/lib/storage-slug';

/**
 * Núcleo HEADLESS do relatório comportamental — SEM gate e SEM endpoint HTTP.
 * Extraído de relatorio-actions.ts (grupo C): `gerarEsalvarRelatorioComportamental`
 * era export 'use server' (endpoint client-reachable) que aceitava `colabId` do
 * CLIENTE e agia sobre QUALQUER colab (fetchColabPorId não filtra empresa) → IDOR
 * cross-tenant (escreve report/PDF de colab alheio) + abuso de custo LLM/PDF.
 *
 * Quem chama daqui DIRETO: só callers de SERVIDOR que já resolveram/autorizaram
 * o colab — o after() do salvarPerfilComportamental (mapeamento, sem sessão no
 * pós-response → passa o colabId da PRÓPRIA sessão) e as actions gatadas/de
 * sessão de relatorio-actions.ts. Como NÃO é 'use server', o cliente não alcança
 * este `colabId`; a autorização é responsabilidade do caller.
 */

export const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
export const BUCKET = 'relatorios-pdf';

export async function gerarTextosLLM(raw, empresaId) {
  const prompt = buildBehavioralReportPrompt(raw);
  const system = 'Você é um analista comportamental sênior da Vertho. DISC é tendência, não sentença. Nunca use linguagem determinista. Responda APENAS com JSON válido, sem markdown nem comentários.';
  const { getModelForTask } = await import('@/lib/ai-tasks');
  const model = await getModelForTask(empresaId, 'relatorio_comportamental');
  const rawAnswer = await callAI(system, prompt, { model }, 4096);

  const cleaned = String(rawAnswer || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  return {
    ...JSON.parse(cleaned),
    _schema_version: BEHAVIORAL_REPORT_SCHEMA_VERSION,
  };
}

export function isFreshReportCache(texts: unknown, generatedAt: unknown): boolean {
  if (!isCurrentBehavioralReport(texts) || !generatedAt) return false;
  return Date.now() - new Date(String(generatedAt)).getTime() < CACHE_MAX_AGE_MS;
}

export async function persistReportTexts(sb: any, colabId: string, texts: any) {
  const generatedAt = new Date().toISOString();
  await sb.from('colaboradores')
    .update({
      report_texts: texts,
      report_generated_at: generatedAt,
      comportamental_pdf_path: null,
      comportamental_audio_path: null,
      comportamental_audio_at: null,
    })
    .eq('id', colabId);
  return generatedAt;
}

async function renderPdfBuffer(data) {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  const React = (await import('react')).default;
  const { default: RelatorioComportamentalPDF } = await import('@/components/pdf/RelatorioComportamental');

  return renderToBuffer(
    React.createElement(RelatorioComportamentalPDF, { data }) as any
  );
}

function pdfPathFor(colab) {
  const slug = storageSlug(colab.nome_completo, 'relatorio');
  return {
    path: `${colab.empresa_id}/comportamental-${slug}-${Date.now()}.pdf`,
    filename: `vertho-comportamental-${slug}.pdf`,
    slug,
  };
}

/**
 * Carrega o colab por id em DOIS passos: descobre o tenant (bootstrap — não dá
 * pra filtrar por aquilo que a query existe pra encontrar) e só então lê os
 * dados JÁ ESCOPADO por `tenantDb`.
 *
 * `empresaIdEsperado` é a barreira de verdade: quando o caller sabe de que
 * tenant o colab DEVE ser (fluxo de sessão, lote por empresa), divergência
 * devolve null em vez de dado alheio. Os callers que omitem são as actions de
 * `requireAdminAction()` — platform admin, cross-tenant por mandato.
 */
export async function fetchColabPorId(colabId, empresaIdEsperado?: string | null) {
  if (!colabId) return null;
  const sb = createSupabaseAdmin();
  const { data: raiz } = await sb.from('colaboradores')
    .select('empresa_id')
    .eq('id', colabId)
    .maybeSingle();
  const empresaId = raiz?.empresa_id;
  if (!empresaId) return null;
  if (empresaIdEsperado && empresaId !== empresaIdEsperado) return null;

  const { data } = await tenantDb(empresaId).from('colaboradores')
    .select(CIS_COLUMNS)
    .eq('id', colabId)
    .maybeSingle();
  return data || null;
}

/**
 * Gera textos LLM (se faltar) + renderiza PDF + upa pro bucket + salva path
 * em `colaboradores.comportamental_pdf_path`. Usado pelo fire-and-forget do fim
 * do mapeamento e pelo fluxo de download (via relatorio-actions.ts).
 *
 * Aceita o colab inteiro (caller já consultou), um colabId, OU cai no email da
 * sessão (fallback: resolve o PRÓPRIO colab do caller — nunca alheio).
 *
 * `empresaId`: tenant esperado do `colabId`. Passe SEMPRE que souber (fluxo de
 * sessão, lote por empresa) — vira barreira em `fetchColabPorId`.
 */
export async function gerarEsalvarRelatorioComportamentalCore({ colab: inputColab, colabId, empresaId }: any = {}) {
  try {
    let colab: any = inputColab;
    if (!colab && !colabId) {
      const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
      const email = await getAuthenticatedEmailFromAction();
      if (email) colab = await findColabByEmail(email, CIS_COLUMNS);
    }
    if (!colab && colabId) {
      colab = await fetchColabPorId(colabId, empresaId);
    }
    if (!colab) return { error: 'Colaborador não encontrado' };

    const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
    if (!hasDISC) return { error: 'Mapeamento comportamental ainda não realizado' };

    const sb = createSupabaseAdmin();
    const raw = mapSupabaseToCISRawData(colab);

    // 1) Textos LLM — reusa cache se válido
    let texts = null;
    if (isFreshReportCache(colab.report_texts, colab.report_generated_at)) texts = colab.report_texts;
    if (!texts) {
      texts = await gerarTextosLLM(raw, colab.empresa_id);
      await persistReportTexts(sb, colab.id, texts);
    }

    // 1.5) Resumo executivo (arquétipo + tags + insights) — vindos do mesmo lib da tela
    const { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } = await import('@/lib/disc-arquetipos');
    const arquetipo = derivarArquetipo(colab.perfil_dominante);
    const tags = derivarTagsExecutivas(colab);
    const insights = Array.isArray(colab.insights_executivos) && colab.insights_executivos.length
      ? colab.insights_executivos
      : insightsHardcoded(colab.perfil_dominante);

    // 2) Renderiza PDF
    const buffer = await renderPdfBuffer({ raw, texts, arquetipo, tags, insights });

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
    console.error('[gerarEsalvarRelatorioComportamentalCore]', err);
    return { error: err?.message || 'Erro ao gerar relatório' };
  }
}
