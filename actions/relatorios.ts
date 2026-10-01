'use server';

import { tenantDb } from '@/lib/tenant-db';
import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import type { AIConfig } from './ai-client';
import { gerarRelatorioIndividualCore } from '@/lib/relatorios/individual-core';
import { buscarFilaPdi } from '@/lib/relatorios/fila-pdi';
import { gerarRelatorioGestorCore, gerarRelatorioRHCore, type GestorDetalhe } from '@/lib/relatorios/gestor-rh-core';

// ──────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────────────────────────────────────

export interface ServerResult<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
  detalhes?: GestorDetalhe[];
}

// DadoComp/NivelFromAssess moveram p/ lib/relatorio-individual-prompt (núcleo headless).
// Os relatórios de Gestor e RH (com os helpers de PDF/Storage) moveram p/ lib/relatorios/gestor-rh-core.

// ══════════════════════════════════════════════════════════════════════════════
// PDI INDIVIDUAL (Plano de Desenvolvimento Individual — fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════

// RELATORIO_IND_SYSTEM + montagem do prompt moveram p/ lib/relatorio-individual-prompt.

export async function gerarRelatorioIndividual(
  empresaId: string,
  colaboradorId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  // Sem escape hatch: `empresaId` vem do caller, então um bypass de gate aqui
  // leria/escreveria QUALQUER tenant. O gate roda sempre. O núcleo mora em
  // `lib/relatorios/individual-core` — mesmo código para tela e lote headless.
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const r = await gerarRelatorioIndividualCore(sbRaw, empresaId, colaboradorId, aiConfig);
  return r.success
    ? { success: true, message: r.message }
    : { success: false, error: r.error };
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO GESTOR (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════


export async function gerarRelatorioGestor(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return gerarRelatorioGestorCore(sbRaw, empresaId, aiConfig);
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIO RH (fiel ao GAS)
// ══════════════════════════════════════════════════════════════════════════════


export async function gerarRelatorioRH(
  empresaId: string,
  aiConfig: AIConfig = {},
): Promise<ServerResult> {
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return gerarRelatorioRHCore(sbRaw, empresaId, aiConfig);
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS INDIVIDUAIS EM LOTE
// ══════════════════════════════════════════════════════════════════════════════

export async function gerarRelatoriosIndividuaisLote(
  empresaId: string,
  _aiConfig: AIConfig = {},
): Promise<ServerResult<string[]>> {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    // A regra da fila vive em `lib/relatorios/fila-pdi.ts` (mesma para a prévia/orquestração do fluxo completo).
    const fila = await buscarFilaPdi(tdb);
    if ('error' in fila) return { success: false, error: fila.error };
    if (fila.semAvaliacao) return { success: false, error: 'Nenhuma avaliação encontrada' };

    const { pendentes, incompletos } = fila;
    if (!pendentes.length) {
      return {
        success: true,
        message: incompletos
          ? `Nenhum relatório pendente com avaliação completa (${incompletos} com avaliação incompleta)`
          : 'Todos os relatórios já foram gerados',
      };
    }

    return {
      success: true,
      data: pendentes,
      message: `${pendentes.length} relatórios pendentes${incompletos ? ` · ${incompletos} com avaliação incompleta ignorados` : ''}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
