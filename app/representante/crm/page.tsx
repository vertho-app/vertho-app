'use client';

// Portal do Representante — lista de oportunidades (CRM).
// Filtros/ordenação client-side sobre listOpportunities().
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';
import { listOpportunities } from '@/actions/sales/opportunities';
import OpportunityFilters, {
  DEFAULT_OPPORTUNITY_FILTERS,
  type OpportunityFiltersValue,
} from '@/components/sales/opportunity-filters';
import OpportunityStageBadge from '@/components/sales/opportunity-stage-badge';
import ProtectionStatusBadge from '@/components/sales/protection-status-badge';
import { qualityScoreColor } from '@/components/sales/opportunity-quality-score';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { SalesOpportunity } from '@/lib/sales/types';

/** Ordena com nulls por último (datas ausentes não podem "vencer" a ordenação asc). */
function byDateAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export default function CrmPage() {
  const router = useRouter();
  const [opps, setOpps] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OpportunityFiltersValue>(DEFAULT_OPPORTUNITY_FILTERS);

  useEffect(() => {
    (async () => {
      const r = await listOpportunities();
      if (r.success) setOpps(r.data);
      else toast.error(r.error);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    let list = opps.filter((o) => {
      if (filters.stage && o.stage !== filters.stage) return false;
      if (filters.protectionStatus && o.protection_status !== filters.protectionStatus) return false;
      if (filters.productInterest && o.product_interest !== filters.productInterest) return false;
      if (term) {
        const haystack = [
          o.opportunity_name,
          o.account?.legal_name,
          o.account?.trade_name,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
    list = [...list];
    switch (filters.sort) {
      case 'valor_desc':
        list.sort((a, b) => (Number(b.estimated_value) || 0) - (Number(a.estimated_value) || 0));
        break;
      case 'fechamento_asc':
        list.sort((a, b) => byDateAsc(a.estimated_close_date, b.estimated_close_date));
        break;
      case 'proxima_acao_asc':
        list.sort((a, b) => byDateAsc(a.next_action_date, b.next_action_date));
        break;
      case 'score_desc':
        list.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0));
        break;
    }
    return list;
  }, [opps, filters]);

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 text-white">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Oportunidades</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Carregando…' : `${opps.length} registro${opps.length === 1 ? '' : 's'} no seu pipeline`}
          </p>
        </div>
        <button
          onClick={() => router.push('/representante/crm/nova')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-[#04121F] bg-cyan-400 hover:bg-cyan-300"
        >
          <Plus size={16} /> Registrar oportunidade
        </button>
      </div>

      <div className="mb-4">
        <OpportunityFilters value={filters} onChange={setFilters} />
      </div>

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" />
        </div>
      ) : opps.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-white/[0.03] border border-white/10">
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Registre sua primeira oportunidade — o registro formal inicia a proteção comercial de 90 dias.
          </p>
          <button
            onClick={() => router.push('/representante/crm/nova')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10"
          >
            <Plus size={14} /> Registrar oportunidade
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500 rounded-xl bg-white/[0.03] border border-white/10">
          Nenhuma oportunidade com esses filtros.
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead className="bg-white/[0.04]">
              <tr className="text-left text-[10px] uppercase text-gray-500">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2">Estágio</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Próx. ação</th>
                <th className="px-3 py-2">Proteção</th>
                <th className="px-3 py-2 text-center">Score</th>
                <th className="px-3 py-2">Fechamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/representante/crm/${o.id}`)}
                  className="hover:bg-white/[0.03] cursor-pointer"
                >
                  <td className="px-3 py-2.5 font-bold text-white max-w-[220px] truncate">{o.opportunity_name}</td>
                  <td className="px-3 py-2.5 text-gray-300 max-w-[180px] truncate">
                    {o.account?.trade_name || o.account?.legal_name || '—'}
                  </td>
                  <td className="px-3 py-2.5"><OpportunityStageBadge stage={o.stage} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{fmtBRL(o.estimated_value)}</td>
                  <td className="px-3 py-2.5 text-gray-300">
                    {o.next_action ? (
                      <span className="block max-w-[160px] truncate" title={o.next_action}>
                        {o.next_action}
                        <span className="text-gray-500"> · {fmtDate(o.next_action_date)}</span>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <ProtectionStatusBadge status={o.protection_status} protectionEnd={o.protection_end_date} />
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold tabular-nums" style={{ color: qualityScoreColor(o.quality_score || 0) }}>
                    {o.quality_score ?? 0}
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">{fmtDate(o.estimated_close_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
