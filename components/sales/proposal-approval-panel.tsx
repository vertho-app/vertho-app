'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckCircle2, Loader2, MessageSquareWarning, X } from 'lucide-react';
import { approveProposal, registrarAceitePropostaDoRC, rejectProposal, requestProposalChanges } from '@/actions/sales/proposals';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { fmtDateTime } from '@/lib/sales/formatters';
import { COMPENSATION_MODEL_LABELS, type CompensationModel, type ProposalStatus } from '@/lib/sales/constants';
import { pagamentosDoCronograma } from '@/lib/sales/commissions';
import ProposalStatusBadge from './proposal-status-badge';

/**
 * Painel de decisão do admin sobre uma proposta de RC.
 *
 * Em `submitted_for_approval`: aprovar, pedir ajustes ou recusar. A aprovação
 * grava o modelo de remuneração do RC (contrato, 10.5) e a classificação de
 * cliente da carteira (10.6), que vem calculada e o admin confirma ou corrige
 * (grupo econômico e mantenedora só ele enxerga). A classificação é controlada
 * pela página, para o resumo financeiro mudar junto.
 *
 * A aprovação também grava como o CLIENTE paga (contrato v6, 10.2 e 10.3):
 * quantos pagamentos e em que mês sai o primeiro. A comissão continua por
 * Parcela Mensal Equivalente; o cronograma só diz quando cada uma é devida.
 *
 * Em `sent_to_client`: registrar o aceite do cliente pela vertho.ai, o caminho
 * da cláusula 18.7 quando o RC já saiu do canal.
 */

