'use client';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

export function OpenTextQuestion({ value, onChange, placeholder, maxLength = 1500, disabled }: Props) {
  return (
    <div className="space-y-1">
      <textarea
        disabled={disabled}
        value={value || ''}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        placeholder={placeholder || 'Escreva livremente...'}
        rows={5}
        className="w-full rounded-xl border border-white/10 bg-[#091D35] text-white text-sm px-4 py-3
                   focus:outline-none focus:border-cyan-400/50 resize-none disabled:opacity-40"
      />
      <div className="flex justify-between text-[9px] text-gray-600 px-1">
        <span>Opcional</span>
        <span>{(value || '').length} / {maxLength}</span>
      </div>
    </div>
  );
}
