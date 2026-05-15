'use client';

interface Props {
  total: number | null;
  dor: number | null;
  capacidade: number | null;
  fit: number | null;
  classificacaoLabel: string | null;
  classificacao: string | null;
}

const BANDA_COR: Record<string, string> = {
  abordar_agora: '#2ECC71',
  boa: '#34C5CC',
  nutrir: '#F4B740',
  baixa: '#94A3B8',
};

function Barra({ label, valor }: { label: string; valor: number | null }) {
  const v = valor ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-semibold">{valor == null ? '—' : v.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full bg-cyan-400 transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function RadarScoreCard({ total, dor, capacidade, fit, classificacaoLabel, classificacao }: Props) {
  const cor = classificacao ? (BANDA_COR[classificacao] || '#94A3B8') : '#94A3B8';
  return (
    <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">Score de Oportunidade</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold" style={{ color: cor }}>
              {total == null ? '—' : Math.round(total)}
            </span>
            <span className="text-xs text-gray-500">/ 100</span>
          </div>
        </div>
        {classificacaoLabel && (
          <span className="text-[10px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: `${cor}22`, color: cor }}>
            {classificacaoLabel}
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        <Barra label="Dor provável de pessoas (40%)" valor={dor} />
        <Barra label="Capacidade de compra (30%)" valor={capacidade} />
        <Barra label="Fit Vertho (30%)" valor={fit} />
      </div>
      <p className="text-[9px] text-gray-600 mt-3">
        Score por regras, auditável (v1). Contexto setorial (SIDRA) entra na próxima fase.
      </p>
    </div>
  );
}
