'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { canUseModulo, MODULOS } from '@/lib/access-gates';
import { PULSE_TEMPLATE_VERSION, PulseMoment } from '@/lib/pulse/template';
import { assertBlocoOnline } from '@/lib/blocos-offline';

export interface PulseCiclo {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
  status: 'draft' | 't0_aberto' | 'em_jornada' | 't2_aberto' | 'encerrado';
  t0_aberto_em: string | null;
  t0_fechado_em: string | null;
  t2_aberto_em: string | null;
  t2_fechado_em: string | null;
  created_at: string;
}

export interface PulseCicloStatus extends PulseCiclo {
  t0_total: number;
  t0_completos: number;
  t2_total: number;
  t2_completos: number;
}

/**
 * Gate de módulo — o Pulso é contratado à parte (lib/access-gates/modulos.ts).
 * Aplicado em TODA action que CRIA estado do Pulso (ciclo, assignment): sem
 * contrato não se cria nada, e é isso que impede um rascunho virar entrega real
 * na home de quem não comprou.
 *
 * Leitura só (listar/status) segue liberada: esconder o que já existe não
 * protege ninguém e atrapalha a auditoria de quem foi afetado.
 */
async function assertPulsoContratado(empresaId: string): Promise<{ ok: false; error: string } | null> {
  const { requireAdminSupabase } = await import('@/lib/admin-supabase');
  const sb = await requireAdminSupabase();
  const { data: emp } = await sb
    .from('empresas').select('sys_config').eq('id', empresaId).maybeSingle();
  const gate = canUseModulo((emp?.sys_config as any) || {}, MODULOS.PULSO);
  if (!gate.allowed) return { ok: false, error: `${gate.message} ${gate.remediation}` };
  return null;
}

export async function listarCiclos(empresaId: string): Promise<PulseCicloStatus[]> {
  assertBlocoOnline('pulso');
  await requireAdminAction();
  const tdb = tenantDb(empresaId);
  const { data: ciclos } = await tdb.from('pulse_ciclos')
    .select('*').order('created_at', { ascending: false });
  if (!ciclos?.length) return [];

  const ids = ciclos.map((c: any) => c.id);
  const { data: assignments } = await tdb.from('pulse_assignments')
    .select('ciclo_id, pulse_moment, status').in('ciclo_id', ids);

  return ciclos.map((c: any) => {
    const ass = (assignments || []).filter((a: any) => a.ciclo_id === c.id);
    const t0 = ass.filter((a: any) => a.pulse_moment === 'T0');
    const t2 = ass.filter((a: any) => a.pulse_moment === 'T2');
    return {
      ...c,
      t0_total: t0.length,
      t0_completos: t0.filter((a: any) => a.status === 'completed').length,
      t2_total: t2.length,
      t2_completos: t2.filter((a: any) => a.status === 'completed').length,
    };
  });
}

export async function criarCiclo(
  empresaId: string,
  input: { nome: string; descricao?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  await requireAdminAction('assessments.dispatch');
  const semModulo = await assertPulsoContratado(empresaId);
  if (semModulo) return semModulo;
  const tdb = tenantDb(empresaId);
  if (!input.nome?.trim()) return { ok: false, error: 'Nome obrigatório' };
  const { data, error } = await tdb.from('pulse_ciclos')
    .insert({ nome: input.nome.trim(), descricao: input.descricao || null, status: 'draft' })
    .select('id').single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as any).id };
}

