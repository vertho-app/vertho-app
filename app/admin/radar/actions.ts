'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { importarSaebXlsx } from '@/lib/radar/saeb-importer';
import { importarIcaCsv, importarIcaXlsx } from '@/lib/radar/ica-importer';
import { importarCensoCsv } from '@/lib/radar/censo-importer';
import { importarIdebXlsx } from '@/lib/radar/ideb-importer';
import { importarSarespCsv } from '@/lib/radar/saresp-importer';
import { importarFundebCsv } from '@/lib/radar/fundeb-importer';
import { importarPddeCsv } from '@/lib/radar/pdde-importer';

async function startIngestRun(fonte: string, escopo: any, arquivoOrigem?: string) {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('diag_ingest_runs')
    .insert({ fonte, escopo, status: 'rodando', arquivo_origem: arquivoOrigem || null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'falha ao criar ingest_run');
  return data.id as string;
}

async function finishIngestRun(id: string, result: any, status: 'sucesso' | 'erro' | 'parcial') {
  const sb = createSupabaseAdmin();
  await sb
    .from('diag_ingest_runs')
    .update({
      status,
      total_processado: result.totalProcessado,
      total_sucesso: result.totalSucesso,
      total_falha: result.totalFalha,
      total_skipped: result.totalSkipped,
      erros: result.erros?.slice(0, 50) || [],
      finalizado_em: new Date().toISOString(),
    })
    .eq('id', id);

  // Refresh das materialized views após cada ingestão (best-effort).
  // Se a migration 060 não rodou ainda, só ignora silenciosamente.
  if (status === 'sucesso' || status === 'parcial') {
    try { await sb.rpc('refresh_diag_mvs'); } catch { /* MV pode não existir */ }
  }
}

export async function loadRadarStats() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const [escolas, municipios, snapshots, ica, ideb, saresp, fundeb, pdde, pddeMun, runs] = await Promise.all([
    sb.from('diag_escolas').select('codigo_inep', { count: 'exact', head: true }),
    sb.rpc('diag_count_municipios_distintos'),
    sb.from('diag_saeb_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_ica_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_ideb_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_saresp_snapshots').select('codigo_inep', { count: 'exact', head: true }),
    sb.from('diag_fundeb_repasses').select('municipio_ibge', { count: 'exact', head: true }),
    sb.from('diag_pdde_repasses').select('codigo_inep', { count: 'exact', head: true }),
    sb.from('diag_pdde_municipal').select('municipio_ibge', { count: 'exact', head: true }),
    sb.from('diag_ingest_runs').select('id, fonte, status, total_sucesso, total_falha, total_skipped, iniciado_em, arquivo_origem')
      .order('iniciado_em', { ascending: false })
      .limit(10),
  ]);
  return {
    escolas: escolas.count || 0,
    municipios: typeof municipios.data === 'number' ? municipios.data : 0,
    snapshots: snapshots.count || 0,
    ica: ica.count || 0,
    ideb: ideb.count || 0,
    saresp: saresp.count || 0,
    fundeb: fundeb.count || 0,
    pdde: (pdde.count || 0) + (pddeMun.count || 0),
    runs: runs.data || [],
  };
}

export async function ingestSaebFromUpload(arquivoBase64: string, arquivoNome: string) {
  await requireAdminAction();
  const buffer = Buffer.from(arquivoBase64, 'base64');

  const runId = await startIngestRun('saeb', { escopo: 'nacional' }, arquivoNome);

  try {
    const result = await importarSaebXlsx(buffer, { ingestRunId: runId });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro desconhecido', runId };
  }
}

export async function ingestIcaFromUpload(
  payload: { format: 'csv'; texto: string } | { format: 'xlsx'; arquivoBase64: string },
  arquivoNome: string,
) {
  await requireAdminAction();

  const runId = await startIngestRun('ica', { escopo: 'nacional', formato: payload.format }, arquivoNome);

  try {
    const result = payload.format === 'xlsx'
      ? await importarIcaXlsx(Buffer.from(payload.arquivoBase64, 'base64'), { ingestRunId: runId })
      : await importarIcaCsv(payload.texto, { ingestRunId: runId });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro desconhecido', runId };
  }
}

export async function ingestCensoFromUpload(textoCsv: string, arquivoNome: string) {
  await requireAdminAction();

  const runId = await startIngestRun(
    'censo',
    { escopo: 'nacional' },
    arquivoNome,
  );

  try {
    const result = await importarCensoCsv(textoCsv, { ingestRunId: runId });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro desconhecido', runId };
  }
}

// ── Ideb (XLSX INEP) ────────────────────────────────────────────────
export async function ingestIdebFromUpload(arquivoBase64: string, arquivoNome: string) {
  await requireAdminAction();
  const buffer = Buffer.from(arquivoBase64, 'base64');
  const runId = await startIngestRun('ideb', { fonte: 'XLSX INEP' }, arquivoNome);
  try {
    const result = await importarIdebXlsx(buffer, { ingestRunId: runId });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro', runId };
  }
}

// ── SARESP (CSV SP) ─────────────────────────────────────────────────
export async function ingestSarespFromUpload(textoCsv: string, arquivoNome: string) {
  await requireAdminAction();
  const runId = await startIngestRun('saresp', { fonte: 'CSV SP' }, arquivoNome);
  try {
    const result = await importarSarespCsv(textoCsv, { ingestRunId: runId, arquivoNome });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro', runId };
  }
}

// ── FUNDEB (CSV Tesouro) ────────────────────────────────────────────
export async function ingestFundebFromUpload(textoCsv: string, arquivoNome: string) {
  await requireAdminAction();
  const runId = await startIngestRun('fundeb', { fonte: 'CSV Tesouro' }, arquivoNome);
  try {
    const result = await importarFundebCsv(textoCsv, { ingestRunId: runId });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro', runId };
  }
}

// ── PDDE (CSV FNDE — escola ou municipal) ───────────────────────────
export async function ingestPddeFromUpload(textoCsv: string, arquivoNome: string, preferMunicipal = false) {
  await requireAdminAction();
  const runId = await startIngestRun('pdde', { fonte: 'CSV FNDE', preferMunicipal }, arquivoNome);
  try {
    const result = await importarPddeCsv(textoCsv, { ingestRunId: runId, preferMunicipal });
    const status = result.totalFalha > 0 && result.totalSucesso > 0 ? 'parcial' : result.totalFalha > 0 ? 'erro' : 'sucesso';
    await finishIngestRun(runId, result, status);
    return { success: true, runId, result };
  } catch (err: any) {
    await finishIngestRun(runId, { totalProcessado: 0, totalSucesso: 0, totalFalha: 1, totalSkipped: 0, erros: [{ key: 'fatal', msg: err?.message || String(err) }] }, 'erro');
    return { success: false, error: err?.message || 'Erro', runId };
  }
}

export async function deleteIngestRun(runId: string) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('diag_ingest_runs').delete().eq('id', runId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
