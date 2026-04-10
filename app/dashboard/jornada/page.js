'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, CheckCircle2, Circle, Clock, ChevronRight } from 'lucide-react';
import { loadJornada } from './jornada-actions';

const FASE_HREF = {
  1: '/dashboard/perfil-comportamental',
  2: '/dashboard/assessment',
  3: '/dashboard/pdi',
  4: '/dashboard/praticar',
  5: '/dashboard/evolucao',
};

const STATUS_CONFIG = {
  completed: {
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    icon: CheckCircle2,
    label: 'Concluida',
  },
  'in-progress': {
    color: '#00B4D8',
    bgColor: 'rgba(0, 180, 216, 0.12)',
    borderColor: 'rgba(0, 180, 216, 0.3)',
    icon: Clock,
    label: 'Em andamento',
  },
  pending: {
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.06)',
    icon: Circle,
    label: 'Pendente',
  },
};

export default function JornadaPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadJornada(user.email);
      if (result.error) { setError(result.error); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador, fases } = data;

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Sua Jornada</h1>
        <p className="text-sm text-gray-400 mt-1">{colaborador.nome_completo}</p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {fases.map((fase, idx) => {
          const config = STATUS_CONFIG[fase.status];
          const Icon = config.icon;
          const isLast = idx === fases.length - 1;

          return (
            <div key={fase.fase} className="flex gap-4">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border"
                  style={{ background: config.bgColor, borderColor: config.borderColor }}>
                  <Icon size={20} style={{ color: config.color }} />
                </div>
                {!isLast && (
                  <div className="w-0.5 flex-1 min-h-[24px]"
                    style={{ background: fase.status === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.06)' }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-6">
                <button
                  onClick={() => {
                    const href = FASE_HREF[fase.fase];
                    if (href) router.push(href);
                  }}
                  className="w-full rounded-xl p-4 border text-left transition-all hover:brightness-110 hover:border-white/20 active:scale-[0.98]"
                  style={{ background: '#0F2A4A', borderColor: config.borderColor }}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <p className="text-sm font-bold text-white">Fase {fase.fase} — {fase.titulo}</p>
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
                      style={{ color: config.color, background: config.bgColor }}>
                      {config.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400">{fase.descricao}</p>
                      {fase.data && (
                        <p className="text-[10px] text-gray-500 mt-1">
                          {new Date(fase.data).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-gray-500 shrink-0" />
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
