'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { canViewColabJourney, findColabByEmail, getUserContext } from '@/lib/authz';
import { CIS_COLUMNS, mapSupabaseToCISRawData } from '@/lib/supabase/mapCISProfile';
import { callAI } from '@/actions/ai-client';
import { isCurrentBehavioralReport } from '@/lib/behavioral-report-schema';
import { storageSlug } from '@/lib/storage-slug';
import {
  CACHE_MAX_AGE_MS,
  BUCKET,
  gerarTextosLLM,
  isFreshReportCache,
  persistReportTexts,
  fetchColabPorId,
  gerarEsalvarRelatorioComportamentalCore,
} from '@/lib/relatorio-comportamental/relatorio-core';
import { buildAcmeDemoBehavioralReport } from '@/lib/demo/acme-behavioral-report';

// ── Helpers internos ────────────────────────────────────────────────────────

function isArtifactCurrent(artifactAt: unknown, reportAt: unknown): boolean {
  if (!artifactAt || !reportAt) return false;
  return new Date(String(artifactAt)).getTime() >= new Date(String(reportAt)).getTime();
}

async function resolveColaboradorGestor(email: string, colaboradorId: string): Promise<{ colab?: any; error?: string }> {
  // `colaboradorId` é controlado pelo cliente. O gate central cobre próprio,
  // RH, gestor responsável, tutor e admin — sempre com isolamento de tenant.
  const ctx = await getUserContext(email);
  if (!ctx?.empresaId) return { error: 'Usuário sem empresa vinculada' };
  const tdb = tenantDb(ctx.empresaId);
  const { data: colab, error } = await tdb.from('colaboradores')
    .select(`${CIS_COLUMNS}, email, gestor_email`)
    .eq('id', colaboradorId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!colab || !canViewColabJourney(ctx, colab as any)) return { error: 'Colaborador fora do seu escopo' };
  return { colab };
}

async function loadBehavioralReportForColab(colab: any, force = false) {
  const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
  if (!hasDISC) {
    return { error: 'Mapeamento comportamental ainda não realizado', semMapeamento: true };
  }

  const raw = mapSupabaseToCISRawData(colab);
  if (!force && isFreshReportCache(colab.report_texts, colab.report_generated_at)) {
    return { raw, texts: colab.report_texts, cached: true };
  }
  const sb = createSupabaseAdmin();

  // A sala demo precisa abrir instantaneamente durante uma apresentação. As
  // personas sintéticas têm números DISC coerentes, mas não podem depender de
  // uma chamada de IA ao vivo para ganhar a narrativa completa. O fallback é
  // restrito a tenant explicitamente marcado como demo e usa o schema canônico.
  if (!force && colab.empresa_id) {
    const { data: empresa, error: empresaError } = await sb.from('empresas')
      .select('is_demo')
      .eq('id', colab.empresa_id)
      .maybeSingle();
    if (empresaError) console.error('[loadBehavioralReport] Falha ao identificar tenant demo:', empresaError.message);
    if (!empresaError && empresa?.is_demo) {
      const texts = buildAcmeDemoBehavioralReport(colab);
      await persistReportTexts(sb, colab.id, texts, colab.empresa_id);
      return { raw, texts, cached: false, demo: true };
    }
  }

  let texts;
  try {
    texts = await gerarTextosLLM(raw, colab.empresa_id);
  } catch (e) {
    console.error('[loadBehavioralReport] Falha ao parsear JSON do LLM:', e);
    return { error: 'Erro ao interpretar resposta do modelo. Tente novamente.' };
  }

  await persistReportTexts(sb, colab.id, texts, colab.empresa_id);
  return { raw, texts, cached: false };
}

// ── Public actions ──────────────────────────────────────────────────────────

/**
 * Carrega o Relatório Comportamental do colaborador.
 * - Usa cache (`report_texts` + `report_generated_at`) se < 30 dias e `force` for false.
 * - Caso contrário, monta o prompt e chama o LLM via callAI, salvando o resultado.
 */
export async function loadBehavioralReport(opts: any = {}) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };

    const colab: any = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await loadBehavioralReportForColab(colab, !!opts.force);
  } catch (err) {
    console.error('[loadBehavioralReport]', err);
    return { error: err?.message || 'Erro ao carregar relatório' };
  }
}

