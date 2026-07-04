'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Download, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  getCommissionEventsAdmin,
  getCommissionAdminSummary,
  marcarComissaoAReceber,
  marcarComissaoPaga,
  cancelarComissao,
  registrarEstorno,
  exportComissoesCSV,
} from '@/actions/sales/commissions-admin';
import { listRepresentativesForAdmin } from '@/actions/sales/representatives';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_COLORS,
  COMMISSION_TYPE_LABELS,
} from '@/lib/sales/constants';
import { fmtBRL, fmtBRLExact, fmtDate, fmtPercent } from '@/lib/sales/formatters';
import type { SalesCommissionEvent, SalesRepresentative } from '@/lib/sales/types';

type Totals = { previsto: number; aReceber: number; pago: number; comNotaPendente: number };

// Filtro combinado de "status": os 4 status reais + o pseudo "chargeback"
// (que é um TIPO, não um status — filtrado por type=chargeback).
const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'forecast', label: 'Prevista' },
  { value: 'accrued', label: 'A receber' },
  { value: 'paid', label: 'Paga' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'chargeback', label: 'Estorno' },
];

function TotalCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl p-4 border h-full" style={{ background: 'rgba(255,255,255,.03)', borderColor: `${accent}30` }}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = COMMISSION_STATUS_COLORS[status] || '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold px-2 py-0.5 text-[10px]"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {COMMISSION_STATUS_LABELS[status] || status}
    </span>
  );
}

