'use client';

// Portal do Representante — detalhe da proposta.
// Máquina de estados: rascunho/ajustes editáveis → submeter p/ aprovação Vertho;
// aprovada → enviar ao cliente; enviada → aceita (parabéns) ou perdida.
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, Eye, Link2, Loader2, Send, Sparkles, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import {
  getProposal,
  markProposalAccepted,
  markProposalLost,
  markProposalSentToClient,
  submitProposalForApproval,
  updateProposalDraft,
} from '@/actions/sales/proposals';
import { assistirProposta } from '@/actions/sales/ai-assistant';
import { gerarLinkProposta } from '@/actions/sales/proposal-share';
import { validateProposalForSubmission } from '@/lib/sales/validation';
import { useConfirm } from '@/components/admin/confirm-dialog';
import BackButton from '@/components/back-button';
import ProposalStatusBadge from '@/components/sales/proposal-status-badge';
import ProposalForm, { type ProposalFormValues } from '@/components/sales/proposal-form';
import ProposalFinancialSummary from '@/components/sales/proposal-financial-summary';
import { CUSTOMER_TYPE_LABELS, PRODUCT_PACKAGE_LABELS } from '@/lib/sales/constants';
import { fmtBRLExact, fmtDate, fmtDateTime } from '@/lib/sales/formatters';
import type { SalesProposal } from '@/lib/sales/types';

const RC_EDITABLE = ['draft', 'changes_requested'];
const SHAREABLE_STATUSES = ['approved', 'sent_to_client', 'accepted'];

type PropostaAssist = {
  proposta_de_valor: string;
  escopo_sugerido: string[];
  pontos_comerciais: string[];
  objecoes_provaveis: { objecao: string; resposta: string }[];
};

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

  const [assistOpen, setAssistOpen] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [assist, setAssist] = useState<PropostaAssist | null>(null);

  const [sharing, setSharing] = useState<null | 'copy' | 'pdf' | 'preview'>(null);

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

  async function handleAssistir() {
    if (!proposal?.opportunity_id) return;
    setAssist(null);
    setAssisting(true);
    setAssistOpen(true);
    const r = await assistirProposta(proposal.opportunity_id);
    setAssisting(false);
    if (!r.success) {
      setAssistOpen(false);
      toast.error(r.error);
      return;
    }
    setAssist(r.data as PropostaAssist);
  }

  async function handleShare(action: 'copy' | 'pdf' | 'preview') {
    setSharing(action);
    const r = await gerarLinkProposta(proposalId);
    setSharing(null);
    if (!r.success) { toast.error(r.error); return; }
    const origin = window.location.origin;
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(`${origin}/proposta/${r.token}`);
        toast.success('Link copiado');
      } catch {
        toast.error('Não foi possível copiar');
      }
    } else if (action === 'pdf') {
      window.open(`/proposta/${r.token}/pdf`, '_blank');
    } else {
      window.open(`${origin}/proposta/${r.token}`, '_blank');
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
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
          <button
            onClick={handleAssistir}
            disabled={!p.opportunity_id || assisting}
            title={p.opportunity_id ? undefined : 'Vincule uma oportunidade para usar o assistente'}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {assisting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Sugerir com IA
          </button>
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

      {/* Documento da proposta (link para o cliente) */}
      {SHAREABLE_STATUSES.includes(p.status) && (
        <div className="mb-5 rounded-xl bg-white/[0.03] border border-white/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={16} className="text-cyan-400 shrink-0" />
            <h2 className="text-xs font-bold uppercase tracking-wide text-gray-400">Documento da proposta</h2>
          </div>
          <p className="text-sm text-gray-300 mb-3">
            Envie este documento ao cliente. O link abre uma página com o design da proposta e um botão de baixar PDF.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleShare('copy')}
              disabled={sharing !== null}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50"
            >
              {sharing === 'copy' ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
              Copiar link do cliente
            </button>
            <button
              onClick={() => handleShare('pdf')}
              disabled={sharing !== null}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
            >
              {sharing === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Baixar PDF
            </button>
            <button
              onClick={() => handleShare('preview')}
              disabled={sharing !== null}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-300 border border-white/10 hover:bg-white/5 disabled:opacity-50"
            >
              {sharing === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              Abrir prévia
            </button>
          </div>
          <div className="mt-3 text-xs">
            {p.first_viewed_at ? (
              <p className="flex items-center gap-1.5 text-emerald-300">
                <Eye size={13} className="shrink-0" />
                Visualizada pelo cliente em {fmtDate(p.first_viewed_at)}
                {p.view_count > 1 && <span className="text-gray-400">· {p.view_count} aberturas</span>}
              </p>
            ) : (
              <p className="text-gray-500">Ainda não visualizada pelo cliente.</p>
            )}
          </div>
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

      {/* Assistente de proposta (IA) */}
      {assistOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8"
          onClick={() => { if (!assisting) setAssistOpen(false); }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-[#071426] border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={18} className="text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white truncate">Assistente de proposta</h2>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">Gerado por IA — revise antes de usar</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {assist && (
                  <button
                    onClick={handleAssistir}
                    disabled={assisting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
                  >
                    <Sparkles size={12} /> Regenerar
                  </button>
                )}
                <button
                  onClick={() => { if (!assisting) setAssistOpen(false); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="px-5 py-5">
              {assisting ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <Loader2 size={28} className="animate-spin text-cyan-400" />
                  <p className="text-sm text-gray-300">Analisando…</p>
                  <p className="text-[11px] text-gray-500">A IA está estudando o contexto da oportunidade. Isso leva alguns segundos.</p>
                </div>
              ) : assist ? (
                <div className="space-y-5">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Proposta de valor</h3>
                    <p className="text-sm text-gray-200 whitespace-pre-wrap">{assist.proposta_de_valor}</p>
                  </section>

                  <section>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Escopo sugerido</h3>
                      {assist.escopo_sugerido?.length > 0 && (
                        <button
                          onClick={() => copyText(assist.escopo_sugerido.map((s) => `• ${s}`).join('\n'))}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
                        >
                          <Copy size={12} /> Copiar
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1.5">
                      {(assist.escopo_sugerido || []).map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-200">
                          <span className="text-cyan-400 mt-0.5">•</span>
                          <span className="whitespace-pre-wrap">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Pontos comerciais</h3>
                    <ul className="space-y-1.5">
                      {(assist.pontos_comerciais || []).map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-200">
                          <span className="text-cyan-400 mt-0.5">•</span>
                          <span className="whitespace-pre-wrap">{s}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Objeções prováveis</h3>
                    <ul className="space-y-3">
                      {(assist.objecoes_provaveis || []).map((o, i) => (
                        <li key={i} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5">
                          <p className="text-sm font-bold text-white whitespace-pre-wrap">{o.objecao}</p>
                          <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{o.resposta}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
