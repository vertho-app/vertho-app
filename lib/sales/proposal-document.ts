// Modelo de dados do DOCUMENTO da proposta (cliente-facing).
//
// Fonte única consumida pela página pública /proposta/[token] E pelo PDF, para
// que os dois fiquem idênticos. Exclui de propósito TUDO que é interno: comissão
// estimada, margem, score, notas de aprovação. O cliente só vê o que é dele.
import { PRODUCT_PACKAGE_LABELS, CUSTOMER_TYPE_LABELS } from './constants';
import type { SalesProposal } from './types';

export const PROPOSAL_VALIDITY_DAYS = 15;

export type ProposalDocumentVM = {
  numero: string;
  emitidaEm: string;   // ISO
  validaAte: string;   // ISO (emitida + PROPOSAL_VALIDITY_DAYS)
  expirada: boolean;
  cliente: { nome: string; tipo: string | null };
  produto: string | null;
  escopoItens: string[];
  investimento: {
    mensal: number | null;
    meses: number | null;
    total: number | null;
    condicoesPagamento: string | null;
    descontoPercent: number | null;
  };
  notasComerciais: string | null;
  representante: { nome: string; email: string | null; telefone: string | null };
  status: string;
};

/** Constrói o VM cliente-facing a partir da proposta + conta + representante. */
export function buildProposalDocument(
  proposal: SalesProposal,
  account: { legal_name: string | null; trade_name: string | null } | null,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
): ProposalDocumentVM {
  const emitida = proposal.approved_at || proposal.created_at;
  const emitidaDate = new Date(emitida);
  const valida = new Date(emitidaDate);
  valida.setDate(valida.getDate() + PROPOSAL_VALIDITY_DAYS);

  const escopoItens = (proposal.included_scope || '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

  return {
    numero: proposal.proposal_number,
    emitidaEm: emitida,
    validaAte: valida.toISOString(),
    expirada: valida.getTime() < Date.now(),
    cliente: {
      nome: account?.trade_name || account?.legal_name || 'Cliente',
      tipo: proposal.customer_type ? (CUSTOMER_TYPE_LABELS[proposal.customer_type] || proposal.customer_type) : null,
    },
    produto: proposal.product_package
      ? (PRODUCT_PACKAGE_LABELS[proposal.product_package] || proposal.product_package)
      : null,
    escopoItens,
    investimento: {
      mensal: proposal.monthly_value,
      meses: proposal.contract_duration_months,
      total: proposal.total_contract_value,
      condicoesPagamento: proposal.payment_terms,
      descontoPercent: proposal.discount_requested,
    },
    notasComerciais: proposal.commercial_notes,
    representante: {
      nome: rep?.name || 'Representante Vertho',
      email: rep?.email ?? null,
      telefone: rep?.phone ?? null,
    },
    status: proposal.status,
  };
}
