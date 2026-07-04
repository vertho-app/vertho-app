// KPIs do dashboard comercial — funções puras sobre listas de oportunidades/
// propostas, compartilhadas entre a visão do RC e a do admin.
import { OPEN_STAGES, QUALIFIED_MIN_SCORE, STAGE_PROBABILITY, STALLED_DAYS, type PipelineStage } from './constants';
import { protectionDaysLeft } from './protection';
import type { SalesOpportunity, SalesProposal } from './types';

const val = (o: SalesOpportunity) => Number(o.estimated_value) || 0;
const isOpen = (o: SalesOpportunity) => o.status === 'open';

/** Pipeline total: soma do valor estimado das oportunidades abertas. */
export function pipelineTotal(opps: SalesOpportunity[]): number {
  return opps.filter(isOpen).reduce((s, o) => s + val(o), 0);
}

/** Pipeline qualificado: abertas, score ≥ 70 e fora de lead_identificado. */
export function pipelineQualificado(opps: SalesOpportunity[]): number {
  return opps
    .filter((o) => isOpen(o) && o.quality_score >= QUALIFIED_MIN_SCORE && o.stage !== 'lead_identificado')
    .reduce((s, o) => s + val(o), 0);
}

/** Pipeline ponderado: Σ valor × probabilidade (explícita ou default do estágio). */
export function pipelinePonderado(opps: SalesOpportunity[]): number {
  return opps.filter(isOpen).reduce((s, o) => {
    const p = o.probability != null ? Number(o.probability) : (STAGE_PROBABILITY[o.stage] ?? 0);
    return s + val(o) * p;
  }, 0);
}

/** Oportunidades sem próxima ação (ou com ação vencida). */
export function oportunidadesSemProximaAcao(opps: SalesOpportunity[], today = new Date()): SalesOpportunity[] {
  const hoje = today.toISOString().slice(0, 10);
  return opps.filter((o) => isOpen(o) && (!o.next_action || !o.next_action_date || o.next_action_date < hoje));
}

/** Oportunidades paradas: abertas sem movimentação há 15+ dias. */
export function oportunidadesParadas(opps: SalesOpportunity[], today = new Date()): SalesOpportunity[] {
  const cutoff = today.getTime() - STALLED_DAYS * 24 * 60 * 60 * 1000;
  return opps.filter((o) => isOpen(o) && new Date(o.updated_at).getTime() < cutoff);
}

/** Proteções vencendo em ≤ 15 dias (abertas). */
export function protecoesVencendo(opps: SalesOpportunity[], today = new Date()): SalesOpportunity[] {
  return opps.filter((o) => {
    if (!isOpen(o)) return false;
    const left = protectionDaysLeft(o.protection_end_date, today);
    return left !== null && left >= 0 && left <= 15;
  });
}

/** Receita contratada no trimestre corrente (propostas aceitas). */
export function receitaContratadaTrimestre(proposals: SalesProposal[], today = new Date()): number {
  const q = Math.floor(today.getMonth() / 3);
  const qStart = new Date(today.getFullYear(), q * 3, 1).getTime();
  return proposals
    .filter((p) => p.status === 'accepted' && new Date(p.updated_at).getTime() >= qStart)
    .reduce((s, p) => s + (Number(p.total_contract_value) || 0), 0);
}

/** Comissão estimada: propostas vivas (não perdidas/recusadas). */
export function comissaoEstimada(proposals: SalesProposal[]): number {
  return proposals
    .filter((p) => !['lost', 'rejected'].includes(p.status))
    .reduce((s, p) => s + (Number(p.estimated_total_commission) || 0), 0);
}

export type StageGroup = { stage: PipelineStage; count: number; totalValue: number; opportunities: SalesOpportunity[] };

/** Agrupa abertas por estágio na ordem canônica do funil (estágios abertos). */
export function groupByStage(opps: SalesOpportunity[]): StageGroup[] {
  const open = opps.filter(isOpen);
  return OPEN_STAGES.map((stage) => {
    const list = open.filter((o) => o.stage === stage);
    return { stage, count: list.length, totalValue: list.reduce((s, o) => s + val(o), 0), opportunities: list };
  });
}
