'use client';

// Portal do Representante — score de qualidade da oportunidade (0-100).
// Mede COMPLETUDE do registro (base do pipeline qualificado) e mostra
// o checklist do que falta para qualificar.
import { CheckCircle2, Circle } from 'lucide-react';
import { calculateQualityScore, qualityScoreComponents, type QualityScoreInput } from '@/lib/sales/quality-score';
import { QUALIFIED_MIN_SCORE } from '@/lib/sales/constants';

export function qualityScoreColor(score: number): string {
  if (score >= 70) return '#22C55E';
  if (score >= 40) return '#F59E0B';
  return '#EF4444';
}

export default function OpportunityQualityScore({ input, className }: { input: QualityScoreInput; className?: string }) {
  const components = qualityScoreComponents(input);
  const score = calculateQualityScore(input);
  const color = qualityScoreColor(score);
  const missing = components.filter((c) => !c.earned);

  return (
    <div className={`rounded-xl bg-white/[0.03] border border-white/10 p-4 ${className ?? ''}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Score de qualidade</h3>
        <span className="text-lg font-bold" style={{ color }}>
          {score}
          <span className="text-[11px] text-gray-500 font-semibold">/100</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      {missing.length === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
          <CheckCircle2 size={12} className="shrink-0" />
          Registro completo — oportunidade qualificada.
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-[11px] text-gray-500 mb-1.5">
            O que falta para completar o registro{score < QUALIFIED_MIN_SCORE ? ` (qualificada a partir de ${QUALIFIED_MIN_SCORE})` : ''}:
          </p>
          <ul className="space-y-1">
            {missing.map((c) => (
              <li key={c.key} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <Circle size={9} className="text-gray-600 shrink-0" />
                <span className="min-w-0 flex-1">{c.label}</span>
                <span className="text-gray-600 font-semibold">+{c.points}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
