'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Link2, Loader2, Send, ThumbsUp, X } from 'lucide-react';
import {
  aprovarPropostaAdmin,
  gerarLinkPropostaAdmin,
  marcarPropostaAceitaAdmin,
  marcarPropostaEnviadaAdmin,
  marcarPropostaPerdidaAdmin,
} from '@/actions/sales/proposals-admin';
import { useConfirm } from '@/components/admin/confirm-dialog';
import type { ProposalStatus } from '@/lib/sales/constants';
import ProposalStatusBadge from './proposal-status-badge';

/**
 * Ciclo de vida de uma proposta criada pelo DEAL DESK (mig 254) — sem RC.
 *
 * Existe porque as actions de `actions/sales/proposals.ts` passam por
 * `assertRepresentativeOwnership`, que lança com `representante_id` nulo: sem
 * este painel, uma proposta do deal desk nascia `draft` e não tinha como chegar
 * ao cliente. `ProposalApprovalPanel` também não serve — ele só renderiza botões
 * em `submitted_for_approval`, estado que o fluxo do RC produz.
 *
 * 🔒 Renderiza NADA quando há RC. As actions já recusam proposta com RC, mas não
 * mostrar os botões evita que o admin descubra isso por um erro.
 */
export default function ProposalDealDeskPanel({
  proposalId,
  status,
  publicToken,
  createdByEmail,
  approvedBy,
  onDone,
}: {
  proposalId: string;
  status: ProposalStatus;
  publicToken?: string | null;
  createdByEmail?: string | null;
  approvedBy?: string | null;
  onDone?: () => void;
}) {
  const confirmDialog = useConfirm();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(publicToken ?? null);

  async function run(fn: () => Promise<{ success: boolean; data?: any; error?: string }>, okMsg: string) {
    setBusy(true);
    let r: any;
    try {
      r = await fn();
    } catch (e: any) {
      r = { success: false, error: e?.message };
    }
    setBusy(false);
    if (!r?.success) {
      toast.error(r?.error || 'Falha na operação');
      return null;
    }
    toast.success(okMsg);
    onDone?.();
    return r;
  }

  async function handleAprovar() {
    const ok = await confirmDialog({
      title: 'Aprovar proposta do deal desk',
      message:
        'Esta proposta não tem representante: você está aprovando o que você mesmo precificou. '
        + 'Não há segunda checagem neste caminho.',
      severity: 'normal',
      confirmLabel: 'Aprovar',
    });
    if (!ok) return;
    await run(() => aprovarPropostaAdmin(proposalId), 'Proposta aprovada');
  }

  async function handleGerarLink() {
    const r = await run(() => gerarLinkPropostaAdmin(proposalId), 'Link do documento gerado');
    if (r?.data) {
      setToken(r.data as string);
      await copiar(r.data as string);
    }
  }

  async function copiar(t: string) {
    const url = `${window.location.origin}/proposta/${t}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      // Clipboard negado (contexto não-seguro/permissão): mostrar é o fallback.
      toast.info(url, { duration: 12000 });
    }
  }

  async function handleEnviar() {
    const ok = await confirmDialog({
      title: 'Marcar como enviada ao cliente',
      message: 'Gere o link antes: é por ele que o cliente abre o documento.',
      severity: 'normal',
      confirmLabel: 'Marcar como enviada',
    });
    if (!ok) return;
    await run(() => marcarPropostaEnviadaAdmin(proposalId), 'Marcada como enviada ao cliente');
  }

  async function handleAceitar() {
    const ok = await confirmDialog({
      title: 'Registrar aceite do cliente',
      message:
        'Sem representante não há comissão a materializar — o aceite só muda o status '
        + 'e ativa a conta no CRM, se houver.',
      severity: 'normal',
      confirmLabel: 'Registrar aceite',
    });
    if (!ok) return;
    await run(() => marcarPropostaAceitaAdmin(proposalId), 'Aceite registrado');
  }

  async function handlePerdida() {
    const ok = await confirmDialog({
      title: 'Marcar como perdida',
      message: 'A proposta sai do pipeline. Essa ação não é desfeita por aqui.',
      severity: 'danger',
      confirmLabel: 'Marcar perdida',
    });
    if (!ok) return;
    await run(() => marcarPropostaPerdidaAdmin(proposalId), 'Marcada como perdida');
  }

  const btn = (tom: 'emerald' | 'cyan' | 'gray' | 'red') =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border disabled:opacity-50 ` +
    {
      emerald: 'text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10',
      cyan: 'text-cyan-400 border-cyan-400/30 hover:bg-cyan-400/10',
      gray: 'text-gray-300 border-white/15 hover:bg-white/5',
      red: 'text-red-400 border-red-400/30 hover:bg-red-400/10',
    }[tom];

  return (
    <div className="rounded-xl bg-white/[0.03] border border-cyan-400/25 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-sm font-bold text-white">Deal desk · proposta da Vertho</h2>
        <ProposalStatusBadge status={status} />
      </div>
      <p className="text-[11px] leading-relaxed text-gray-400">
        Sem representante comercial: não gera comissão e só o admin a opera.
        {createdByEmail ? <> Criada por <strong className="text-gray-300">{createdByEmail}</strong>.</> : null}
        {approvedBy ? <> Aprovada por <strong className="text-gray-300">{approvedBy}</strong>.</> : null}
      </p>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {busy && <Loader2 size={14} className="animate-spin text-cyan-400" />}

        {status === 'draft' && (
          <button onClick={handleAprovar} disabled={busy} className={btn('emerald')}>
            <Check size={14} /> Aprovar
          </button>
        )}

        {(status === 'approved' || status === 'sent_to_client' || status === 'accepted') && (
          <>
            <button onClick={handleGerarLink} disabled={busy} className={btn('cyan')}>
              <Link2 size={14} /> {token ? 'Copiar link do cliente' : 'Gerar link do cliente'}
            </button>
            {token && (
              <button onClick={() => copiar(token)} disabled={busy} className={btn('gray')}>
                Copiar de novo
              </button>
            )}
          </>
        )}

        {status === 'approved' && (
          <button onClick={handleEnviar} disabled={busy} className={btn('gray')}>
            <Send size={14} /> Marcar como enviada
          </button>
        )}

        {status === 'sent_to_client' && (
          <button onClick={handleAceitar} disabled={busy} className={btn('emerald')}>
            <ThumbsUp size={14} /> Registrar aceite
          </button>
        )}

        {(status === 'draft' || status === 'approved' || status === 'sent_to_client') && (
          <button onClick={handlePerdida} disabled={busy} className={btn('red')}>
            <X size={14} /> Perdida
          </button>
        )}

        {(status === 'accepted' || status === 'lost' || status === 'superseded') && (
          <span className="text-[11px] text-gray-500">Estado final — nada a operar aqui.</span>
        )}
      </div>

      {token && (
        <p className="mt-3 break-all rounded-lg bg-black/25 px-3 py-2 text-[11px] text-cyan-200">
          {`${typeof window !== 'undefined' ? window.location.origin : ''}/proposta/${token}`}
        </p>
      )}
    </div>
  );
}
