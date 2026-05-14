'use client';

import { MessageCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ThemeAggregate } from '@/actions/pulse/classify';

interface Props {
  themes: ThemeAggregate[];
  total: number;
  confidence_summary?: { high: number; medium: number; low: number };
}

const POLARITY_COLOR: Record<string, string> = {
  positive: 'border-green-400/30 bg-green-400/[0.04] text-green-300',
  negative: 'border-amber-400/30 bg-amber-400/[0.04] text-amber-300',
  neutral:  'border-white/[0.08] bg-white/[0.02] text-gray-300',
};

const POLARITY_ICON: Record<string, any> = {
  positive: <TrendingUp size={10} />,
  negative: <TrendingDown size={10} />,
  neutral:  <Minus size={10} />,
};

export function PulseThemesCloud({ themes, total, confidence_summary }: Props) {
  if (!themes?.length) {
    return (
      <div className="rounded-xl border border-white/[0.06] p-5 text-center" style={{ background: '#0F2A4A' }}>
        <MessageCircle size={20} className="text-gray-500 mx-auto mb-2" />
        <p className="text-xs text-gray-500">Nenhum tema extraído ainda.</p>
        <p className="text-[10px] text-gray-600 mt-1">
          Rode a classificação IA quando houver respostas abertas no ciclo.
        </p>
      </div>
    );
  }

  const cfg = confidence_summary;
  const totalClass = cfg ? cfg.high + cfg.medium + cfg.low : 0;
  const pctConfiavel = totalClass > 0 ? Math.round(((cfg!.high + cfg!.medium) / totalClass) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-white flex items-center gap-1.5">
          <MessageCircle size={12} className="text-lilac-300" style={{ color: '#E1AAEF' }} /> Temas das respostas abertas
        </p>
        <span className="text-[9px] text-gray-500">{total} resposta{total !== 1 ? 's' : ''} classificada{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {themes.map(t => (
          <div key={t.theme_key}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold border ${POLARITY_COLOR[t.polarity]}`}>
            {POLARITY_ICON[t.polarity]}
            <span>{t.theme_label}</span>
            <span className="opacity-70">·</span>
            <span className="text-[9px]">{t.count}</span>
            <span className="text-[9px] opacity-60">({t.pct}%)</span>
          </div>
        ))}
      </div>

      {cfg && totalClass > 0 && (
        <p className="text-[9px] text-gray-500">
          Classificação Dual-IA · {pctConfiavel}% das respostas com confidence ≥ média
          {cfg.low > 0 && <> · {cfg.low} resposta(s) baixa confiança ignorada(s)</>}
        </p>
      )}
    </div>
  );
}