/** "3 pagamentos, nos meses 0, 4 e 8 depois do aceite" */
function resumoCronograma(vigencia: number, pagamentos: number | null, atraso: number): string {
  const lista = pagamentosDoCronograma(vigencia, { pagamentos, primeiroEmMeses: atraso });
  if (!lista.length) return '';
  if (lista.length === 1) return `À vista, ${atraso ? `${atraso} ${atraso === 1 ? 'mês' : 'meses'} depois do aceite` : 'no mês do aceite'}.`;
  const meses = lista.map((p) => p.mes);
  const mostra = meses.length > 6 ? `${meses.slice(0, 5).join(', ')} … ${meses[meses.length - 1]}` : meses.join(', ');
  return `${lista.length} pagamentos, nos meses ${mostra} depois do aceite.`;
}
export default function ProposalApprovalPanel({
  proposalId,
  status,
  approvedBy,
  approvedAt,
  rejectionReason,
  modeloDoRc,
  rcInativo,
  carteiraAutomatica,
  carteiraMotivo,
  carteira,
  onCarteiraChange,
  vigencia,
  condicaoInformada,
  pagamentosGravados,
  primeiroPagamentoGravado,
  onDone,
}: {
  proposalId: string;
  status: ProposalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  modeloDoRc?: CompensationModel | null;
  rcInativo?: boolean;
  carteiraAutomatica: boolean;
  carteiraMotivo?: string | null;
  carteira: boolean;
  onCarteiraChange: (v: boolean) => void;
  /** Vigência em meses = número de Parcelas Mensais Equivalentes. */
  vigencia?: number | null;
  /** Condição de pagamento que o RC escreveu na proposta (texto livre). */
  condicaoInformada?: string | null;
  pagamentosGravados?: number | null;
  primeiroPagamentoGravado?: number | null;
  onDone?: () => void;
}) {
  const confirmDialog = useConfirm();
  const [mode, setMode] = useState<'idle' | 'changes' | 'reject'>('idle');
  const [text, setText] = useState('');
  const [motivoCarteira, setMotivoCarteira] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Math.max(0, Math.floor(Number(vigencia) || 0));
  const [pagamentos, setPagamentos] = useState<number>(n || 1);
  const [atraso, setAtraso] = useState(0);
  const opcoesPagamento = [
    { valor: n, rotulo: `Mensal (${n} pagamentos)` },
    ...(n > 3 && n % 3 === 0 ? [{ valor: n / 3, rotulo: `Trimestral (${n / 3} pagamentos)` }] : []),
    ...(n > 6 && n % 6 === 0 ? [{ valor: n / 6, rotulo: `Semestral (${n / 6} pagamentos)` }] : []),
    ...(n > 12 && n % 12 === 0 ? [{ valor: n / 12, rotulo: `Anual (${n / 12} pagamentos)` }] : []),
    ...(n > 1 ? [{ valor: 1, rotulo: 'À vista (1 pagamento)' }] : []),
  ];
  const outroNumero = !opcoesPagamento.some((o) => o.valor === pagamentos);

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

  async function handleAceite() {
    const ok = await confirmDialog({
      title: 'Registrar o aceite do cliente',
      message: rcInativo
        ? 'O representante já saiu do canal. A comissão só é lançada se a proposta foi enviada antes do término do contrato dele e está dentro da validade (cláusula 18.7).'
        : 'A oportunidade fecha como ganha, a conta entra na carteira do representante e a comissão prevista é lançada.',
      severity: 'normal',
      confirmLabel: 'Registrar aceite',
    });
    if (!ok) return;
    setBusy(true);
    const r = await registrarAceitePropostaDoRC(proposalId);
    setBusy(false);
    if (!r.success) { toast.error(r.error || 'Falha ao registrar o aceite'); return; }
    toast.success(r.comComissao ? 'Aceite registrado, com a comissão prevista lançada' : `Aceite registrado sem comissão. ${r.motivo ?? ''}`);
    onDone?.();
  }

  if (status === 'sent_to_client') {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-white">Decisão</h2>
            <ProposalStatusBadge status={status} size="md" />
          </div>
          <button
            onClick={handleAceite}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Registrar aceite do cliente
          </button>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Use quando o cliente aceitou por fora ou o representante não pode registrar.
        </p>
      </div>
    );
  }

  if (status !== 'submitted_for_approval') {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4">
        <h2 className="text-sm font-bold text-white mb-2">Decisão</h2>
        {n > 0 && approvedAt && (
          <p className="mb-2 text-[11px] text-gray-400">
            Pagamentos do cliente: <span className="text-gray-200">{resumoCronograma(n, pagamentosGravados ?? null, primeiroPagamentoGravado ?? 0)}</span>
          </p>
        )}
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

  const carteiraMudou = carteira !== carteiraAutomatica;

  async function handleApprove() {
    if (carteiraMudou && !motivoCarteira.trim()) {
      toast.error('Explique a classificação de carteira antes de aprovar');
      return;
    }
    const ok = await confirmDialog({
      title: 'Aprovar proposta',
      message: `A proposta será liberada para o representante enviar ao cliente. Ficam gravados o modelo ${modeloDoRc ? `"${COMPENSATION_MODEL_LABELS[modeloDoRc]}"` : 'atual do representante'}, a classificação ${carteira ? 'de cliente da carteira (50%)' : 'de cliente novo'} e o cronograma: ${n ? resumoCronograma(n, pagamentos, atraso) : 'sem vigência informada.'}`,
      severity: 'normal',
      confirmLabel: 'Aprovar',
    });
    if (!ok) return;
    await run(
      () => approveProposal(proposalId, {
        carteira,
        motivo: carteiraMudou ? motivoCarteira.trim() : null,
        pagamentos: n ? pagamentos : null,
        primeiroPagamentoEmMeses: atraso,
      }),
      'Proposta aprovada',
    );
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

      {/* Regras de comissão que a aprovação grava (contrato, 10.5 e 10.6) */}
      <div className="mb-3 rounded-lg bg-white/[0.03] border border-white/10 p-3 text-[11px] text-gray-300 space-y-2">
        <p>
          Modelo do representante: <strong className="text-white">{modeloDoRc ? COMPENSATION_MODEL_LABELS[modeloDoRc] : '—'}</strong>
          <span className="text-gray-500"> (fica gravado nesta proposta)</span>
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={carteira}
            onChange={(e) => onCarteiraChange(e.target.checked)}
            className="mt-0.5 accent-cyan-400"
          />
          <span>
            Cliente da carteira do representante: 50% dos percentuais (cláusula 10.6)
            <span className="block text-gray-500">
              {carteiraAutomatica
                ? (carteiraMotivo || 'A conta já tem proposta aceita deste representante.')
                : 'Pela conta, é cliente novo. Marque se for do mesmo grupo econômico ou da mesma mantenedora de um cliente dele.'}
            </span>
          </span>
        </label>
        {carteiraMudou && (
          <textarea
            value={motivoCarteira}
            onChange={(e) => setMotivoCarteira(e.target.value)}
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-xs text-white outline-none resize-y"
            style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
            placeholder={carteira ? 'Ex.: mesma mantenedora do Colégio X, cliente do representante' : 'Ex.: a proposta aceita anterior era de outra unidade, sem relação'}
          />
        )}

        {n > 0 && (
          <div className="pt-2 border-t border-white/10 space-y-2">
            <p>
              Como o cliente paga (cláusula 10.3): a comissão de cada parcela mensal equivalente sai com o pagamento que a cobre.
              {condicaoInformada && <span className="block text-gray-500">O representante informou: “{condicaoInformada}”.</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={outroNumero ? 'outro' : String(pagamentos)}
                onChange={(e) => setPagamentos(e.target.value === 'outro' ? Math.max(2, Math.min(n - 1, 2)) : Number(e.target.value))}
                className="rounded-lg px-2 py-1.5 text-xs text-white outline-none bg-[#091D35] border border-white/10"
              >
                {opcoesPagamento.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                {n > 2 && <option value="outro">Outro número de pagamentos</option>}
              </select>
              {outroNumero && (
                <input
                  type="number" min={1} max={n} value={pagamentos}
                  onChange={(e) => setPagamentos(Math.max(1, Math.min(n, Math.floor(Number(e.target.value) || 1))))}
                  className="w-20 rounded-lg px-2 py-1.5 text-xs text-white outline-none bg-white/5 border border-white/10"
                />
              )}
              <label className="flex items-center gap-1.5">
                1º pagamento
                <input
                  type="number" min={0} max={24} value={atraso}
                  onChange={(e) => setAtraso(Math.max(0, Math.min(24, Math.floor(Number(e.target.value) || 0))))}
                  className="w-16 rounded-lg px-2 py-1.5 text-xs text-white outline-none bg-white/5 border border-white/10"
                />
                meses depois do aceite
              </label>
            </div>
            <p className="text-gray-500">{resumoCronograma(n, pagamentos, atraso)}</p>
          </div>
        )}
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