/** Variante de consulta da equipe; o alvo passa pelo gate de posse canônico. */
export async function loadBehavioralReportGestor(colaboradorId: string) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!colaboradorId) return { error: 'Colaborador inválido' };
    const resolved = await resolveColaboradorGestor(email, colaboradorId);
    if (resolved.error) return { error: resolved.error };
    return await loadBehavioralReportForColab(resolved.colab, false);
  } catch (err) {
    console.error('[loadBehavioralReportGestor]', err);
    return { error: err?.message || 'Erro ao carregar relatório' };
  }
}

/**
 * Pré-gera PDFs comportamentais para todos os colabs de uma empresa que
 * ainda não têm `comportamental_pdf_path`. Serial pra evitar timeout.
 */
export async function pregerarPdfsEmpresa(empresaId) {
  try {
    // Gate admin — sem isto, qualquer autenticado dispararia geração de PDFs +
    // chamadas LLM de todos os colabs de qualquer empresa (IDOR + abuso de custo).
    const { requireAdminAction } = await import('@/lib/auth/action-context');
    await requireAdminAction('assessments.dispatch');
    if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
    const sb = createSupabaseAdmin();
    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, comportamental_pdf_path, report_texts')
      .eq('empresa_id', empresaId);

    const pendentes = (colabs || []).filter(
      c => !c.comportamental_pdf_path || !isCurrentBehavioralReport(c.report_texts),
    );
    if (pendentes.length === 0) return { success: true, message: 'Todos já têm PDF', gerados: 0, total: colabs?.length || 0 };

    let gerados = 0, erros = 0;
    for (const c of pendentes) {
      try {
        const r = await gerarEsalvarRelatorioComportamentalCore({ colabId: c.id, empresaId });
        if (r.success) gerados++; else erros++;
      } catch (e) {
        console.error('[VERTHO] pregerarPdfsEmpresa', c.id, e.message);
        erros++;
      }
    }
    return { success: true, message: `${gerados} gerados, ${erros} erros (${colabs?.length} total)`, gerados, erros };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Força regeneração dos textos do LLM (e re-gera o PDF).
 */
export async function regenerarRelatorioComportamental() {
  const result = await loadBehavioralReport({ force: true });
  if (result.error) return result;
  // re-gera o PDF com os novos textos
  await gerarEsalvarRelatorioComportamentalCore({});
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
  let path = isCurrentBehavioralReport(colab.report_texts)
    ? colab.comportamental_pdf_path
    : null;

  // Se não tem, gera na hora
  if (!path) {
    const result = await gerarEsalvarRelatorioComportamentalCore({ colab });
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
export async function baixarRelatorioComportamentalPdf() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _baixarPdfParaColab(colab);
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdf]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}

/** PDF completo de um liderado/RH/tutor, após gate de posse do alvo. */
export async function baixarRelatorioComportamentalPdfGestor(colaboradorId: string) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!colaboradorId) return { error: 'Colaborador inválido' };
    const resolved = await resolveColaboradorGestor(email, colaboradorId);
    if (resolved.error) return { error: resolved.error };
    return await _baixarPdfParaColab(resolved.colab);
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdfGestor]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}

/**
 * Variante usada pelo admin (tela /admin/fit) para baixar o PDF de qualquer
 * colaborador pelo id. Não exige autenticação do próprio colab.
 */
export async function baixarRelatorioComportamentalPdfPorId(colabId) {
  try {
    // Gate admin — sem isto, qualquer autenticado baixava o PDF DISC de
    // qualquer colab (fetchColabPorId não filtra empresa). Mesmo padrão das
    // irmãs ouvir/enviarDevolutivaPorId; callers são só telas admin.
    const { requireAdminAction } = await import('@/lib/auth/action-context');
    await requireAdminAction();
    if (!colabId) return { error: 'colabId obrigatório' };
    const colab = await fetchColabPorId(colabId);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _baixarPdfParaColab(colab);
  } catch (err) {
    console.error('[baixarRelatorioComportamentalPdfPorId]', err);
    return { error: err?.message || 'Erro ao gerar PDF' };
  }
}

// ── Devolutiva em voz (áudio) ───────────────────────────────────────────────

const AUDIO_BUCKET = 'relatorios-pdf'; // bucket privado (signed URL), mesmo dos PDFs

