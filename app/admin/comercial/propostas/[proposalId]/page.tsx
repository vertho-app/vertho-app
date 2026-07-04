'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import { addAdminComment, getProposal } from '@/actions/sales/proposals';
import AdminPageHeader from '@/components/admin/page-header';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import OpportunityStageBadge from '@/components/sales/opportunity-stage-badge';
import ProposalApprovalPanel from '@/components/sales/proposal-approval-panel';
import {
  COMMISSION_RATES, CUSTOMER_TYPE_LABELS, PRODUCT_PACKAGE_LABELS,
} from '@/lib/sales/constants';
import { fmtBRL, fmtBRLExact, fmtDateTime, fmtPercent } from '@/lib/sales/formatters';
import type { SalesAdminComment, SalesProposal } from '@/lib/sales/types';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <div className="text-xs text-gray-200 mt-0.5">{value ?? '—'}</div>
    </div>
  );
}

export default function PropostaDetalhePage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = use(params);
  const [proposal, setProposal] = useState<SalesProposal | null>(null);
  const [comments, setComments] = useState<SalesAdminComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);

  const carregar = useCallback(async () => {
    const r = await getProposal(proposalId);
    if (r.success) {
      setProposal(r.data);
      setComments((r.comments || []) as SalesAdminComment[]);
      setError(null);
    } else {
      setError(r.error || 'Falha ao carregar a proposta');
    }
    setLoading(false);
  }, [proposalId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function handleAddComment() {
    if (!newComment.trim()) return;
    setSending(true);
    const r = await addAdminComment(proposalId, newComment.trim());
    setSending(false);
    if (!r.success) {
      toast.error(r.error || 'Falha ao registrar comentário');
      return;
    }
    toast.success('Comentário registrado');
    setNewComment('');
    await carregar();
  }

  return (
    <div className="min-h-full text-white">
      <div className="max-w-4xl mx-auto p-6">
        <AdminPageHeader
          icon={FileText}
          title={proposal ? `Proposta ${proposal.proposal_number}` : 'Proposta'}
          subtitle={proposal ? (proposal.account?.trade_name || proposal.account?.legal_name || undefined) : undefined}
          backHref="/admin/comercial/propostas"
          actions={proposal ? <ProposalStatusBadge status={proposal.status} size="md" /> : undefined}
        />

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : proposal && (
          <div className="space-y-4">
            {/* Resumo financeiro */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <h2 className="text-sm font-bold text-white">Resumo financeiro</h2>
                {proposal.margin_alert && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-500/15 border border-amber-500/40 text-amber-400">
                    <AlertTriangle size={12} /> Desconto alto
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Total do contrato</p>
                  <p className="text-lg font-bold text-white mt-0.5">{fmtBRL(proposal.total_contract_value)}</p>
                  <p className="text-[10px] text-gray-500">{fmtBRLExact(proposal.monthly_value)}/mês · {proposal.contract_duration_months ?? '—'} meses</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">
                    Comissão aquisição ({fmtPercent(COMMISSION_RATES.acquisition)})
                  </p>
                  <p className="text-lg font-bold text-amber-300 mt-0.5">{fmtBRL(proposal.estimated_acquisition_commission)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">
                    Comissão recorrente ({fmtPercent(COMMISSION_RATES.recurring)})
                  </p>
                  <p className="text-lg font-bold text-amber-300 mt-0.5">{fmtBRL(proposal.estimated_recurring_commission)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Comissão total estimada</p>
                  <p className="text-lg font-bold text-amber-400 mt-0.5">{fmtBRL(proposal.estimated_total_commission)}</p>
                </div>
              </div>
            </div>

            {/* Painel de decisão */}
            <ProposalApprovalPanel
              proposalId={proposal.id}
              status={proposal.status}
              approvedBy={proposal.approved_by}
              approvedAt={proposal.approved_at}
              rejectionReason={proposal.rejection_reason}
              onDone={carregar}
            />

            {/* Dados da proposta */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-sm font-bold text-white mb-3">Dados da proposta</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                <Field label="Cliente" value={proposal.account?.trade_name || proposal.account?.legal_name || '—'} />
                <Field
                  label="Oportunidade"
                  value={proposal.opportunity ? (
                    <span className="flex items-center gap-2 flex-wrap">
                      {proposal.opportunity.opportunity_name}
                      <OpportunityStageBadge stage={proposal.opportunity.stage} />
                    </span>
                  ) : '—'}
                />
                <Field
                  label="Tipo de cliente"
                  value={proposal.customer_type ? (CUSTOMER_TYPE_LABELS[proposal.customer_type] || proposal.customer_type) : '—'}
                />
                <Field
                  label="Pacote"
                  value={proposal.product_package ? (PRODUCT_PACKAGE_LABELS[proposal.product_package] || proposal.product_package) : '—'}
                />
                <Field label="Nº de usuários" value={proposal.number_of_users ?? '—'} />
                <Field label="Cargos mapeados" value={proposal.number_of_roles_mapped ?? '—'} />
                <Field label="Duração do contrato" value={proposal.contract_duration_months ? `${proposal.contract_duration_months} meses` : '—'} />
                <Field label="Desconto solicitado" value={proposal.discount_requested != null ? `${proposal.discount_requested}%` : '—'} />
                <Field label="Condições de pagamento" value={proposal.payment_terms || '—'} />
                <Field label="Criada em" value={fmtDateTime(proposal.created_at)} />
                <Field label="Atualizada em" value={fmtDateTime(proposal.updated_at)} />
              </div>
              {(proposal.included_scope || proposal.commercial_notes) && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {proposal.included_scope && (
                    <Field label="Escopo incluído" value={<span className="whitespace-pre-wrap">{proposal.included_scope}</span>} />
                  )}
                  {proposal.commercial_notes && (
                    <Field label="Observações comerciais" value={<span className="whitespace-pre-wrap">{proposal.commercial_notes}</span>} />
                  )}
                </div>
              )}
            </div>

            {/* Comentários internos */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <MessageSquare size={15} className="text-cyan-400" /> Comentários internos
              </h2>
              <div className="flex items-start gap-2 mb-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  placeholder="Registrar comentário interno (visível só para o time Vertho)"
                  className="flex-1 rounded-lg px-3 py-2 text-xs text-white outline-none resize-y"
                  style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
                />
                <button
                  onClick={handleAddComment}
                  disabled={sending || !newComment.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Comentar
                </button>
              </div>
              {comments.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum comentário interno ainda.</p>
              ) : (
                <div className="space-y-2">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-lg px-3 py-2 bg-white/[0.03] border border-white/[0.06]">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-cyan-400">{c.author_email}</span>
                        <span className="text-[10px] text-gray-500">{fmtDateTime(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-200 whitespace-pre-wrap">{c.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
