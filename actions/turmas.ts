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

/**
 * Membros de uma turma, para a tela de composição.
 *
 * Traz o estado individual junto (respondeu? avaliado? tem trilha?) porque a
 * pergunta do operador ao mover alguém é sempre "e o que essa pessoa já fez?".
 */
const MembrosInput = z.object({ empresaId: z.string().min(1), turmaId: z.string().min(1) });

const _listarMembrosTurma = protectedAction('content.manage', MembrosInput, async (ctx, { empresaId, turmaId }) => {
  await assertTenantAccessAction(ctx, empresaId);
  const sb = await requireAdminSupabase();

  const { data: membros } = await sb.from('turma_membros')
    .select('colaborador_id, entrou_em')
    .eq('empresa_id', empresaId).eq('turma_id', turmaId).eq('status', TURMA_MEMBRO.ATIVO);
  const ids = (membros || []).map((m: any) => m.colaborador_id);
  if (!ids.length) return { pessoas: [] as any[] };

  const [colabsRes, respostasRes, trilhasRes] = await Promise.all([
    sb.from('colaboradores').select('id, nome_completo, cargo, email').eq('empresa_id', empresaId).in('id', ids),
    sb.from('respostas').select('colaborador_id, nivel_ia4').eq('empresa_id', empresaId).in('colaborador_id', ids),
    sb.from('trilhas').select('colaborador_id').eq('empresa_id', empresaId).in('colaborador_id', ids),
  ]);
  const comResposta = new Set<string>(), comIa4 = new Set<string>();
  for (const r of respostasRes.data || []) {
    if (!r.colaborador_id) continue;
    comResposta.add(r.colaborador_id);
    if (r.nivel_ia4 !== null && r.nivel_ia4 !== undefined) comIa4.add(r.colaborador_id);
  }
  const comTrilha = new Set<string>((trilhasRes.data || []).map((t: any) => t.colaborador_id));
  const entradaDe = new Map<string, string>((membros || []).map((m: any) => [m.colaborador_id, m.entrou_em]));

  const pessoas = (colabsRes.data || []).map((c: any) => ({
    id: c.id, nome: c.nome_completo, cargo: c.cargo, email: c.email,
    entrouEm: entradaDe.get(c.id) || null,
    respondeu: comResposta.has(c.id), avaliado: comIa4.has(c.id), temTrilha: comTrilha.has(c.id),
  })).sort((a: any, b: any) => String(a.nome || '').localeCompare(String(b.nome || '')));

  return { pessoas };
});
export async function listarMembrosTurma(input: z.infer<typeof MembrosInput>) {
  return _listarMembrosTurma(input);
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

// A constante NÃO pode ser reexportada daqui: este arquivo é `'use server'`, e
// ali todo export tem de ser função async — um `export const` derruba o MÓDULO
// INTEIRO em runtime ("A 'use server' file can only export async functions,
// found object"), levando junto quem o importa. Quem precisa da lista importa
// de `@/lib/status`, que é onde ela mora (e é o que todos os call-sites já fazem).
