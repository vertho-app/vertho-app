'use server';
/**
 * Check da IA4 (2ª IA audita a avaliação) — casca com gate de admin.
 * A lógica vive em lib/check-ia4-core.ts (núcleo sem gate, padrão headless):
 * scripts/crons chamam o núcleo direto com um client service-role.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import type { AIConfig } from './ai-client';
import { listarPendentesCheckCore, checarUmaRespostaCore } from '@/lib/check-ia4-core';

/**
 * Fila do check para a UI percorrer item a item.
 *
 * NÃO existe action de check em LOTE de propósito: `checkAvaliacoesCore` roda o
 * loop inteiro num request e a Vercel corta em 300s (medido em 11/08/2026 —
 * 14 de 72 checadas, 504 na rota /admin/empresas/[empresaId]). O lote continua
 * disponível headless, sem teto: `scripts/_run-check-ia4.ts`.
 */
export async function listarPendentesCheck(empresaId: string) {
  const sb = await requireAdminSupabase();
  if (!empresaId) return { success: false, error: 'empresaId obrigatório', data: [] };
  return listarPendentesCheckCore(sb, empresaId);
}

export async function checarUmaResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  return checarUmaRespostaCore(sb, respostaId, aiConfig);
}
