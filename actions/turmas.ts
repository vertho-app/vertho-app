'use server';

/**
 * Actions de TURMA — criar a safra, mover gente, ler o portfólio.
 *
 * ⚠️ Todo export aqui é endpoint HTTP (regra do repo): o `empresaId` vem do
 * CLIENTE, então cada action passa por `protectedAction` (permissão + Zod) e
 * revalida o tenant. Nada de `internal`.
 */

import { z } from 'zod';
import { protectedAction } from '@/lib/auth/protected-action';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { assertTenantAccessAction } from '@/lib/auth/action-context';
import { logAdminAction } from '@/lib/audit';
import { TURMA, TURMA_MEMBRO, TURMA_ENCERRADAS } from '@/lib/status';
import { levantarPortfolioTurmas } from '@/lib/turmas/portfolio';

const STATUS_TURMA = [
  TURMA.PLANEJADA, TURMA.DIAGNOSTICO, TURMA.TRILHAS_EM_GERACAO,
  TURMA.EM_JORNADA, TURMA.CONCLUIDA, TURMA.ARQUIVADA,
] as const;

// ── Leitura ────────────────────────────────────────────────────────────────

const EmpresaInput = z.object({ empresaId: z.string().min(1) });

const _listarTurmas = protectedAction('content.manage', EmpresaInput, async (ctx, { empresaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();
  return levantarPortfolioTurmas(sb, empresaId);
});
export async function listarTurmas(input: z.infer<typeof EmpresaInput>) {
  return _listarTurmas(input);
}

/**
 * Pessoas da empresa SEM participação ativa.
 *
 * Existe porque o bloqueio precisa ser VISÍVEL: importado sem turma não recebe
 * ação em lote nem comunicação, e proteção que ninguém vê vira gente sem
 * conteúdo sem ninguém saber — o mesmo defeito do `adiadosPorTeto`.
 */
const _listarSemTurma = protectedAction('content.manage', EmpresaInput, async (ctx, { empresaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();

  const [colabsRes, membrosRes] = await Promise.all([
    sb.from('colaboradores').select('id, nome_completo, cargo, email').eq('empresa_id', empresaId),
    sb.from('turma_membros').select('colaborador_id').eq('empresa_id', empresaId).eq('status', TURMA_MEMBRO.ATIVO),
  ]);
  const comTurma = new Set<string>((membrosRes.data || []).map((m: any) => m.colaborador_id));
  const semTurma = (colabsRes.data || []).filter((c: any) => !comTurma.has(c.id));
  return { total: semTurma.length, pessoas: semTurma };
});
export async function listarSemTurma(input: z.infer<typeof EmpresaInput>) {
  return _listarSemTurma(input);
}

// ── Escrita ────────────────────────────────────────────────────────────────

const CriarInput = z.object({
  empresaId: z.string().min(1),
  nome: z.string().min(2).max(120),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(STATUS_TURMA).optional(),
  /** Override de config da safra — validado contra a spec no resolvedor. */
  sysConfig: z.record(z.string(), z.any()).optional(),
});

const _criarTurma = protectedAction('content.manage', CriarInput, async (ctx, input) => {
  await assertTenantAccessAction(ctx, input.empresaId);
  const sb = await requireAdminSupabase();

  const { data, error } = await sb.from('turmas').insert({
    empresa_id: input.empresaId,
    nome: input.nome.trim(),
    data_inicio: input.dataInicio || null,
    status: input.status || TURMA.PLANEJADA,
    sys_config: input.sysConfig || {},
  }).select('id, nome').single();
  if (error) throw new Error(error.message);

  await logAdminAction({
    adminEmail: ctx.email, acao: 'turma.criar', empresaId: input.empresaId,
    turmaId: (data as any).id, alvo: (data as any).nome,
    detalhes: { dataInicio: input.dataInicio || null, sysConfig: input.sysConfig || {} },
  });
  return { id: (data as any).id, nome: (data as any).nome };
});
export async function criarTurma(input: z.infer<typeof CriarInput>) {
  return _criarTurma(input);
}

const EditarInput = z.object({
  empresaId: z.string().min(1),
  turmaId: z.string().min(1),
  nome: z.string().min(2).max(120).optional(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUS_TURMA).optional(),
  sysConfig: z.record(z.string(), z.any()).optional(),
});

const _editarTurma = protectedAction('content.manage', EditarInput, async (ctx, input) => {
  await assertTenantAccessAction(ctx, input.empresaId);
  const sb = await requireAdminSupabase();

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (input.nome !== undefined) patch.nome = input.nome.trim();
  if (input.dataInicio !== undefined) patch.data_inicio = input.dataInicio;
  if (input.status !== undefined) patch.status = input.status;
  if (input.sysConfig !== undefined) patch.sys_config = input.sysConfig;

  const { data, error } = await sb.from('turmas')
    .update(patch)
    .eq('id', input.turmaId)
    .eq('empresa_id', input.empresaId)    // tenant: nunca cruza empresa
    .select('id, nome').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Turma não encontrada nesta empresa');

  await logAdminAction({
    adminEmail: ctx.email, acao: 'turma.editar', empresaId: input.empresaId,
    turmaId: input.turmaId, alvo: (data as any).nome, detalhes: patch,
  });
  return { ok: true };
});
export async function editarTurma(input: z.infer<typeof EditarInput>) {
  return _editarTurma(input);
}

const MoverInput = z.object({
  empresaId: z.string().min(1),
  turmaId: z.string().min(1),
  colaboradorIds: z.array(z.string().min(1)).min(1).max(2000),
});

/**
 * Move pessoas para uma turma.
 *
 * Reentrada é **linha nova**: a participação anterior fecha com `saiu_em` e o
 * status vira `REMOVIDO`. Não se reaproveita a linha antiga — perder `entrou_em`
 * apagaria o histórico que a tabela existe para guardar.
 *
 * ⚠️ Move quem já está na turma-alvo? Não: é no-op silencioso por pessoa, para
 * que reexecutar o mesmo lote não gere participação duplicada (e o índice
 * parcial de participação ativa recusaria de qualquer jeito).
 */
const _moverParaTurma = protectedAction('content.manage', MoverInput, async (ctx, input) => {
  await assertTenantAccessAction(ctx, input.empresaId);
  const sb = await requireAdminSupabase();

  const { data: turma } = await sb.from('turmas')
    .select('id, nome').eq('id', input.turmaId).eq('empresa_id', input.empresaId).maybeSingle();
  if (!turma) throw new Error('Turma não encontrada nesta empresa');

  // Só colaboradores DESTE tenant — os ids vêm do cliente.
  const { data: colabs } = await sb.from('colaboradores')
    .select('id').eq('empresa_id', input.empresaId).in('id', input.colaboradorIds);
  const validos = (colabs || []).map((c: any) => c.id);
  if (!validos.length) throw new Error('Nenhum colaborador válido nesta empresa');

  const { data: atuais } = await sb.from('turma_membros')
    .select('id, colaborador_id, turma_id')
    .eq('empresa_id', input.empresaId)
    .eq('status', TURMA_MEMBRO.ATIVO)
    .in('colaborador_id', validos);

  const jaNaTurma = new Set<string>();
  const paraFechar: string[] = [];
  for (const m of atuais || []) {
    if (m.turma_id === input.turmaId) jaNaTurma.add(m.colaborador_id);
    else paraFechar.push(m.id);
  }

  if (paraFechar.length) {
    const { error } = await sb.from('turma_membros')
      .update({ status: TURMA_MEMBRO.REMOVIDO, saiu_em: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .in('id', paraFechar);
    if (error) throw new Error(error.message);
  }

  const novos = validos.filter((id) => !jaNaTurma.has(id));
  if (novos.length) {
    const { error } = await sb.from('turma_membros').insert(
      novos.map((id) => ({ empresa_id: input.empresaId, turma_id: input.turmaId, colaborador_id: id })),
    );
    if (error) throw new Error(error.message);
  }

  await logAdminAction({
    adminEmail: ctx.email, acao: 'turma.mover_membros', empresaId: input.empresaId,
    turmaId: input.turmaId, alvo: `${novos.length} colaborador(es)`,
    detalhes: { movidos: novos.length, jaEstavam: jaNaTurma.size, participacoesFechadas: paraFechar.length },
  });
  return { movidos: novos.length, jaEstavam: jaNaTurma.size, participacoesFechadas: paraFechar.length };
});
export async function moverParaTurma(input: z.infer<typeof MoverInput>) {
  return _moverParaTurma(input);
}

const ArquivarInput = z.object({ empresaId: z.string().min(1), turmaId: z.string().min(1) });

const _arquivarTurma = protectedAction('content.manage', ArquivarInput, async (ctx, input) => {
  await assertTenantAccessAction(ctx, input.empresaId);
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('turmas')
    .update({ status: TURMA.ARQUIVADA, updated_at: new Date().toISOString() })
    .eq('id', input.turmaId).eq('empresa_id', input.empresaId)
    .select('id, nome').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Turma não encontrada nesta empresa');

  await logAdminAction({
    adminEmail: ctx.email, acao: 'turma.arquivar', empresaId: input.empresaId,
    turmaId: input.turmaId, alvo: (data as any).nome,
  });
  return { ok: true };
});
export async function arquivarTurma(input: z.infer<typeof ArquivarInput>) {
  return _arquivarTurma(input);
}

/** Turmas que ainda recebem operação — usado pelo fail-closed das ações em lote. */
export const TURMAS_ENCERRADAS = TURMA_ENCERRADAS;
