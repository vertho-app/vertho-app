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
import { TRILHA, ENVIO } from '@/lib/status';

/** Data de hoje em YYYY-MM-DD (UTC). */
function hojeYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Inscreve em `fase4_envios` (status='ativo') os colaboradores com trilha ATIVA.
 * Se `colabIds` vier, restringe a esse subconjunto. Idempotente por
 * (empresa_id, email) — reinscrição reativa sem duplicar.
 */
export async function iniciarEnviosTemporada(empresaId: string, colabIds?: string[]) {
  await requireAdminAction('content.manage');
  if (!empresaId) return { success: false, inscritos: 0, message: 'empresaId obrigatório' };

  const tdb = tenantDb(empresaId);

  // Colaboradores com trilha ativa (a trilha carrega o colaborador_id).
  const { data: trilhas, error: errTrilhas } = await tdb.from('trilhas')
    .select('colaborador_id')
    .eq('status', TRILHA.ATIVA);
  if (errTrilhas) return { success: false, inscritos: 0, message: errTrilhas.message };

  let idsAtivos: string[] = Array.from(new Set(
    (trilhas || []).map((t: any) => t.colaborador_id).filter(Boolean) as string[],
  ));
  if (colabIds?.length) {
    const filtro = new Set(colabIds);
    idsAtivos = idsAtivos.filter((id) => filtro.has(id));
  }
  if (!idsAtivos.length) {
    return { success: true, inscritos: 0, message: 'Nenhum colaborador com trilha ativa para inscrever' };
  }

  // Dados dos colaboradores p/ montar o registro de envio.
  const { data: colabs, error: errColabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo, whatsapp')
    .in('id', idsAtivos);
  if (errColabs) return { success: false, inscritos: 0, message: errColabs.message };

  const hoje = hojeYMD();
  const rows = (colabs || [])
    .filter((c: any) => c.email) // fase4_envios.email é NOT NULL
    .map((c: any) => ({
      colaborador_id: c.id,
      email: c.email,
      nome: c.nome_completo || null,
      cargo: c.cargo || null,
      whatsapp: c.whatsapp || null,
      data_inicio: hoje,
      semana_atual: 1,
      status: ENVIO.ATIVO, // MINÚSCULO — a query do cron filtra .eq('status','ativo')
    }));

  if (!rows.length) {
    return { success: true, inscritos: 0, message: 'Nenhum colaborador elegível (sem e-mail)' };
  }

  // upsert por (empresa_id, email) — empresa_id é injetado pelo tenantDb.
  const { error: errUp } = await tdb.from('fase4_envios')
    .upsert(rows, { onConflict: 'empresa_id,email' });
  if (errUp) return { success: false, inscritos: 0, message: errUp.message };

  return { success: true, inscritos: rows.length, message: `${rows.length} colaborador(es) inscrito(s) no envio semanal` };
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
