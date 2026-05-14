'use client';

import { LIKERT_LABELS } from '@/lib/pulse/template';

interface Props {
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/**
 * Likert 1-5 com labels. Mobile-first: bola grande, fácil de tocar.
 * Cor selecionada usa --cyan da identidade Vertho.
 */
export function LikertScale({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-1.5">
        {[1, 2, 3, 4, 5].map(n => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`flex-1 aspect-square max-w-[60px] rounded-full text-sm font-bold transition-all
                ${selected
                  ? 'bg-cyan-400 text-[#0F2B54] scale-110 shadow-lg shadow-cyan-400/30'
                  : 'bg-white/[0.04] text-gray-400 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-300'}
                disabled:opacity-40 disabled:cursor-not-allowed`}
              aria-label={LIKERT_LABELS[n]}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500 px-1">
        <span>Discordo</span>
        <span>Concordo</span>
      </div>
      {value != null && (
        <p className="text-center text-[11px] text-cyan-400 font-medium">{LIKERT_LABELS[value]}</p>
      )}
    </div>
  );
}