/** Garante report_texts (cache 30d ou gera) e devolve { raw, texts }. */
async function _ensureTextos(colab: any) {
  const raw = mapSupabaseToCISRawData(colab);
  let texts = null;
  if (isFreshReportCache(colab.report_texts, colab.report_generated_at)) texts = colab.report_texts;
  if (!texts) {
    texts = await gerarTextosLLM(raw, colab.empresa_id);
    const sb = createSupabaseAdmin();
    const reportGeneratedAt = await persistReportTexts(sb, colab.id, texts, colab.empresa_id);
    colab.report_texts = texts;
    colab.report_generated_at = reportGeneratedAt;
    colab.comportamental_audio_path = null;
    colab.comportamental_audio_at = null;
  }
  return { raw, texts };
}

/**
 * Gera (roteiro IA → TTS Gemini → MP3) e salva a devolutiva em voz no bucket
 * privado; persiste comportamental_audio_path. Reusa se já houver áudio < 30d
 * (a menos de force). Aceita colab inteiro, colabId ou cai no email da sessão.
 *
 * NÃO exportado: é helper interno das actions gatadas/de sessão abaixo. Antes era
 * export 'use server' (endpoint client-reachable) e o `colabId` do cliente batia
 * em fetchColabPorId (sem filtro de empresa) → IDOR cross-tenant + abuso de TTS.
 */
async function gerarEsalvarDevolutivaComportamental({ colab: inputColab, colabId, force }: any = {}) {
  try {
    let colab: any = inputColab;
    if (!colab && !colabId) {
      const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
      const email = await getAuthenticatedEmailFromAction();
      if (email) colab = await findColabByEmail(email, CIS_COLUMNS);
    }
    if (!colab && colabId) colab = await fetchColabPorId(colabId);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const hasDISC = colab.perfil_dominante && (colab.d_natural || colab.i_natural || colab.s_natural || colab.c_natural);
    if (!hasDISC) return { error: 'Mapeamento comportamental ainda não realizado' };

    // Reusa cache de áudio se válido
    if (
      !force
      && isFreshReportCache(colab.report_texts, colab.report_generated_at)
      && colab.comportamental_audio_path
      && isArtifactCurrent(colab.comportamental_audio_at, colab.report_generated_at)
    ) {
      const age = Date.now() - new Date(colab.comportamental_audio_at).getTime();
      if (age < CACHE_MAX_AGE_MS) return { success: true, path: colab.comportamental_audio_path, cached: true };
    }

    const { raw, texts } = await _ensureTextos(colab);

    // Núcleo único (`lib/relatorio-comportamental/devolutiva-audio`): o MESMO
    // trabalho roda aqui, sob demanda, e na pré-geração que o `after()` do DISC
    // dispara. Duas implementações do mesmo áudio virariam gêmeos divergentes.
    const { gerarDevolutivaEmAudioCore } = await import('@/lib/relatorio-comportamental/devolutiva-audio');
    return await gerarDevolutivaEmAudioCore({ colab, raw, texts, sb: createSupabaseAdmin(), sobDemanda: true });
  } catch (err) {
    console.error('[gerarEsalvarDevolutivaComportamental]', err);
    return { error: err?.message || 'Erro ao gerar devolutiva em voz' };
  }
}

/** Garante o áudio e devolve uma signed URL (default 5 min; mais longa p/ WhatsApp). */
async function _devolutivaSignedUrl(colab: any, ttlSec = 300) {
  let path = colab.comportamental_audio_path;
  let stale = true;
  if (
    path
    && isFreshReportCache(colab.report_texts, colab.report_generated_at)
    && isArtifactCurrent(colab.comportamental_audio_at, colab.report_generated_at)
  ) {
    stale = (Date.now() - new Date(colab.comportamental_audio_at).getTime()) >= CACHE_MAX_AGE_MS;
  }
  if (!path || stale) {
    const r: any = await gerarEsalvarDevolutivaComportamental({ colab });
    if (r.error) return { error: r.error };
    path = r.path;
  }
  const sb = createSupabaseAdmin();
  const slug = String(colab.nome_completo || 'devolutiva').replace(/\s+/g, '-').toLowerCase();
  const { data: signed, error } = await sb.storage.from(AUDIO_BUCKET)
    .createSignedUrl(path, ttlSec, { download: `vertho-devolutiva-${slug}.mp3` });
  if (error) return { error: `Erro ao gerar link: ${error.message}` };
  return { success: true, url: signed.signedUrl, filename: `vertho-devolutiva-${slug}.mp3` };
}

