'use client';

import { Activity } from 'lucide-react';
import type { SignalScore } from '@/lib/pulse/signal-scoring';
import { SIGNAL_LABELS, classifySignal } from '@/lib/pulse/signal-scoring';

interface Props {
  signals: SignalScore[];
}

const SIGNAL_HINT: Record<string, string> = {
  engagement_ia:    'Interações por colab / semana',
  response_depth:   'Caracteres médios por resposta',
  completion_rate:  '% com pelo menos 1 resposta',
  pulse_completion: '% dos pulsos finalizados',
};

const COLOR_BAR: Record<string, string> = {
  green: 'bg-green-400',
  cyan: 'bg-cyan-400',
  amber: 'bg-amber-400',
  red: 'bg-red-400',
};

const COLOR_TEXT: Record<string, string> = {
  green: 'text-green-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
};

export function PulseSignalsCard({ signals }: Props) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
      <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-4">
        <Activity size={12} className="text-purple-400" /> Sinais da jornada
      </p>
      <div className="space-y-3">
        {signals.map(s => {
          const cls = classifySignal(s.score);
          const pct = (s.score / 5) * 100;
          return (
            <div key={s.signal} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-white">{SIGNAL_LABELS[s.signal]}</span>
                <span className="text-[10px] text-gray-500">
                  <span className={COLOR_TEXT[cls.color]}>{s.score}/5</span>
                  <span className="ml-2 text-gray-600">{SIGNAL_HINT[s.signal]}: {s.raw}</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                <div className={`h-full ${COLOR_BAR[cls.color]} transition-all`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-gray-600 mt-3 leading-relaxed">
        Sinais derivados de dados comportamentais (uso da MentorIA, respostas, completude).
        Linguagem cautelosa — não substituem leitura humana.
      </p>
    </div>
  );
}
