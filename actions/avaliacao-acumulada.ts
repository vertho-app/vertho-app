'use server';

import { requireAdminAction } from '@/lib/auth/action-context';
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { gerarAvaliacaoAcumuladaCore, gerarAvaliacaoAcumuladaParcialCore } from '@/lib/season-engine/avaliacao-acumulada-core';

/**
 * Actions ADMIN da avaliação acumulada (tela de auditoria Vertho) — SEMPRE
 * gatadas, sem flag `internal` (dívida quitada do use-server-internal-allowlist:
 * em arquivo 'use server' todo export é endpoint HTTP e a flag era escolhida
 * pelo cliente — `{ empresaId: null }` pulava o gate E o recheck de tenant).
 *
 * Os AUTO-TRIGGERS com sessão de colab (rotas /api/temporada/reflection|evaluation,
 * task Trigger acumulada-piloto, simulador) NÃO passam por aqui: importam o
 * núcleo headless de lib/season-engine/avaliacao-acumulada-core.ts direto,
 * provando o tenant via `opts.empresaId` (B5).
 */
export async function gerarAvaliacaoAcumulada(trilhaId: string) {
  await requireAdminSupabase('ai.audit.regenerate');
  return gerarAvaliacaoAcumuladaCore(trilhaId);
}

export async function gerarAvaliacaoAcumuladaParcial(trilhaId: string, competenciasFiltro: string[], semFim: number) {
  await requireAdminAction('ai.audit.regenerate');
  return gerarAvaliacaoAcumuladaParcialCore(trilhaId, competenciasFiltro, semFim);
}
