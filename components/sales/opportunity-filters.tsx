'use client';

// Portal do Representante — filtros da lista de oportunidades (controlado por props).
import { Search } from 'lucide-react';
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  PROTECTION_STATUS_LABELS,
  PRODUCT_PACKAGES,
  PRODUCT_PACKAGE_LABELS,
} from '@/lib/sales/constants';

export type OpportunitySort = 'valor_desc' | 'fechamento_asc' | 'proxima_acao_asc' | 'score_desc';

export const OPPORTUNITY_SORT_LABELS: Record<OpportunitySort, string> = {
  valor_desc: 'Maior valor',
  fechamento_asc: 'Fechamento mais próximo',
  proxima_acao_asc: 'Próxima ação mais próxima',
  score_desc: 'Maior score',
};

export type OpportunityFiltersValue = {
  search: string;
  stage: string;             // '' = todos
  protectionStatus: string;  // '' = todos
  productInterest: string;   // '' = todos
  sort: OpportunitySort;
};

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFiltersValue = {
  search: '',
  stage: '',
  protectionStatus: '',
  productInterest: '',
  sort: 'valor_desc',
};

const SELECT_CLS = 'px-3 py-2 rounded-lg text-xs text-white border border-white/10 bg-[#091D35] outline-none focus:border-cyan-400/60';

export default function OpportunityFilters({
  value,
  onChange,
}: {
  value: OpportunityFiltersValue;
  onChange: (next: OpportunityFiltersValue) => void;
}) {
  const set = (patch: Partial<OpportunityFiltersValue>) => onChange({ ...value, ...patch });

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[200px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Buscar por oportunidade ou conta…"
          className="w-full rounded-lg pl-8 pr-3 py-2 text-xs text-white outline-none bg-white/5 border border-white/10 focus:border-cyan-400/60 placeholder:text-gray-600"
        />
      </div>

      <select value={value.stage} onChange={(e) => set({ stage: e.target.value })} className={SELECT_CLS} aria-label="Filtrar por estágio">
        <option value="">Todos os estágios</option>
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>{STAGE_LABELS[s]}</option>
        ))}
      </select>

      <select value={value.protectionStatus} onChange={(e) => set({ protectionStatus: e.target.value })} className={SELECT_CLS} aria-label="Filtrar por proteção">
        <option value="">Toda proteção</option>
        {Object.entries(PROTECTION_STATUS_LABELS).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>

      <select value={value.productInterest} onChange={(e) => set({ productInterest: e.target.value })} className={SELECT_CLS} aria-label="Filtrar por produto">
        <option value="">Todos os produtos</option>
        {PRODUCT_PACKAGES.map((p) => (
          <option key={p} value={p}>{PRODUCT_PACKAGE_LABELS[p]}</option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => set({ sort: e.target.value as OpportunitySort })}
        className={SELECT_CLS}
        aria-label="Ordenar por"
      >
        {(Object.keys(OPPORTUNITY_SORT_LABELS) as OpportunitySort[]).map((s) => (
          <option key={s} value={s}>{OPPORTUNITY_SORT_LABELS[s]}</option>
        ))}
      </select>
    </div>
  );
}
