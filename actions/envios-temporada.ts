'use server';

/**
 * Religamento do envio semanal automático da trilha (Temporada).
 *
 * O cron `triggerDiario` (actions/cron-jobs.ts) já é o motor de envio: lê
 * `fase4_envios` (status='ativo') e manda pílulas/desafios por WhatsApp na
 * cadência da empresa. O que faltava era o CADASTRO em `fase4_envios` — estas
 * actions inscrevem/pausam/inspecionam os colaboradores com trilha ativa.
 *
 * Todas tenant-scoped (tenantDb) e gated (requireAdminAction).
 */

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { ENVIO } from '@/lib/status';
import { inscreverNaCadencia } from '@/lib/envios/inscricao-core';

/**
 * Inscreve em `fase4_envios` (status='ativo') os colaboradores com trilha ATIVA.
 * Se `colabIds` vier, restringe a esse subconjunto. Idempotente por
 * (empresa_id, email) — reinscrição reativa sem duplicar.
 *
 * O trabalho vive em `lib/envios/inscricao-core.ts`: abrir turma acontece também
 * fora da tela (script, janela marcada), e o caminho headless correto é chamar o
 * NÚCLEO — nunca uma flag que pule o gate desta action, que é endpoint HTTP.
 */
export async function iniciarEnviosTemporada(empresaId: string, colabIds?: string[]) {
  await requireAdminAction('content.manage');
  if (!empresaId) return { success: false, inscritos: 0, message: 'empresaId obrigatório' };
  return inscreverNaCadencia(tenantDb(empresaId), { colabIds });
}

/**
 * Pausa (status='pausado') todos os envios ATIVOS da empresa — o cron para de
 * mandar sem apagar o histórico/carimbos.
 */
export async function pausarEnviosTemporada(empresaId: string) {
  await requireAdminAction('content.manage');
  if (!empresaId) return { success: false, pausados: 0, message: 'empresaId obrigatório' };

  const tdb = tenantDb(empresaId);

  const { data: ativos, error: errSel } = await tdb.from('fase4_envios')
    .select('id')
    .eq('status', ENVIO.ATIVO);
  if (errSel) return { success: false, pausados: 0, message: errSel.message };

  const n = (ativos || []).length;
  if (!n) return { success: true, pausados: 0, message: 'Nenhum envio ativo para pausar' };

  const { error: errUp } = await tdb.from('fase4_envios')
    .update({ status: ENVIO.PAUSADO })
    .eq('status', ENVIO.ATIVO);
  if (errUp) return { success: false, pausados: 0, message: errUp.message };

  return { success: true, pausados: n, message: `${n} envio(s) pausado(s)` };
}

/**
 * Agrega os `fase4_envios` da empresa por status e por semana_atual.
 */
export async function statusEnviosTemporada(empresaId: string) {
  await requireAdminAction();
  if (!empresaId) return { success: false, message: 'empresaId obrigatório', ativos: 0, pausados: 0, concluidos: 0, porSemana: [] as { semana: number; total: number }[] };

  const tdb = tenantDb(empresaId);

  const { data, error } = await tdb.from('fase4_envios')
    .select('status, semana_atual');
  if (error) return { success: false, message: error.message, ativos: 0, pausados: 0, concluidos: 0, porSemana: [] as { semana: number; total: number }[] };

  let ativos = 0, pausados = 0, concluidos = 0;
  const semanaMap = new Map<number, number>();
  for (const e of (data || []) as any[]) {
    const st = String(e.status || '').toLowerCase();
    if (st === ENVIO.ATIVO) ativos++;
    else if (st === ENVIO.PAUSADO) pausados++;
    else if (st === ENVIO.CONCLUIDO) concluidos++;
    const sem = Number(e.semana_atual || 0);
    semanaMap.set(sem, (semanaMap.get(sem) || 0) + 1);
  }
  const porSemana = Array.from(semanaMap.entries())
    .map(([semana, total]) => ({ semana, total }))
    .sort((a, b) => a.semana - b.semana);

  return { success: true, ativos, pausados, concluidos, porSemana };
}
