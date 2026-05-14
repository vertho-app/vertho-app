'use client';

import { ShieldAlert } from 'lucide-react';

interface Props {
  n: number;
  threshold?: number;
}

/**
 * Mensagem padrão exibida quando um recorte agregado tem menos de N respondentes.
 * Threshold padrão = 7 (spec do módulo Pulso). Reutilizável em qualquer card.
 */
export function AnonymityGuardMessage({ n, threshold = 7 }: Props) {
  return (
    <div className="flex gap-3 p-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05]">
      <ShieldAlert size={18} className="text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-xs text-amber-300 font-semibold mb-1">
          Dados não exibidos para preservar anonimato.
        </p>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Este recorte não atingiu o mínimo de {threshold} participantes ({n} resposta{n === 1 ? '' : 's'}).
        </p>
      </div>
    </div>
  );
}
