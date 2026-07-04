'use client';

// Portal do Representante — extrato de comissões do RC (MVP 2).
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Coins, Loader2, FileText, Check, X } from 'lucide-react';
import { getMinhaComissaoLedger, marcarNotaFiscalEmitida } from '@/actions/sales/commissions';
import SalesMetricCard from '@/components/sales/sales-metric-card';
import {
  COMMISSION_STATUS_COLORS,
  COMMISSION_STATUS_LABELS,
  COMMISSION_TYPE_LABELS,
} from '@/lib/sales/constants';
import { fmtBRL, fmtBRLExact, fmtDate } from '@/lib/sales/formatters';
import type { SalesCommissionEvent } from '@/lib/sales/types';

type Totals = { previsto: number; aReceber: number; pago: number; aEmitirNota: number };
const ZERO_TOTALS: Totals = { previsto: 0, aReceber: 0, pago: 0, aEmitirNota: 0 };

// Filtros de status (client-side sobre o ledger).
const STATUS_FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: '', label: 'Todas', match: () => true },
  { key: 'forecast', label: 'Prevista', match: (s) => s === 'forecast' || s === 'potencial' },
  { key: 'accrued', label: 'A receber', match: (s) => s === 'accrued' },
  { key: 'paid', label: 'Paga', match: (s) => s === 'paid' },
];

/** Badge local do status da comissão. */
function CommissionStatusBadge({ status }: { status: string }) {
  const color = COMMISSION_STATUS_COLORS[status] || '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {COMMISSION_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function ComissoesPage() {
  const [events, setEvents] = useState<SalesCommissionEvent[]>([]);
  const [totals, setTotals] = useState<Totals>(ZERO_TOTALS);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  // Linha em modo "emitir NF": id do evento + número digitado + saving.
  const [nfFor, setNfFor] = useState<string | null>(null);
  const [nfNumber, setNfNumber] = useState('');
  const [savingNf, setSavingNf] = useState(false);

  async function load() {
    const r = await getMinhaComissaoLedger();
    if (r.success) {
      setEvents(r.data);
      setTotals(r.totals);
    } else {
      toast.error(r.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const f = STATUS_FILTERS.find((x) => x.key === statusFilter) || STATUS_FILTERS[0];
    return events.filter((e) => f.match(e.status));
  }, [events, statusFilter]);

  function startNf(id: string) {
    setNfFor(id);
    setNfNumber('');
  }
  function cancelNf() {
    setNfFor(null);
    setNfNumber('');
  }

  async function submitNf(eventId: string) {
    const num = nfNumber.trim();
    if (!num) {
      toast.error('Informe o número da nota fiscal');
      return;
    }
    setSavingNf(true);
    const r = await marcarNotaFiscalEmitida(eventId, num);
    setSavingNf(false);
    if (r.success) {
      toast.success('Nota fiscal registrada');
      cancelNf();
      await load();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Coins size={20} className="text-cyan-400" /> Comissões
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Acompanhe suas comissões previstas, a receber e pagas.
        </p>
      </div>

      {/* Cards de total */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <SalesMetricCard label="Previsto" value={fmtBRL(totals.previsto)} accent="#F59E0B" />
        <SalesMetricCard label="A receber" value={fmtBRL(totals.aReceber)} accent="#06B6D4" />
        <SalesMetricCard label="Pago" value={fmtBRL(totals.pago)} accent="#10B981" />
        <SalesMetricCard
          label="A emitir NF"
          value={fmtBRL(totals.aEmitirNota)}
          accent="#F59E0B"
          icon={FileText}
          sub="Emita a NF para agilizar o pagamento"
        />
      </div>

      {/* Aviso */}
      <div
        className="mb-4 rounded-xl px-4 py-3 text-xs leading-relaxed"
        style={{ background: 'rgba(6,182,212,.06)', border: '1px solid rgba(6,182,212,.25)', color: 'rgba(255,255,255,.7)' }}
      >
        Comissões viram &ldquo;a receber&rdquo; quando a Vertho reconhece o faturamento. Emita a nota
        fiscal das comissões a receber para agilizar o pagamento.
      </div>

      {/* Filtro por status */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              key={f.key || 'todas'}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                active
                  ? 'text-[#04121F] bg-cyan-400 border-cyan-400'
                  : 'text-gray-300 border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-white/[0.03] border border-white/10">
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Suas comissões aparecem aqui conforme as propostas são aceitas e o faturamento é reconhecido.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500 rounded-xl bg-white/[0.03] border border-white/10">
          Nenhuma comissão com esse status.
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-[10px] uppercase text-gray-500">
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Competência</th>
                <th className="px-3 py-2 text-right">Base</th>
                <th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Previsão pagto</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">NF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((e) => {
                const isChargeback = e.type === 'chargeback';
                const editingNf = nfFor === e.id;
                return (
                  <tr key={e.id} className="hover:bg-white/[0.03] align-top">
                    <td className="px-3 py-2.5 text-gray-300 max-w-[180px] truncate">
                      {e.account?.trade_name || e.account?.legal_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-300">
                      {COMMISSION_TYPE_LABELS[e.type] || e.type}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{fmtDate(e.reference_month)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-300">{fmtBRL(e.base_value)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gray-400">
                      {e.percent != null ? `${Number(e.percent)}%` : '—'}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                        isChargeback ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {fmtBRLExact(e.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400">{fmtDate(e.expected_payment_date)}</td>
                    <td className="px-3 py-2.5"><CommissionStatusBadge status={e.status} /></td>
                    <td className="px-3 py-2.5">
                      {e.invoice_number ? (
                        <span className="inline-flex items-center gap-1.5 text-gray-300">
                          <FileText size={12} className="text-emerald-400" />
                          {e.invoice_number}
                        </span>
                      ) : e.status === 'accrued' ? (
                        editingNf ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              value={nfNumber}
                              onChange={(ev) => setNfNumber(ev.target.value)}
                              onKeyDown={(ev) => {
                                if (ev.key === 'Enter') submitNf(e.id);
                                if (ev.key === 'Escape') cancelNf();
                              }}
                              placeholder="Nº da NF"
                              disabled={savingNf}
                              className="w-24 px-2 py-1 rounded-md text-xs text-white border border-white/15 bg-[#091D35] outline-none focus:border-cyan-400/60"
                              aria-label="Número da nota fiscal"
                            />
                            <button
                              onClick={() => submitNf(e.id)}
                              disabled={savingNf}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-[#04121F] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60"
                              aria-label="Confirmar nota fiscal"
                            >
                              {savingNf ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button
                              onClick={cancelNf}
                              disabled={savingNf}
                              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 border border-white/10 hover:bg-white/[0.06]"
                              aria-label="Cancelar"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startNf(e.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
                          >
                            <FileText size={12} /> Emitir NF
                          </button>
                        )
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