export async function editarCiclo(
  empresaId: string,
  cicloId: string,
  input: { nome: string; descricao?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  await requireAdminAction('assessments.dispatch');
  const tdb = tenantDb(empresaId);
  const nome = input.nome?.trim();
  if (!nome) return { ok: false, error: 'Nome obrigatório' };

  const { data: ciclo } = await tdb.from('pulse_ciclos')
    .select('id').eq('id', cicloId).maybeSingle();
  if (!ciclo) return { ok: false, error: 'Ciclo não encontrado' };

  const { error } = await tdb.from('pulse_ciclos')
    .update({ nome, descricao: input.descricao?.trim() || null })
    .eq('id', cicloId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function excluirCiclo(
  empresaId: string,
  cicloId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  await requireAdminAction('assessments.dispatch');
  const tdb = tenantDb(empresaId);

  const { data: ciclo } = await tdb.from('pulse_ciclos')
    .select('id').eq('id', cicloId).maybeSingle();
  if (!ciclo) return { ok: false, error: 'Ciclo não encontrado' };

  const { error } = await tdb.from('pulse_ciclos')
    .delete().eq('id', cicloId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cria assignments de T0 ou T2 pra TODOS os colaboradores ativos da empresa
 * (excluindo platform admins externos). Idempotente — usa UK pra ignorar
 * duplicatas via upsert com `onConflict: 'ciclo_id,colaborador_id,pulse_moment'`.
 *
 * Marca o ciclo como `t0_aberto` ou `t2_aberto` e seta o timestamp respectivo.
 */
export async function dispararPulso(
  empresaId: string,
  cicloId: string,
  pulseMoment: PulseMoment,
  opts?: { dueDays?: number; cargoFilter?: string },
): Promise<{ ok: true; criados: number; pulados: number } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  await requireAdminAction('assessments.dispatch');
  const semModulo = await assertPulsoContratado(empresaId);
  if (semModulo) return semModulo;
  const tdb = tenantDb(empresaId);

  const { data: ciclo } = await tdb.from('pulse_ciclos').select('id, status').eq('id', cicloId).single();
  if (!ciclo) return { ok: false, error: 'Ciclo não encontrado' };

  if (pulseMoment === 'T0' && !['draft', 't0_aberto'].includes((ciclo as any).status)) {
    return { ok: false, error: 'T0 só pode ser disparado em ciclo rascunho ou T0 aberto' };
  }
  if (pulseMoment === 'T2' && !['em_jornada', 't2_aberto'].includes((ciclo as any).status)) {
    return { ok: false, error: 'T2 só pode ser disparado após o fechamento do T0' };
  }

  // Colabs elegíveis (exclui internos @vertho.ai)
  let q = tdb.from('colaboradores')
    .select('id, role, cargo')
    .neq('role', 'tutor')
    .not('email', 'ilike', '%@vertho.ai');
  const { data: colabs } = await q;
  if (!colabs?.length) return { ok: false, error: 'Nenhum colaborador elegível' };

  const filtrados = opts?.cargoFilter
    ? (colabs as any[]).filter(c => c.cargo === opts.cargoFilter)
    : (colabs as any[]);

  const dueDate = opts?.dueDays
    ? new Date(Date.now() + opts.dueDays * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : null;

  const payload = filtrados.map((c: any) => ({
    ciclo_id: cicloId,
    colaborador_id: c.id,
    pulse_moment: pulseMoment,
    template_version: PULSE_TEMPLATE_VERSION,
    due_date: dueDate,
    status: 'pending',
  }));

  const { count: existentes } = await tdb.from('pulse_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('ciclo_id', cicloId)
    .eq('pulse_moment', pulseMoment)
    .in('colaborador_id', filtrados.map((c: any) => c.id));

  // Insert ignorando conflitos via upsert sem update (manter o existente)
  const { error } = await tdb.from('pulse_assignments').upsert(payload, {
    onConflict: 'ciclo_id,colaborador_id,pulse_moment',
    ignoreDuplicates: true,
  });
  if (error) return { ok: false, error: error.message };

  // Update status do ciclo
  const novoStatus = pulseMoment === 'T0' ? 't0_aberto' : 't2_aberto';
  const campoTs = pulseMoment === 'T0' ? 't0_aberto_em' : 't2_aberto_em';
  await tdb.from('pulse_ciclos')
    .update({ status: novoStatus, [campoTs]: new Date().toISOString() })
    .eq('id', cicloId);

  return { ok: true, criados: Math.max(0, payload.length - (existentes || 0)), pulados: existentes || 0 };
}

export async function fecharMomento(
  empresaId: string,
  cicloId: string,
  pulseMoment: PulseMoment,
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  await requireAdminAction('assessments.dispatch');
  const tdb = tenantDb(empresaId);
  const { data: ciclo } = await tdb.from('pulse_ciclos')
    .select('status').eq('id', cicloId).maybeSingle();
  if (!ciclo) return { ok: false, error: 'Ciclo não encontrado' };
  if (pulseMoment === 'T0' && (ciclo as any).status !== 't0_aberto') {
    return { ok: false, error: 'T0 não está aberto' };
  }
  if (pulseMoment === 'T2' && (ciclo as any).status !== 't2_aberto') {
    return { ok: false, error: 'T2 não está aberto' };
  }
  const campoTs = pulseMoment === 'T0' ? 't0_fechado_em' : 't2_fechado_em';
  const novoStatus = pulseMoment === 'T0' ? 'em_jornada' : 'encerrado';
  const { error } = await tdb.from('pulse_ciclos')
    .update({ [campoTs]: new Date().toISOString(), status: novoStatus })
    .eq('id', cicloId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function listarAssignmentsCiclo(empresaId: string, cicloId: string) {
  assertBlocoOnline('pulso');
  await requireAdminAction();
  const tdb = tenantDb(empresaId);
  const { data } = await tdb.from('pulse_assignments')
    .select('id, pulse_moment, status, completed_at, due_date, colaborador_id')
    .eq('ciclo_id', cicloId);
  if (!data?.length) return [];

  const colabIds = [...new Set(data.map((a: any) => a.colaborador_id))];
  const { data: colabs } = await tdb.from('colaboradores')
    .select('id, nome_completo, email, cargo, area_depto').in('id', colabIds);
  const map = new Map((colabs || []).map((c: any) => [c.id, c]));

  return (data as any[]).map(a => ({ ...a, colaborador: map.get(a.colaborador_id) || null }));
}
