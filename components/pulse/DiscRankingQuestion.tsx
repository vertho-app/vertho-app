'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

interface RankingOption {
  key: string;
  label: string;
}

interface Props {
  options: RankingOption[];
  value: string[] | null;
  onConfirm: (orderedOptionKeys: string[]) => void;
  disabled?: boolean;
  mostSimilarLabel: string;
  leastSimilarLabel: string;
}

export function DiscRankingQuestion({
  options,
  value,
  onConfirm,
  disabled,
  mostSimilarLabel,
  leastSimilarLabel,
}: Props) {
  const [orderedKeys, setOrderedKeys] = useState(
    () => value?.length === options.length ? value : options.map(option => option.key),
  );

  const optionByKey = new Map(options.map(option => [option.key, option]));

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= orderedKeys.length) return;
    setOrderedKeys(current => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-[10px] font-semibold text-emerald-400">{mostSimilarLabel}</p>
      <div className="space-y-2">
        {orderedKeys.map((key, index) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#091D35] px-3 py-2.5"
          >
            <GripVertical size={14} className="shrink-0 text-gray-600" />
            <span className="flex-1 text-sm font-medium text-white">
              {optionByKey.get(key)?.label || key}
            </span>
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={disabled || index === 0}
              aria-label="Mover para cima"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-20"
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={disabled || index === orderedKeys.length - 1}
              aria-label="Mover para baixo"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-20"
            >
              <ChevronDown size={16} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-center text-[10px] font-semibold text-amber-400">{leastSimilarLabel}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onConfirm(orderedKeys)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-400/15 disabled:opacity-40"
      >
        <Check size={15} />
        {value ? 'Atualizar ordem' : 'Confirmar ordem'}
      </button>
    </div>
  );
}
