'use client';

// Carteira do Canal (admin) — visão read-mostly dos clientes ativos do canal:
// renovações, risco de churn e potencial de expansão. A GESTÃO da conta é do RC
// no portal; aqui o admin apenas observa (por RC ou canal inteiro).
import { useEffect, useMemo, useState } from 'react';
import { Briefcase, Loader2 } from 'lucide-react';
import { getPortfolioAdmin } from '@/actions/sales/accounts';
import { listRepresentativesForAdmin } from '@/actions/sales/representatives';
import AdminPageHeader from '@/components/admin/page-header';
import { CHURN_RISK_LABELS, CHURN_RISK_COLORS, RENEWAL_SOON_DAYS } from '@/lib/sales/constants';
import { fmtDate } from '@/lib/sales/formatters';
import type { SalesRepresentative } from '@/lib/sales/types';

type PortfolioResult = Awaited<ReturnType<typeof getPortfolioAdmin>>;
type PortfolioData = Extract<PortfolioResult, { success: true }>;
type Row = PortfolioData['rows'][number];

function TotalCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl p-4 border h-full" style={{ background: 'rgba(255,255,255,.03)', borderColor: `${accent}30` }}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-xl font-bold mt-1" style={{ color: accent }}>{value}</p>
    </div>
  );
}

function ChurnBadge({ risk }: { risk: Row['churn_risk'] }) {
  if (!risk) return <span className="text-gray-600">—</span>;
  const color = CHURN_RISK_COLORS[risk] || '#6B7280';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold px-2 py-0.5 text-[10px]"
      style={{ background: `${color}1a`, border: `1px solid ${color}55`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {CHURN_RISK_LABELS[risk] || risk}
    </span>
  );
}

/** Renovação: data + selo relativo (vencida em vermelho, ≤90d em âmbar). */
function RenewalCell({ date, days }: { date: string | null; days: number | null }) {
  if (!date) return <span className="text-gray-600">—</span>;
  let rel: string;
  let color = '#9CA3AF';
  if (days == null) {
    rel = '';
  } else if (days < 0) {
    rel = 'vencida';
    color = '#EF4444';
  } else {
    rel = `em ${days}d`;
    if (days <= RENEWAL_SOON_DAYS) color = '#F59E0B';
  }
  return (
    <span className="whitespace-nowrap">
      <span className="text-gray-300">{fmtDate(date)}</span>
      {rel && <span className="ml-1.5 font-semibold" style={{ color }}>{rel}</span>}
    </span>
  );
}

export default function CarteiraPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [reps, setReps] = useState<SalesRepresentative[]>([]);
  const [repFilter, setRepFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => (repFilter ? { representanteId: repFilter } : undefined), [repFilter]);

  // Reps carregam uma vez (para o dropdown de filtro).
  useEffect(() => {
    (async () => {
      const r = await listRepresentativesForAdmin();
      if (r.success) setReps(r.data);
    })();
  }, []);

  // Carteira recarrega quando o filtro por RC muda.
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      const r = await getPortfolioAdmin(filters);
      if (r.success) setData(r);
      else setError(r.error || 'Falha ao carregar a carteira do canal');
      setLoading(false);
    })();
  }, [filters]);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <AdminPageHeader
          icon={Briefcase}
          title="Carteira do Canal"
          subtitle="Clientes ativos, renovações e risco"
          backHref="/admin/comercial"
        />

        {/* Totais do canal */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <TotalCard label="Clientes ativos" value={String(totals?.clientesAtivos ?? 0)} accent="#22D3EE" />
          <TotalCard label="Renovações próximas" value={String(totals?.renovacoesProximas ?? 0)} accent="#F59E0B" />
          <TotalCard
            label="Risco alto"
            value={String(totals?.riscoAlto ?? 0)}
            accent={(totals?.riscoAlto ?? 0) > 0 ? '#EF4444' : '#22C55E'}
          />
          <TotalCard label="Com potencial de expansão" value={String(totals?.comExpansao ?? 0)} accent="#8B5CF6" />
        </div>

        {/* Filtro por representante */}
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
          {repFilter && (
            <button
              onClick={() => setRepFilter('')}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Limpar filtro
            </button>
          )}
          <span className="text-xs text-gray-500">{rows.length} cliente{rows.length === 1 ? '' : 's'}</span>
        </div>

        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : error ? (
          <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/25 text-sm text-red-300">{error}</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhum cliente ativo no canal ainda.</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">RC</th>
                  <th className="px-3 py-2">Segmento</th>
                  <th className="px-3 py-2">Renovação</th>
                  <th className="px-3 py-2">Risco</th>
                  <th className="px-3 py-2">Expansão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => (
                  <tr key={r.account.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-semibold text-white">{r.account.trade_name || r.account.legal_name}</td>
                    <td className="px-3 py-2 text-gray-400">{r.repName}</td>
                    <td className="px-3 py-2 text-gray-400">{r.account.segment || '—'}</td>
                    <td className="px-3 py-2"><RenewalCell date={r.renewal_date} days={r.days_to_renewal} /></td>
                    <td className="px-3 py-2"><ChurnBadge risk={r.churn_risk} /></td>
                    <td className="px-3 py-2">
                      {r.expansion_potential ? (
                        <span
                          className="inline-flex items-center rounded-full font-semibold px-2 py-0.5 text-[10px]"
                          style={{ background: 'rgba(139,92,246,.12)', border: '1px solid rgba(139,92,246,.4)', color: '#A78BFA' }}
                        >
                          sim
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
