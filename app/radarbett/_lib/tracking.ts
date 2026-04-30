'use client';

import { registrarEventoClient } from '../../radar/actions';

/**
 * Eventos de tracking do Radar Bett (landing comercial).
 * Cada evento é um "step" do funil — útil pra calcular taxas de conversão
 * por dobra. Os eventos vão pra diag_eventos via registrarEventoClient
 * (server action), que aceita um whitelist de tipos.
 *
 * Mapeamento eventos do briefing → tipos backend (diag_eventos.tipo):
 *   home_view              → bett_home_view
 *   search_focus           → bett_search_focus
 *   search_submit          → bett_search_submit
 *   result_view            → bett_result_view
 *   glimpse_view           → bett_glimpse_view
 *   unlock_diagnosis_click → bett_unlock_click
 *   example_diagnosis_click→ bett_example_click
 *   persona_card_click     → bett_persona_click
 *   lead_modal_open        → bett_lead_open
 *   lead_step_1_submit     → bett_lead_step1
 *   lead_step_2_submit     → bett_lead_step2
 *   lead_submit            → bett_lead_submit
 *   public_network_cta     → bett_public_cta
 *   schedule_call_click    → bett_schedule_click
 *   whatsapp_click         → bett_wpp_click
 *   sticky_cta_click       → bett_sticky_click
 *
 * Os tipos são adicionados ao whitelist em app/radar/actions.ts
 * (registrarEventoClient) e ao lib/radar/eventos.ts (registrarEvento).
 */

export type BettEventTipo =
  | 'bett_home_view'
  | 'bett_search_focus'
  | 'bett_search_submit'
  | 'bett_result_view'
  | 'bett_glimpse_view'
  | 'bett_unlock_click'
  | 'bett_example_click'
  | 'bett_persona_click'
  | 'bett_lead_open'
  | 'bett_lead_step1'
  | 'bett_lead_step2'
  | 'bett_lead_submit'
  | 'bett_public_cta'
  | 'bett_schedule_click'
  | 'bett_wpp_click'
  | 'bett_sticky_click';

export function track(
  tipo: BettEventTipo,
  scope?: { tipo: 'escola' | 'municipio' | 'estado'; id: string },
) {
  // registrarEventoClient é typed; aqui forçamos o cast pra aceitar
  // os novos tipos (whitelist atualizado no server).
  (registrarEventoClient as any)(tipo, scope).catch(() => {});
}
