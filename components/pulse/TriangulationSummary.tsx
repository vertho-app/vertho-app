'use client';

import { Zap, AlertTriangle, AlertCircle, TrendingDown, GitCompare } from 'lucide-react';
import type { TriangulationOutput, TriangulationItem } from '@/lib/pulse/triangulation';

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'bg-green-400/15 text-green-400',
  medium: 'bg-cyan-400/15 text-cyan-400',
  low: 'bg-amber-400/15 text-amber-400',
};

export function TriangulationSummary({ data }: { data: TriangulationOutput }) {
  if (data.confidence_level === 'low') {
    return (
      <div className="p-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04]">
        <p className="text-xs font-bold text-amber-400 mb-1">Triangulação com baixa confiança</p>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Dados ainda insuficientes pra leitura consolidada (poucos respondentes em T0/T2).
          Insights serão gerados quando o ciclo tiver mais respostas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo executivo */}
      <div className="p-4 rounded-xl border border-cyan-400/20" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Leitura agregada</p>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${CONFIDENCE_COLOR[data.confidence_level]}`}>
            Confiança {CONFIDENCE_LABEL[data.confidence_level]}
          </span>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">{data.summary}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BlocoItens
          icon={<Zap size={12} className="text-green-400" />}
          color="green"
          titulo="Aceleradores"
          itens={data.accelerators}
          empty="Sem aceleradores identificados ainda."
        />
        <BlocoItens
          icon={<TrendingDown size={12} className="text-amber-400" />}
          color="amber"
          titulo="Bloqueadores"
          itens={data.blockers}
          empty="Sem bloqueadores significativos."
        />
        <BlocoItens
          icon={<AlertTriangle size={12} className="text-red-400" />}
          color="red"
          titulo="Alertas"
          itens={data.alerts}
          empty="Sem alertas no momento."
        />
        <BlocoItens
          icon={<GitCompare size={12} className="text-purple-400" />}
          color="purple"
          titulo="Divergências declarado × observado"
          itens={data.divergences}
          empty="Declarado e observado estão alinhados."
        />
      </div>
    </div>
  );
}

const BORDER: Record<string, string> = {
  green: 'border-green-400/15',
  amber: 'border-amber-400/15',
  red: 'border-red-400/15',
  purple: 'border-purple-400/15',
};

function BlocoItens({ icon, color, titulo, itens, empty }: any) {
  return (
    <div className={`p-4 rounded-xl border ${BORDER[color]}`} style={{ background: '#0F2A4A' }}>
      <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        {icon} {titulo}
      </p>
      {itens.length === 0 ? (
        <p className="text-[11px] text-gray-500 italic">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {itens.map((it: TriangulationItem, i: number) => (
            <div key={i}>
              <p className="text-[11px] font-bold text-white mb-0.5">{it.title}</p>
              <p className="text-[10px] text-gray-400 leading-relaxed">{it.detail}</p>
              {it.dimensions.length > 0 && (
                <p className="text-[9px] text-gray-600 mt-0.5">{it.dimensions.join(' · ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
