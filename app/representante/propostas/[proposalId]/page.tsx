'use client';

// Portal do Representante — detalhe da proposta.
// Máquina de estados: rascunho/ajustes editáveis → submeter p/ aprovação Vertho;
// aprovada → enviar ao cliente; enviada → aceita (parabéns) ou perdida.
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import {
  getProposal,
  markProposalAccepted,
  markProposalLost,
  markProposalSentToClient,
  submitProposalForApproval,
  updateProposalDraft,
} from '@/actions/sales/proposals';
import { validateProposalForSubmission } from '@/lib/sales/validation';
import { useConfirm } from '@/components/admin/confirm-dialog';
import BackButton from '@/components/back-button';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import ProposalForm, { type ProposalFormValues } from '@/components/sales/proposal-form';
import ProposalFinancialSummary from '@/components/sales/proposal-financial-summary';
import { CUSTOMER_TYPE_LABELS, PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { fmtBRLExact, fmtDateTime } from '@/lib/sales/formatters';
import type { SalesProposal } from '@/lib/sales/types';

const RC_EDITABLE = ['draft', 'changes_requested'];

function Info({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{label}</p>
      <div className="text-sm text-white">{children ?? '—'}</div>
    </div>
  );
}

export default function PropostaDetalhePage({ params }: { params: Promise<{ proposalId: string }> }) {
  const { proposalId } = use(params);
  const confirm = useConfirm();

  const [proposal, setProposal] = useState<SalesProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [showLostForm, setShowLostForm] = useState(false);
  const [lostReason, setLostReason] = useState('');

  const load = useCallback(async () => {
    const r = await getProposal(proposalId);
    if (!r.success) {
      setLoadError(r.error);
      setLoading(false);
      return;
    }
    setProposal(r.data);
    setLoading(false);
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveDraft(values: ProposalFormValues) {
    setSaving(true);
    const r = await updateProposalDraft(proposalId, values);
    setSaving(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Proposta salva');
    await load();
  }

  async function handleSubmitForApproval() {
    if (!proposal) return;
    const v = validateProposalForSubmission(proposal);
    if (!v.valid) {
      toast.error(`Complete a proposta antes de submeter (salve as alterações): ${Object.values(v.errors).join(' · ')}`);
      return;
    }
    const ok = await confirm({
      title: 'Submeter para aprovação Vertho',
      message: (
        <>
          A proposta <b className="text-white">{proposal.proposal_number}</b> será enviada para aprovação
          interna da Vertho. Enquanto estiver em análise, ela não poderá ser editada.
        </>
      ),
      severity: 'normal',
      confirmLabel: 'Submeter',
    });
    if (!ok) return;
    setActing(true);
    const r = await submitProposalForApproval(proposalId);
    setActing(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Proposta submetida para aprovação Vertho');
    await load();
  }

  async function handleMarkSent() {
    setActing(true);
    const r = await markProposalSentToClient(proposalId);
    setActing(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Proposta marcada como enviada ao cliente');
    await load();
  }

  async function handleAccepted() {
    if (!proposal) return;
    const ok = await confirm({
      title: 'Cliente aceitou a proposta',
      message: (
        <>
          Confirma o aceite de <b className="text-white">{proposal.proposal_number}</b>?
          A oportunidade fecha como ganha, a conta entra na sua carteira e as comissões
          estimadas são registradas.
        </>
      ),
      severity: 'normal',
      confirmLabel: 'Confirmar aceite',
    });
    if (!ok) return;
    setActing(true);
    const r = await markProposalAccepted(proposalId);
    setActing(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Parabéns! Proposta aceita — comissões estimadas registradas.');
    await load();
  }

  async function handleLost() {
    if (!proposal) return;
    if (!lostReason.trim()) { toast.error('Informe o motivo da perda antes de confirmar'); return; }
    const ok = await confirm({
      title: 'Marcar proposta como perdida',
      message: (
        <>
          A proposta <b className="text-white">{proposal.proposal_number}</b> será marcada como perdida.
          <br />Motivo: <b className="text-white">{lostReason.trim()}</b>
        </>
      ),
      severity: 'danger',
      confirmLabel: 'Marcar como perdida',
    });
    if (!ok) return;
    setActing(true);
    const r = await markProposalLost(proposalId, lostReason.trim());
    setActing(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success('Proposta marcada como perdida');
    setShowLostForm(false);
    setLostReason('');
    await load();
  }

  if (loading) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-center">
        <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto mt-16" />
      </div>
    );
  }

  if (loadError || !proposal) {
    return (
      <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
        <BackButton href="/representante/propostas" label="Propostas" />
        <div className="text-center py-16 text-sm text-gray-400 rounded-xl bg-white/[0.03] border border-white/10">
          {loadError ?? 'Proposta não encontrada'}
        </div>
      </div>
    );
  }

  const p = proposal;
  const editable = RC_EDITABLE.includes(p.status);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <BackButton href="/representante/propostas" label="Propostas" />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold">Proposta {p.proposal_number}</h1>
            <ProposalStatusBadge status={p.status} size="md" />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {p.account?.trade_name || p.account?.legal_name || '—'}
            {p.opportunity && (
              <>
                {' · '}
                <Link href={`/representante/crm/${p.opportunity.id}`} className="text-cyan-400 hover:text-cyan-300 font-semibold">
                  {p.opportunity.opportunity_name}
                </Link>
              </>
            )}
          </p>
          {p.approved_at && (
            <p className="text-[10px] text-gray-500 mt-1">
              Aprovada em {fmtDateTime(p.approved_at)}
            </p>
          )}
        </div>

        {/* Ações por status */}
        <div className="flex items-center gap-2 flex-wrap">
          {editable && (
            <button
              onClick={handleSubmitForApproval}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50"
            >
              {acting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Submeter para aprovação Vertho
            </button>
          )}
          {p.status === 'approved' && (
            <button
              onClick={handleMarkSent}
              disabled={acting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50"
            >
              {acting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Marcar como enviada ao cliente
            </button>
          )}
          {p.status === 'sent_to_client' && (
            <>
              <button
                onClick={handleAccepted}
                disabled={acting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
              >
                <ThumbsUp size={14} /> Cliente aceitou
              </button>
              <button
                onClick={() => setShowLostForm((s) => !s)}
                disabled={acting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50"
              >
                <ThumbsDown size={14} /> Perdida
              </button>
            </>
          )}
        </div>
      </div>

      {/* Motivo da perda (inline, antes do confirm) */}
      {showLostForm && p.status === 'sent_to_client' && (
        <div className="mb-5 rounded-xl bg-red-500/5 border border-red-400/20 p-4">
          <p className="text-[11px] font-bold text-red-300 mb-2">Motivo da perda</p>
          <div className="flex gap-2 flex-wrap">
            <input
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex.: cliente optou por concorrente, orçamento adiado…"
              className="flex-1 min-w-[240px] rounded-lg px-3 py-2 text-sm text-white outline-none bg-white/5 border border-white/10 focus:border-red-400/50 placeholder:text-gray-600"
            />
            <button
              onClick={handleLost}
              disabled={acting || !lostReason.trim()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50"
            >
              {acting && <Loader2 size={14} className="animate-spin" />} Confirmar perda
            </button>
          </div>
        </div>
      )}

      {/* Banner de recusa / ajustes solicitados */}
      {p.rejection_reason && (p.status === 'changes_requested' || p.status === 'rejected') && (
        <div
          className={`mb-5 flex items-start gap-2.5 rounded-xl p-4 border text-xs ${
            p.status === 'rejected'
              ? 'bg-red-500/10 border-red-400/30 text-red-200'
              : 'bg-amber-500/10 border-amber-400/30 text-amber-200'
          }`}
        >
          <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${p.status === 'rejected' ? 'text-red-400' : 'text-amber-400'}`} />
          <div>
            <p className="font-bold mb-0.5">
              {p.status === 'rejected' ? 'Proposta recusada pela Vertho' : 'Ajustes solicitados pela Vertho'}
            </p>
            <p className="whitespace-pre-wrap">{p.rejection_reason}</p>
          </div>
        </div>
      )}

      {p.status === 'accepted' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl p-4 bg-emerald-500/10 border border-emerald-400/30 text-xs text-emerald-200">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <p className="font-semibold">Proposta aceita pelo cliente — comissões estimadas registradas.</p>
        </div>
      )}

      {editable ? (
        <ProposalForm
          initial={p}
          opportunityId={p.opportunity_id}
          onSubmit={handleSaveDraft}
          submitting={saving}
          submitLabel="Salvar alterações"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
          <div className="space-y-6 min-w-0">
            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Cliente e escopo</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Info label="Tipo de cliente">
                  {p.customer_type ? (CUSTOMER_TYPE_LABELS[p.customer_type] || p.customer_type) : '—'}
                </Info>
                <Info label="Nº de usuários">{p.number_of_users ?? '—'}</Info>
                <Info label="Nº de cargos mapeados">{p.number_of_roles_mapped ?? '—'}</Info>
                <Info label="Pacote">
                  {p.product_package ? (PRODUCT_PACKAGE_LABELS[p.product_package] || p.product_package) : '—'}
                </Info>
                <Info label="Vigência">
                  {p.contract_duration_months ? `${p.contract_duration_months} meses` : '—'}
                </Info>
                <Info label="Desconto solicitado">
                  {p.discount_requested != null ? `${p.discount_requested}%` : '—'}
                </Info>
              </div>
              <div className="mt-4">
                <Info label="Escopo incluído">
                  <p className="whitespace-pre-wrap text-gray-200">{p.included_scope || '—'}</p>
                </Info>
              </div>
            </section>

            <section className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Condições comerciais</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <Info label="Valor mensal">{fmtBRLExact(p.monthly_value)}</Info>
                <Info label="Condições de pagamento">{p.payment_terms || '—'}</Info>
                <Info label="Atualizada em">{fmtDateTime(p.updated_at)}</Info>
              </div>
              {p.commercial_notes && (
                <div className="mt-4">
                  <Info label="Observações comerciais">
                    <p className="whitespace-pre-wrap text-gray-200">{p.commercial_notes}</p>
                  </Info>
                </div>
              )}
            </section>
          </div>

          <ProposalFinancialSummary
            input={{
              monthly_value: p.monthly_value,
              contract_duration_months: p.contract_duration_months,
              discount_requested: p.discount_requested,
            }}
            className="lg:sticky lg:top-6"
          />
        </div>
      )}
    </div>
  );
}
