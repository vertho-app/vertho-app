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
import { coincidenciasDeOutrosRcs, gruposEmMaisDeUmRc, mesmoNome, type ContaComparavel } from '@/lib/sales/duplicidade';
import { revogavel } from '@/lib/sales/registro';
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
    { data: accounts, error: accErr },
  ] = await Promise.all([
    sb.from('sales_representatives').select('*').order('name'),
    sb.from('sales_opportunities')
      .select(`*, account:sales_accounts (id, legal_name, trade_name, segment, city, state, cnpj, codigo_inep),
        primary_contact:sales_contacts!sales_opportunities_primary_contact_id_fkey (id, name, role)`)
      .order('updated_at', { ascending: false }),
    sb.from('sales_proposals')
      .select('*, account:sales_accounts (id, legal_name, trade_name)')
      .order('created_at', { ascending: false }),
    sb.from('sales_accounts')
      .select('id, representante_id, legal_name, trade_name, cnpj, city, codigo_inep, created_at')
      .limit(5000),
  ]);
  if (repErr) return { success: false as const, error: repErr.message };
  if (oppErr) return { success: false as const, error: oppErr.message };
  if (propErr) return { success: false as const, error: propErr.message };
  if (accErr) return { success: false as const, error: accErr.message };

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

  // Registros na fila da vertho.ai (contrato v6, 7.1): só os que NÃO foram
  // aceitos na hora (lista de reserva, outro RC, conferência que falhou), os
  // mais antigos primeiro. `motivo` é o que mandou para a fila. O admin confere
  // a 7.3 e a 7.4 (outro RC registrou antes): o aviso de coincidência vem da
  // mesma régua do painel de duplicidade abaixo.
  const contasComparaveis = (accounts || []) as ContaComparavel[];
  const pendingRegistrations = allOpps
    .filter((o) => o.attribution_status === 'aguardando' && o.status === 'open')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((o) => {
      const conta = contasComparaveis.find((c) => c.id === o.account_id);
      const coincidencias = conta ? coincidenciasDeOutrosRcs(conta, contasComparaveis) : [];
      const acc = o.account as (SalesOpportunity['account'] & { cnpj?: string | null; codigo_inep?: string | null }) | null | undefined;
      return {
        id: o.id,
        nome: o.opportunity_name,
        repName: repName.get(o.representante_id) || '—',
        cliente: acc?.trade_name || acc?.legal_name || '—',
        cnpj: acc?.cnpj ?? null,
        inep: acc?.codigo_inep ?? null,
        motivo: o.attribution_note ?? null,
        cidade: acc?.city ?? null,
        contato: o.primary_contact ? `${o.primary_contact.name}${o.primary_contact.role ? ` (${o.primary_contact.role})` : ''}` : null,
        origem: o.origin,
        necessidade: o.identified_need,
        evidencia: o.interaction_evidence,
        created_at: o.created_at,
        outrosRcs: coincidencias.map((c) => (c.representante_id && repName.get(c.representante_id)) || '—'),
      };
    });

  // Aceitos na hora pelo portal que a vertho.ai ainda pode revogar (7.1, 10 dias).
  // `outrosRcs` aqui é pelo NOME, ignorando CNPJ e INEP: um CNPJ digitado diferente
  // para um cliente que outro RC já tem passa pela conferência, mas não por aqui.
  const aceitosNaHora = allOpps
    .filter((o) => revogavel(o))
    .sort((a, b) => String(b.attribution_decided_at).localeCompare(String(a.attribution_decided_at)))
    .map((o) => {
      const conta = contasComparaveis.find((c) => c.id === o.account_id);
      const mesmoNomeOutroRc = conta
        ? contasComparaveis.filter((c) => c.id !== conta.id && c.representante_id && c.representante_id !== conta.representante_id && mesmoNome(conta, c))
        : [];
      const acc = o.account as (SalesOpportunity['account'] & { cnpj?: string | null; codigo_inep?: string | null }) | null | undefined;
      return {
        id: o.id,
        nome: o.opportunity_name,
        repName: repName.get(o.representante_id) || '—',
        cliente: acc?.trade_name || acc?.legal_name || '—',
        cnpj: acc?.cnpj ?? null,
        inep: acc?.codigo_inep ?? null,
        motivo: null,
        cidade: acc?.city ?? null,
        contato: o.primary_contact ? `${o.primary_contact.name}${o.primary_contact.role ? ` (${o.primary_contact.role})` : ''}` : null,
        origem: o.origin,
        necessidade: o.identified_need,
        evidencia: o.interaction_evidence,
        created_at: o.created_at,
        aceitoEm: o.attribution_decided_at,
        outrosRcs: mesmoNomeOutroRc.map((c) => (c.representante_id && repName.get(c.representante_id)) || '—'),
      };
    });

  // A mesma instituição com mais de um RC (regra de 08/10: vale o primeiro
  // registro válido, e a vertho.ai decide). Ordem de cadastro dentro do grupo.
  const contasEmMaisDeUmRc = gruposEmMaisDeUmRc(contasComparaveis).map((grupo) =>
    grupo.map((c) => ({
      id: c.id,
      nome: c.trade_name || c.legal_name || '—',
      cidade: c.city,
      repName: (c.representante_id && repName.get(c.representante_id)) || '—',
      created_at: c.created_at ?? null,
    })));

  return {
    success: true as const,
    byRep,
    pendingProposals,
    pendingRegistrations,
    aceitosNaHora,
    expiringProtections,
    contasEmMaisDeUmRc,
    totals: {
      pipelineTotal: pipelineTotal(allOpps),
      pipelineQualificado: pipelineQualificado(allOpps),
      commissionExposure: comissaoEstimada(allProposals),
      pendingCount: pendingProposals.length,
      pendingRegistrationsCount: pendingRegistrations.length,
    },
  };
}