/** Gera/recupera a devolutiva e devolve URL para tocar no painel (colab da sessão). */
export async function ouvirDevolutivaComportamental() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _devolutivaSignedUrl(colab, 600);
  } catch (err) {
    console.error('[ouvirDevolutivaComportamental]', err);
    return { error: err?.message || 'Erro ao gerar devolutiva' };
  }
}

/** Áudio do perfil de um liderado/RH/tutor, após gate de posse do alvo. */
export async function ouvirDevolutivaComportamentalGestor(colaboradorId: string) {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    if (!colaboradorId) return { error: 'Colaborador inválido' };
    const resolved = await resolveColaboradorGestor(email, colaboradorId);
    if (resolved.error) return { error: resolved.error };
    return await _devolutivaSignedUrl(resolved.colab, 600);
  } catch (err) {
    console.error('[ouvirDevolutivaComportamentalGestor]', err);
    return { error: err?.message || 'Erro ao gerar devolutiva' };
  }
}

// ── Variantes ADMIN (por colabId) ───────────────────────────────────────────

/** Admin: gera/recupera a devolutiva de um colaborador e devolve URL p/ tocar. */
export async function ouvirDevolutivaPorId(colabId: string) {
  try {
    const { requireAdminAction } = await import('@/lib/auth/action-context');
    await requireAdminAction();
    if (!colabId) return { error: 'colabId obrigatório' };
    const colab = await fetchColabPorId(colabId);
    if (!colab) return { error: 'Colaborador não encontrado' };
    return await _devolutivaSignedUrl(colab, 600);
  } catch (err) {
    console.error('[ouvirDevolutivaPorId]', err);
    return { error: err?.message || 'Erro ao gerar devolutiva' };
  }
}

/** Admin: envia a devolutiva por WhatsApp ao telefone de um colaborador. */
export async function enviarDevolutivaWhatsAppPorId(colabId: string) {
  try {
    const { requireAdminAction } = await import('@/lib/auth/action-context');
    await requireAdminAction('assessments.dispatch');
    if (!colabId) return { error: 'colabId obrigatório' };
    const colab = await fetchColabPorId(colabId);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const sb = createSupabaseAdmin();
    const { data: contato } = await sb.from('colaboradores')
      .select('telefone, whatsapp').eq('id', colabId).maybeSingle();
    const fone = contato?.telefone || contato?.whatsapp;
    if (!fone) return { error: 'Telefone não cadastrado para envio por WhatsApp' };

    const r = await _devolutivaSignedUrl(colab, 3600);
    if (r.error) return { error: r.error };

    const { enviarAudio } = await import('@/actions/whatsapp');
    const env = await enviarAudio(fone, r.url, true);
    if (!env.success) return { error: env.error || 'Falha no envio' };
    return { success: true };
  } catch (err) {
    console.error('[enviarDevolutivaWhatsAppPorId]', err);
    return { error: err?.message || 'Erro ao enviar por WhatsApp' };
  }
}

/** Envia a devolutiva em voz por WhatsApp para o telefone do colab da sessão. */
export async function enviarDevolutivaWhatsApp() {
  try {
    const { getAuthenticatedEmailFromAction } = await import('@/lib/auth/action-context');
    const email = await getAuthenticatedEmailFromAction();
    if (!email) return { error: 'Não autenticado' };
    const colab = await findColabByEmail(email, CIS_COLUMNS);
    if (!colab) return { error: 'Colaborador não encontrado' };

    // Telefone (CIS_COLUMNS não traz telefone) — busca direto.
    const sb = createSupabaseAdmin();
    const { data: contato } = await sb.from('colaboradores')
      .select('telefone, whatsapp').eq('id', colab.id).maybeSingle();
    const fone = contato?.telefone || contato?.whatsapp;
    if (!fone) return { error: 'Telefone não cadastrado para envio por WhatsApp' };

    // Signed URL com TTL longo para a Z-API conseguir baixar o arquivo.
    const r = await _devolutivaSignedUrl(colab, 3600);
    if (r.error) return { error: r.error };

    const { enviarAudio } = await import('@/actions/whatsapp');
    const env = await enviarAudio(fone, r.url, true);
    if (!env.success) return { error: env.error || 'Falha no envio' };
    return { success: true };
  } catch (err) {
    console.error('[enviarDevolutivaWhatsApp]', err);
    return { error: err?.message || 'Erro ao enviar por WhatsApp' };
  }
}