export default function ComissoesAdminPage() {
  const confirm = useConfirm();

  const [events, setEvents] = useState<SalesCommissionEvent[]>([]);
  const [reps, setReps] = useState<SalesRepresentative[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filtros
  const [repFilter, setRepFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [mesFilter, setMesFilter] = useState(''); // input month → "YYYY-MM"
  const [exporting, setExporting] = useState(false);

  // Modal de estorno
  const [estornoOpen, setEstornoOpen] = useState(false);
  const [estRep, setEstRep] = useState('');
  const [estValor, setEstValor] = useState('');
  const [estMotivo, setEstMotivo] = useState('');
  const [estSaving, setEstSaving] = useState(false);

  // Refs para inputs opcionais dentro dos diálogos de confirmação (uncontrolled).
  const paidAtRef = useRef<HTMLInputElement>(null);
  const receiveDateRef = useRef<HTMLInputElement>(null);
  const cancelMotivoRef = useRef<HTMLTextAreaElement>(null);

  // Competência do input month vira o 1º dia do mês (reference_month é DATE).
  const mesToRef = (m: string) => (m ? `${m}-01` : undefined);

  const eventFilters = useMemo(() => {
    const f: { representanteId?: string; status?: string; tipo?: string; mes?: string } = {};
    if (repFilter) f.representanteId = repFilter;
    if (statusFilter === 'chargeback') f.tipo = 'chargeback';
    else if (statusFilter) f.status = statusFilter;
    const mes = mesToRef(mesFilter);
    if (mes) f.mes = mes;
    return f;
  }, [repFilter, statusFilter, mesFilter]);

  async function loadEvents() {
    setLoading(true);
    setError(null);
    const r = await getCommissionEventsAdmin(eventFilters);
    if (r.success) setEvents(r.data);
    else setError(r.error || 'Falha ao carregar comissões');
    setLoading(false);
  }

  async function loadSummary() {
    const s = await getCommissionAdminSummary();
    if (s.success) setTotals(s.totals);
  }

  // Reps só carregam uma vez.
  useEffect(() => {
    (async () => {
      const r = await listRepresentativesForAdmin();
      if (r.success) setReps(r.data);
    })();
    loadSummary();
  }, []);

  // Recarrega eventos quando filtros mudam.
  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventFilters]);

  const repById = useMemo(() => new Map(reps.map((r) => [r.id, r.name])), [reps]);

  async function reloadAll() {
    await Promise.all([loadEvents(), loadSummary()]);
  }

  async function handleAReceber(ev: SalesCommissionEvent) {
    const ok = await confirm({
      title: 'Marcar como "a receber"?',
      message: (
        <div>
          <p>Reconhece esta comissão como devida (previsão → a receber).</p>
          <label className="block mt-3 text-[11px] text-gray-400">
            Previsão de pagamento (opcional)
            <input
              ref={receiveDateRef}
              type="date"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
            />
          </label>
        </div>
      ),
      severity: 'normal',
      confirmLabel: 'Marcar a receber',
    });
    if (!ok) return;
    setBusyId(ev.id);
    const r = await marcarComissaoAReceber(ev.id, receiveDateRef.current?.value || undefined);
    setBusyId(null);
    if (r.success) { toast.success('Comissão marcada como "a receber"'); reloadAll(); }
    else toast.error(r.error || 'Falha ao marcar');
  }

  async function handlePaga(ev: SalesCommissionEvent) {
    const ok = await confirm({
      title: 'Marcar comissão como paga?',
      message: (
        <div>
          <p>Confirma que o financeiro efetuou o pagamento desta comissão.</p>
          <label className="block mt-3 text-[11px] text-gray-400">
            Data do pagamento (opcional — hoje se vazio)
            <input
              ref={paidAtRef}
              type="date"
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
            />
          </label>
        </div>
      ),
      severity: 'normal',
      confirmLabel: 'Marcar paga',
    });
    if (!ok) return;
    setBusyId(ev.id);
    const r = await marcarComissaoPaga(ev.id, paidAtRef.current?.value || undefined);
    setBusyId(null);
    if (r.success) { toast.success('Comissão marcada como paga'); reloadAll(); }
    else toast.error(r.error || 'Falha ao pagar');
  }

  async function handleCancelar(ev: SalesCommissionEvent) {
    const ok = await confirm({
      title: 'Cancelar comissão?',
      message: (
        <div>
          <p>A comissão deixa de ser devida (proposta caiu / não devida). Não afeta comissões já pagas.</p>
          <label className="block mt-3 text-[11px] text-gray-400">
            Motivo (opcional)
            <textarea
              ref={cancelMotivoRef}
              rows={2}
              className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none resize-none"
              style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
            />
          </label>
        </div>
      ),
      severity: 'danger',
      confirmLabel: 'Cancelar comissão',
      cancelLabel: 'Voltar',
    });
    if (!ok) return;
    setBusyId(ev.id);
    const r = await cancelarComissao(ev.id, cancelMotivoRef.current?.value?.trim() || undefined);
    setBusyId(null);
    if (r.success) { toast.success('Comissão cancelada'); reloadAll(); }
    else toast.error(r.error || 'Falha ao cancelar');
  }

  async function handleExport() {
    setExporting(true);
    const exportFilters: { representanteId?: string; status?: string; mes?: string } = {};
    if (repFilter) exportFilters.representanteId = repFilter;
    if (statusFilter && statusFilter !== 'chargeback') exportFilters.status = statusFilter;
    const mes = mesToRef(mesFilter);
    if (mes) exportFilters.mes = mes;
    const r = await exportComissoesCSV(exportFilters);
    setExporting(false);
    if (!r.success || !('csv' in r)) { toast.error(('error' in r && r.error) || 'Falha ao exportar'); return; }
    const blob = new Blob([`﻿${r.csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comissoes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${r.count} comissõe(s) exportada(s)`);
  }

  function resetEstorno() {
    setEstRep(''); setEstValor(''); setEstMotivo('');
  }

  async function handleRegistrarEstorno() {
    if (!estRep) { toast.error('Selecione o representante'); return; }
    const valor = Number(String(estValor).replace(',', '.'));
    if (!isFinite(valor) || valor <= 0) { toast.error('Valor do estorno deve ser positivo'); return; }
    if (!estMotivo.trim()) { toast.error('Informe o motivo do estorno'); return; }
    setEstSaving(true);
    const r = await registrarEstorno({ representanteId: estRep, valor, motivo: estMotivo.trim() });
    setEstSaving(false);
    if (r.success) {
      toast.success('Estorno registrado');
      setEstornoOpen(false);
      resetEstorno();
      reloadAll();
    } else {
      toast.error(r.error || 'Falha ao registrar estorno');
    }
  }

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={Coins}
          title="Comissões"
          subtitle="Gestão financeira do canal"
          backHref="/admin/comercial"
          actions={
            <>
              <button
                onClick={() => setEstornoOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-300 border border-red-400/30 hover:bg-red-400/10"
              >
                <RotateCcw size={14} /> Registrar estorno
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-50"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar CSV
              </button>
            </>
          }
        />

        {/* Totais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <TotalCard label="Previsto" value={fmtBRL(totals?.previsto ?? 0)} accent="#F59E0B" />
          <TotalCard label="A receber" value={fmtBRL(totals?.aReceber ?? 0)} accent="#06B6D4" />
          <TotalCard label="Pago" value={fmtBRL(totals?.pago ?? 0)} accent="#10B981" />
          <TotalCard
            label="NF pendentes"
            value={String(totals?.comNotaPendente ?? 0)}
            accent={(totals?.comNotaPendente ?? 0) > 0 ? '#F97316' : '#22C55E'}
          />
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
          >
            <option value="">Todos os representantes</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="month"
            value={mesFilter}
            onChange={(e) => setMesFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]"
            title="Competência"
          />
          {(repFilter || statusFilter || mesFilter) && (
            <button
              onClick={() => { setRepFilter(''); setStatusFilter(''); setMesFilter(''); }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Limpar filtros
            </button>
          )}
          <span className="text-xs text-gray-500">{events.length} comissõe{events.length === 1 ? 'm' : 'ns'}</span>
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhuma comissão com estes filtros.</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Representante</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Proposta</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Competência</th>
                  <th className="px-3 py-2 text-right">Base</th>
                  <th className="px-3 py-2 text-right">%</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2">Previsão</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">NF</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {events.map((ev) => {
                  const neg = Number(ev.amount) < 0;
                  const canReceber = ev.status === 'forecast' || ev.status === 'potencial';
                  const canPagar = ev.status === 'accrued';
                  const canCancelar = ev.status === 'forecast' || ev.status === 'potencial' || ev.status === 'accrued';
                  const busy = busyId === ev.id;
                  return (
                    <tr key={ev.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-gray-300">{ev.representante?.name || repById.get(ev.representante_id) || '—'}</td>
                      <td className="px-3 py-2 text-white">{ev.account?.trade_name || ev.account?.legal_name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-cyan-400">{ev.proposal?.proposal_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">{COMMISSION_TYPE_LABELS[ev.type] || ev.type}</td>
                      <td className="px-3 py-2 text-gray-400">{fmtDate(ev.reference_month)}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{ev.base_value != null ? fmtBRL(ev.base_value) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{ev.percent != null ? fmtPercent(ev.percent) : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: neg ? '#F87171' : '#FFFFFF' }}>
                        {fmtBRLExact(ev.amount)}
                      </td>
                      <td className="px-3 py-2 text-gray-400">{fmtDate(ev.expected_payment_date)}</td>
                      <td className="px-3 py-2"><StatusBadge status={ev.status} /></td>
                      <td className="px-3 py-2 text-gray-400">
                        {ev.invoice_number ? (
                          <span className="text-emerald-300" title={fmtDate(ev.invoice_issued_at)}>{ev.invoice_number}</span>
                        ) : canPagar ? (
                          <span className="text-amber-400/70">pendente</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {busy ? (
                          <Loader2 size={13} className="animate-spin text-cyan-400 inline" />
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end">
                            {canReceber && (
                              <button
                                onClick={() => handleAReceber(ev)}
                                className="px-2 py-1 rounded-md text-[10px] font-bold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/10"
                              >
                                A receber
                              </button>
                            )}
                            {canPagar && (
                              <button
                                onClick={() => handlePaga(ev)}
                                className="px-2 py-1 rounded-md text-[10px] font-bold text-emerald-300 border border-emerald-400/30 hover:bg-emerald-400/10"
                              >
                                Marcar paga
                              </button>
                            )}
                            {canCancelar && (
                              <button
                                onClick={() => handleCancelar(ev)}
                                className="px-2 py-1 rounded-md text-[10px] font-bold text-red-300 border border-red-400/30 hover:bg-red-400/10"
                              >
                                Cancelar
                              </button>
                            )}
                            {!canReceber && !canPagar && !canCancelar && (
                              <span className="text-[10px] text-gray-600">—</span>
                            )}
                          </div>
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

      {/* Modal — registrar estorno */}
      {estornoOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(3,12,26,.72)', backdropFilter: 'blur(3px)' }}
            onClick={() => { if (!estSaving) { setEstornoOpen(false); resetEstorno(); } }}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-md rounded-2xl p-5"
            style={{ background: 'rgba(9,29,53,.97)', border: '1px solid rgba(248,113,113,.4)', boxShadow: '0 24px 64px rgba(0,0,0,.5)' }}
          >
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <RotateCcw size={16} className="text-red-300" /> Registrar estorno
            </h2>
            <p className="text-xs text-gray-500 mt-1">Lança um evento negativo (chargeback) ligado ao representante.</p>

            <label className="block mt-4 text-[11px] text-gray-400">
              Representante *
              <select
                value={estRep}
                onChange={(e) => setEstRep(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none bg-[#091D35]"
                style={{ border: '1px solid rgba(255,255,255,.14)' }}
              >
                <option value="">Selecione…</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>

            <label className="block mt-3 text-[11px] text-gray-400">
              Valor do estorno (R$) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={estValor}
                onChange={(e) => setEstValor(e.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
              />
            </label>

            <label className="block mt-3 text-[11px] text-gray-400">
              Motivo *
              <textarea
                rows={3}
                value={estMotivo}
                onChange={(e) => setEstMotivo(e.target.value)}
                placeholder="Ex.: contrato cancelado no 2º mês, reembolso integral."
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm text-white outline-none resize-none"
                style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.14)' }}
              />
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setEstornoOpen(false); resetEstorno(); }}
                disabled={estSaving}
                className="px-3 py-2 rounded-lg text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarEstorno}
                disabled={estSaving}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-white border border-red-400/40 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50"
              >
                {estSaving && <Loader2 size={13} className="animate-spin" />} Registrar estorno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
