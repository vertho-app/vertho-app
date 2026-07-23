'use client';

import { Check } from 'lucide-react';

interface PairOption {
  key: string;
  label: string;
}

interface Props {
  options: PairOption[];
  value: string | null;
  onChange: (selectedOptionKey: string) => void;
  disabled?: boolean;
}

export function DiscPairQuestion({ options, value, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      {options.map(option => {
        const selected = value === option.key;
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.key)}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-4 text-left text-sm transition-all
              ${selected
                ? 'border-cyan-400/60 bg-cyan-400/10 text-white'
                : 'border-white/10 bg-[#091D35] text-gray-300 hover:border-cyan-400/30 hover:text-white'}
              disabled:opacity-40`}
          >
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border
              ${selected ? 'border-cyan-400 bg-cyan-400 text-[#0F2B54]' : 'border-white/20'}`}
            >
              {selected && <Check size={13} />}
            </span>
            <span className="font-medium leading-relaxed">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
