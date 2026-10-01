'use server';

/**
 * Fluxo completo (IA4 → blueprint → auditoria → PDI → trilha → Gestor/RH), disparado por UM botão depois que o
 * admin definiu as competências foco. Esta action é a PRÉVIA (somente leitura): quem está pronto, quem está
 * bloqueado e por quê, e a faixa de custo — antes de gastar qualquer coisa.
 *
 * Todo export de arquivo 'use server' é um endpoint HTTP: o escopo chega do CLIENTE, então é validado em runtime
 * (zod) e a regra de turma é a MESMA das demais ações em lote (`idsDoEscopoOuFalhar`, fail-closed com 2+ turmas).
 * A coleta e o cálculo vivem em `lib/pipeline-fluxo` (headless), para a orquestração de servidor reusar.
 */
import { z } from 'zod';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { tenantDb } from '@/lib/tenant-db';
import { idsDoEscopoOuFalhar, mensagemEscopoObrigatorio } from '@/lib/turmas/escopo';
import { coletarEntradaPrevia } from '@/lib/pipeline-fluxo/coletar';
import { montarPreviaFluxo, type PreviaFluxo } from '@/lib/pipeline-fluxo/previa';

const EntradaSchema = z.object({
  empresaId: z.string().min(1),
  turmaId: z.string().min(1).nullish(),
  empresaInteiraJustificativa: z.string().max(500).nullish(),
  cargos: z.array(z.string().min(1).max(200)).max(200).nullish(),
});

export type PreviaFluxoResult =
  | { success: true; previa: PreviaFluxo; cargosFiltrados: string[] }
  | { success: false; error: string; code?: 'ESCOPO_OBRIGATORIO' };

export async function previaFluxoCompleto(input: z.infer<typeof EntradaSchema>): Promise<PreviaFluxoResult> {
  await requireAdminAction('ai.audit.regenerate');
  const parsed = EntradaSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Entrada inválida' };
  const { empresaId, turmaId, empresaInteiraJustificativa, cargos } = parsed.data;

  try {
    const sb = await requireAdminSupabase('ai.audit.regenerate');
    let permitidos: Set<string> | null;
    try {
      permitidos = await idsDoEscopoOuFalhar(sb, empresaId, { turmaId: turmaId || null, empresaInteiraJustificativa: empresaInteiraJustificativa || null });
    } catch (e) {
      const msg = mensagemEscopoObrigatorio(e);
      if (msg) return { success: false, error: msg, code: 'ESCOPO_OBRIGATORIO' };
      throw e;
    }

    const coleta = await coletarEntradaPrevia(tenantDb(empresaId), { permitidos, cargos: cargos || undefined });
    if (coleta.error || !coleta.entrada) return { success: false, error: coleta.error || 'Falha ao coletar o estado da empresa' };
    return { success: true, previa: montarPreviaFluxo(coleta.entrada), cargosFiltrados: cargos || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro ao montar a prévia' };
  }
}
