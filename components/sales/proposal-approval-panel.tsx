'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { approveProposal, rejectProposal, requestProposalChanges } from '@/actions/sales/proposals';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fmtDateTime } from '@/lib/sales/formatters';
import type { ProposalStatus } from '@/lib/sales/constants';
import ProposalStatusBadge from './proposal-status-badge';

/**
 * Painel de decisão do admin sobre uma proposta submetida.
 * Renderiza os botões de decisão só quando status === 'submitted_for_approval';
 * nos demais estados mostra o estado atual (badge + metadados da decisão).
 */
export default function ProposalApprovalPanel({
  proposalId,
  status,
  approvedBy,
  approvedAt,
  rejectionReason,
  onDone,
}: {
  proposalId: string;
  status: ProposalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  onDone?: () => void;
}) {
  const confirmDialog = useConfirm();
  const [mode, setMode] = useState<'idle' | 'changes' | 'reject'>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  if (status !== 'submitted_for_approval') {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <h2 className="text-sm font-bold text-white mb-2">Decisão</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <ProposalStatusBadge status={status} size="md" />
          {approvedBy && (
            <span className="text-[11px] text-gray-400">
              por <strong className="text-gray-300">{approvedBy}</strong>
              {approvedAt ? ` em ${fmtDateTime(approvedAt)}` : ''}
            </span>
          )}
        </div>
        {rejectionReason && (
          <p className="mt-2 rounded-lg px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-200">
            {rejectionReason}
          </p>
        )}
      </div>
    );
  }

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, okMsg: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.success) {
      toast.error(r.error || 'Falha na operação');
      return;
    }
    toast.success(okMsg);
    setMode('idle');
    setText('');
    onDone?.();
  }

  async function handleApprove() {
    const ok = await confirmDialog({
      title: 'Aprovar proposta',
      message: 'A proposta será liberada para o representante enviar ao cliente.',
      severity: 'normal',
      confirmLabel: 'Aprovar',
    });
    if (!ok) return;
    await run(() => approveProposal(proposalId), 'Proposta aprovada');
  }

  async function handleRequestChanges() {
    if (!text.trim()) {
      toast.error('Descreva os ajustes solicitados');
      return;
    }
    await run(() => requestProposalChanges(proposalId, text.trim()), 'Ajustes solicitados ao representante');
  }

  async function handleReject() {
    if (!text.trim()) {
      toast.error('Informe o motivo da recusa');
      return;
    }
    const ok = await confirmDialog({
      title: 'Recusar proposta',
      message: 'A proposta será recusada em definitivo. O representante verá o motivo informado.',
      severity: 'danger',
      confirmLabel: 'Recusar',
    });
    if (!ok) return;
    await run(() => rejectProposal(proposalId, text.trim()), 'Proposta recusada');
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-amber-400/25 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-sm font-bold text-white">Decisão de aprovação</h2>
        <ProposalStatusBadge status={status} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleApprove}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aprovar
        </button>
        <button
          onClick={() => { setMode(mode === 'changes' ? 'idle' : 'changes'); setText(''); }}
          disabled={busy}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 disabled:opacity-50 ${mode === 'changes' ? 'bg-amber-400/10' : ''}`}
        >
          <MessageSquareWarning size={14} /> Solicitar ajustes
        </button>
        <button
          onClick={() => { setMode(mode === 'reject' ? 'idle' : 'reject'); setText(''); }}
          disabled={busy}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50 ${mode === 'reject' ? 'bg-red-400/10' : ''}`}
        >
          <X size={14} /> Recusar
        </button>
      </div>

      {mode !== 'idle' && (
        <div className="mt-3">
          <label className="block text-[11px] text-gray-400 mb-1">
            {mode === 'changes' ? 'Ajustes solicitados (obrigatório) — o representante verá este texto' : 'Motivo da recusa (obrigatório)'}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-xs text-white outline-none resize-y"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
            placeholder={mode === 'changes' ? 'Ex.: reduzir desconto para 10% e detalhar o escopo incluído' : 'Ex.: cliente fora do perfil / desconto inviável'}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={mode === 'changes' ? handleRequestChanges : handleReject}
              disabled={busy || !text.trim()}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border disabled:opacity-50 ${
                mode === 'changes'
                  ? 'text-amber-400 border-amber-400/30 hover:bg-amber-400/10'
                  : 'text-red-400 border-red-400/30 hover:bg-red-400/10'
              }`}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {mode === 'changes' ? 'Confirmar solicitação de ajustes' : 'Confirmar recusa'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
