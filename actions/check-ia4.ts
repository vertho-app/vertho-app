'use server';
/**
 * Check da IA4 (2ª IA audita a avaliação) — casca com gate de admin.
 * A lógica vive em lib/check-ia4-core.ts (núcleo sem gate, padrão headless):
 * scripts/crons chamam o núcleo direto com um client service-role.
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import type { AIConfig } from './ai-client';
import { checkAvaliacoesCore, checarUmaRespostaCore } from '@/lib/check-ia4-core';

export async function checkAvaliacoes(empresaId: string, aiConfig: AIConfig = {}) {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  return checkAvaliacoesCore(sb, empresaId, aiConfig);
}

export async function checarUmaResposta(respostaId: string, aiConfig: AIConfig = {}) {
  const sb = await requireAdminSupabase('ai.audit.regenerate');
  return checarUmaRespostaCore(sb, respostaId, aiConfig);
}
