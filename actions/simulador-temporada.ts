'use server';

/**
 * Simulador de temporada — camada 'use server' (gate de admin). Toda a lógica
 * vive no NÚCLEO SEM GATE `lib/season-engine/simulador-core.ts` para permitir o
 * caminho headless (piloto de custo) sem furar autorização. Aqui só: autoriza o
 * caller (platform admin) e delega ao núcleo com um client service-role.
 */

import { requireAdminSupabase } from '@/lib/admin-supabase';
import {
  simularUmaSemanaCore,
  simularTemporadaCore,
  type SimUmaSemanaParams,
} from '@/lib/season-engine/simulador-core';

export async function simularUmaSemanaSimulacao(email: string, params: SimUmaSemanaParams) {
  void email;
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return simularUmaSemanaCore(sbRaw, params);
}

export async function simularTemporadaCompleta(
  email: string,
  params: { trilhaId: string; perfilEvolucao?: string; mentorModel?: string },
) {
  void email;
  const sbRaw = await requireAdminSupabase('ai.audit.regenerate');
  return simularTemporadaCore(sbRaw, params);
}
