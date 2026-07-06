// Modelo de dados do DOCUMENTO da proposta (cliente-facing).
//
// Fonte única consumida pela página pública /proposta/[token] E pelo PDF, para
// que os dois fiquem idênticos. Exclui de propósito TUDO que é interno: comissão
// estimada, margem, score, notas de aprovação. O cliente só vê o que é dele.
import { PRODUCT_PACKAGE_LABELS, CUSTOMER_TYPE_LABELS } from './constants';
import type { SalesProposal } from './types';

export const PROPOSAL_VALIDITY_DAYS = 30;

export type ProposalDocumentVM = {
  numero: string;
  emitidaEm: string;   // ISO
  validaAte: string;   // ISO (emitida + PROPOSAL_VALIDITY_DAYS)
  expirada: boolean;
  cliente: { nome: string; tipo: string | null };
  contexto: string | null;        // dor/contexto (necessidade da oportunidade)
  produto: string | null;
  escopoItens: string[];
  investimento: {
    mensal: number | null;
    meses: number | null;
    total: number | null;
    condicoesPagamento: string | null;
    descontoPercent: number | null;
  };
  naoIncluso: string[];           // limites do escopo (padrão)
  premissas: string[];            // padrão
  cronograma: { fase: string; descricao: string }[]; // padrão
  proximosPassos: string[];       // padrão
  notasComerciais: string | null;
  representante: { nome: string; email: string | null; telefone: string | null };
  status: string;
};

// Seções institucionais padrão do documento (iguais ao modelo de proposta do kit).
const NAO_INCLUSO_PADRAO = [
  'Customizações técnicas ou integrações não previstas neste escopo.',
  'Diagnóstico clínico, psicológico ou avaliação de saúde mental.',
  'Pesquisa de clima organizacional (o Pulso é leitura do ambiente de desenvolvimento, não eNPS).',
  'Avaliação de desempenho formal (nine-box, nota de avaliador, OKRs).',
  'Garantia de ROI financeiro específico (a Vertho mede evolução de competências).',
  'Consultoria presencial, salvo se contratada à parte.',
  'Recrutamento e seleção (ATS).',
];
const PREMISSAS_PADRAO = [
  'O cliente enviará a planilha de setup (cargos + colaboradores) e documentos institucionais até a data combinada.',
  'O ponto focal do cliente estará disponível para validações durante o setup.',
  'Os participantes terão acesso a smartphone ou computador com internet.',
  'O envio de links de acesso será por WhatsApp e/ou e-mail, conforme preferência do cliente.',
];
const CRONOGRAMA_PADRAO = [
  { fase: 'Setup', descricao: 'Configuração do ambiente dedicado: cargos, colaboradores e identidade visual da instituição.' },
  { fase: 'Diagnóstico', descricao: 'Mapeamento comportamental (DISC) + mapeamento de competências por participante.' },
  { fase: 'Trilha', descricao: 'Desenvolvimento personalizado por cargo e perfil, com conteúdo semanal e missões práticas.' },
  { fase: 'Fechamento', descricao: 'Cenário situacional + Evolution Report com delta por competência + plenária institucional.' },
];
const PROXIMOS_PASSOS_PADRAO = [
  'Aprovação desta proposta.',
  'Envio da planilha de setup preenchida + logo + documentos institucionais.',
  'A Vertho configura o ambiente em até 2 dias úteis após o recebimento completo.',
  'Disparo do diagnóstico na data combinada.',
];

/** Constrói o VM cliente-facing a partir da proposta + conta + representante. */
export function buildProposalDocument(
  proposal: SalesProposal,
  account: { legal_name: string | null; trade_name: string | null } | null,
  rep: { name: string | null; email: string | null; phone: string | null } | null,
  extra?: { contexto?: string | null },
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
    contexto: extra?.contexto?.trim() || null,
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
    naoIncluso: NAO_INCLUSO_PADRAO,
    premissas: PREMISSAS_PADRAO,
    cronograma: CRONOGRAMA_PADRAO,
    proximosPassos: PROXIMOS_PASSOS_PADRAO,
    notasComerciais: proposal.commercial_notes,
    representante: {
      nome: rep?.name || 'Representante Vertho',
      email: rep?.email ?? null,
      telefone: rep?.phone ?? null,
    },
    status: proposal.status,
  };
}
