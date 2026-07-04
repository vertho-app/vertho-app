'use server';

// Portal do Representante — dashboard consolidado do admin comercial.
//
// Visão do canal: KPIs por representante (lib/sales/kpis), propostas
// aguardando aprovação e proteções comerciais vencendo. Leitura para
// qualquer platform admin (sócio incluso).
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import {
  comissaoEstimada,
  pipelinePonderado,
  pipelineQualificado,
  pipelineTotal,
  protecoesVencendo,
} from '@/lib/sales/kpis';
import { protectionDaysLeft } from '@/lib/sales/protection';
import type { SalesOpportunity, SalesProposal, SalesRepresentative } from '@/lib/sales/types';

export type RepDashboardRow = {
  rep: { id: string; name: string; region: string | null; status: SalesRepresentative['status'] };
  pipelineTotal: number;
  pipelineQualificado: number;
  pipelinePonderado: number;
  wonCount: number;
  wonValue: number;
  commissionExposure: number;
};

export async function getCommercialAdminDashboard() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();

  const [
    { data: reps, error: repErr },
    { data: opps, error: oppErr },
    { data: proposals, error: propErr },
  ] = await Promise.all([
    sb.from('sales_representatives').select('*').order('name'),
    sb.from('sales_opportunities')
      .select('*, account:sales_accounts (id, legal_name, trade_name, segment, city, state)')
      .order('updated_at', { ascending: false }),
    sb.from('sales_proposals')
      .select('*, account:sales_accounts (id, legal_name, trade_name)')
      .order('created_at', { ascending: false }),
  ]);
  if (repErr) return { success: false as const, error: repErr.message };
  if (oppErr) return { success: false as const, error: oppErr.message };
  if (propErr) return { success: false as const, error: propErr.message };

  const allReps = (reps || []) as SalesRepresentative[];
  const allOpps = (opps || []) as SalesOpportunity[];
  const allProposals = (proposals || []) as SalesProposal[];
  const repName = new Map(allReps.map((r) => [r.id, r.name]));

  // KPIs por representante (funções puras de lib/sales/kpis).
  const byRep: RepDashboardRow[] = allReps.map((rep) => {
    const repOpps = allOpps.filter((o) => o.representante_id === rep.id);
    const repProposals = allProposals.filter((p) => p.representante_id === rep.id);
    const won = repOpps.filter((o) => o.status === 'won');
    return {
      rep: { id: rep.id, name: rep.name, region: rep.region, status: rep.status },
      pipelineTotal: pipelineTotal(repOpps),
      pipelineQualificado: pipelineQualificado(repOpps),
      pipelinePonderado: pipelinePonderado(repOpps),
      wonCount: won.length,
      wonValue: won.reduce((s, o) => s + (Number(o.estimated_value) || 0), 0),
      commissionExposure: comissaoEstimada(repProposals),
    };
  });

  // Propostas aguardando aprovação interna.
  const pendingProposals = allProposals
    .filter((p) => p.status === 'submitted_for_approval')
    .map((p) => ({
      id: p.id,
      proposal_number: p.proposal_number,
      repName: repName.get(p.representante_id) || '—',
      cliente: p.account?.trade_name || p.account?.legal_name || '—',
      total: Number(p.total_contract_value) || 0,
      created_at: p.created_at,
    }));

  // Proteções comerciais vencendo em ≤ 15 dias (oportunidades abertas).
  const expiringProtections = protecoesVencendo(allOpps).map((o) => ({
    id: o.id,
    nome: o.opportunity_name,
    repName: repName.get(o.representante_id) || '—',
    cliente: o.account?.trade_name || o.account?.legal_name || '—',
    protection_end_date: o.protection_end_date,
    daysLeft: protectionDaysLeft(o.protection_end_date),
  }));

  return {
    success: true as const,
    byRep,
    pendingProposals,
    expiringProtections,
    totals: {
      pipelineTotal: pipelineTotal(allOpps),
      pipelineQualificado: pipelineQualificado(allOpps),
      commissionExposure: comissaoEstimada(allProposals),
      pendingCount: pendingProposals.length,
    },
  };
}
