'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { assertBlocoOnline } from '@/lib/blocos-offline';

/**
 * Funnel dedicado pra os eventos bett_*. Separado do funnel do radar
 * principal (/admin/radar/funnel) pra não embolar com leads orgânicos.
 *
 * Etapas do funil radarbett:
 *   1. home_view             — abriu a landing
 *   2. search_focus          — focou no campo de busca
 *   3. search_submit         — selecionou um resultado de busca
 *   4. result_view           — chegou na página de escola/município
 *   5. glimpse_view          — viu cards bloqueados (com blur)
 *   6. unlock_click          — clicou em "Liberar"
 *   7. lead_open             — abriu o modal
 *   8. lead_step1            — completou passo 1 do modal
 *   9. lead_step2            — completou passo 2 (envio)
 *  10. lead_submit           — sucesso de envio
 *  11. schedule_click / wpp  — engajamento pós-lead
 */

export type BettFunnelData = {
  periodo: { de: string; ate: string; dias: number };
  etapas: Array<{
    chave: string;
    label: string;
    valor: number;
    taxa_conversao: number | null; // % do passo anterior
  }>;
  cliques_secundarios: {
    schedule: number;
    whatsapp: number;
    public_cta: number;
    persona_click: number;
    example_click: number;
    sticky_click: number;
  };
  top_buscados: Array<{ scope: string; scopeId: string; total: number }>;
  resumo: {
    visitantes: number;
    leads: number;
    conversao_pct: number;
  };
};

export async function loadFunnelBett(dias: number = 30): Promise<BettFunnelData> {
  assertBlocoOnline('radarbett');
  await requireAdminAction();
  const sb = await requireAdminSupabase();

  const ate = new Date();
  const de = new Date(ate.getTime() - dias * 24 * 3600 * 1000);

  // Pega contagem de cada tipo bett_*
  const tipos = [
    'bett_home_view', 'bett_search_focus', 'bett_search_submit',
    'bett_result_view', 'bett_glimpse_view', 'bett_unlock_click',
    'bett_lead_open', 'bett_lead_step1', 'bett_lead_step2', 'bett_lead_submit',
    'bett_schedule_click', 'bett_wpp_click',
    'bett_public_cta', 'bett_persona_click', 'bett_example_click',
    'bett_sticky_click',
  ];

  const counts: Record<string, number> = {};
  for (const tipo of tipos) {
    const { count } = await sb
      .from('diag_eventos')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', tipo)
      .eq('is_bot', false)
      .gte('criado_em', de.toISOString());
    counts[tipo] = count || 0;
  }

  // Etapas do funil principal (ordenadas)
  const etapasOrdem = [
    { chave: 'home_view',    label: 'Visitas (home)',     count: counts.bett_home_view },
    { chave: 'search_focus', label: 'Focou na busca',     count: counts.bett_search_focus },
    { chave: 'search_submit',label: 'Selecionou busca',   count: counts.bett_search_submit },
    { chave: 'result_view',  label: 'Viu resultado',      count: counts.bett_result_view },
    { chave: 'glimpse_view', label: 'Viu glimpse (blur)', count: counts.bett_glimpse_view },
    { chave: 'unlock_click', label: 'Clicou em liberar',  count: counts.bett_unlock_click },
    { chave: 'lead_open',    label: 'Abriu modal lead',   count: counts.bett_lead_open },
    { chave: 'lead_step1',   label: 'Completou passo 1',  count: counts.bett_lead_step1 },
    { chave: 'lead_step2',   label: 'Completou passo 2',  count: counts.bett_lead_step2 },
    { chave: 'lead_submit',  label: 'Lead enviado',       count: counts.bett_lead_submit },
  ];

  const etapas = etapasOrdem.map((e, i) => {
    const anterior = i > 0 ? etapasOrdem[i - 1].count : null;
    return {
      chave: e.chave,
      label: e.label,
      valor: e.count,
      taxa_conversao: anterior && anterior > 0 ? (e.count / anterior) * 100 : null,
    };
  });

  // Top buscados (a partir de search_submit + result_view com scope_id)
  const { data: buscas } = await sb
    .from('diag_eventos')
    .select('scope_type, scope_id')
    .eq('tipo', 'bett_search_submit')
    .eq('is_bot', false)
    .gte('criado_em', de.toISOString())
    .not('scope_id', 'is', null);

  const buscaMap = new Map<string, number>();
  for (const b of (buscas || [])) {
    if (!b.scope_type || !b.scope_id) continue;
    const k = `${b.scope_type}|${b.scope_id}`;
    buscaMap.set(k, (buscaMap.get(k) || 0) + 1);
  }
  const topBuscados = [...buscaMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, total]) => {
      const [scope, scopeId] = k.split('|');
      return { scope, scopeId, total };
    });

  return {
    periodo: { de: de.toISOString(), ate: ate.toISOString(), dias },
    etapas,
    cliques_secundarios: {
      schedule:     counts.bett_schedule_click,
      whatsapp:     counts.bett_wpp_click,
      public_cta:   counts.bett_public_cta,
      persona_click:counts.bett_persona_click,
      example_click:counts.bett_example_click,
      sticky_click: counts.bett_sticky_click,
    },
    top_buscados: topBuscados,
    resumo: {
      visitantes: counts.bett_home_view,
      leads: counts.bett_lead_submit,
      conversao_pct: counts.bett_home_view > 0
        ? (counts.bett_lead_submit / counts.bett_home_view) * 100
        : 0,
    },
  };
}
