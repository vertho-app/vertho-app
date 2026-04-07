'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, CheckCircle2, Circle, Hammer, ArrowRight, AlertCircle } from 'lucide-react';
import { loadTrilhaAtual } from './praticar-actions';

export default function PraticarPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadTrilhaAtual(user.email);
      if (result.error) { setError(result.error); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  if (!data.semAtiva) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <AlertCircle size={40} className="text-gray-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Nenhuma trilha ativa</p>
          <p className="text-sm text-gray-400">Sua trilha de capacitacao ainda nao foi iniciada. Aguarde a atribuicao pelo RH.</p>
        </div>
      </div>
    );
  }

  const { semanaAtual, totalSemanas, pilula, ehImplementacao, trilha } = data;
  const progressPercent = Math.round((semanaAtual / totalSemanas) * 100);

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Praticar</h1>
        <p className="text-sm text-gray-400 mt-1">Trilha de Capacitacao — Fase 4</p>
      </div>

      {/* Progress */}
      <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Semana {semanaAtual} de {totalSemanas}</span>
          <span className="text-sm font-bold text-cyan-400">{progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
          <div className="h-full rounded-full transition-all duration-500 bg-cyan-400" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Implementation week card */}
      {ehImplementacao && (
        <div className="rounded-xl p-4 border border-amber-500/30" style={{ background: 'rgba(245, 158, 11, 0.08)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Hammer size={18} className="text-amber-400" />
            <span className="text-sm font-bold text-amber-400">Semana de Implementacao</span>
          </div>
          <p className="text-sm text-gray-300">
            Esta semana e dedicada a colocar em pratica o que voce aprendeu nas ultimas semanas. Registre sua evidencia abaixo!
          </p>
        </div>
      )}

      {/* Current pill */}
      {pilula && (
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={18} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">{pilula.titulo || `Pilula Semana ${semanaAtual}`}</span>
          </div>
          {pilula.resumo && <p className="text-sm text-gray-400 mb-3">{pilula.resumo}</p>}
          {pilula.url && (
            <a href={pilula.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors">
              Acessar conteudo <ArrowRight size={14} />
            </a>
          )}
        </div>
      )}

      {/* Evidence submission CTA */}
      <button onClick={() => router.push('/dashboard/praticar/evidencia')}
        className="w-full rounded-xl p-4 border border-teal-500/30 text-left hover:border-teal-500/50 transition-all"
        style={{ background: 'rgba(13, 148, 136, 0.1)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-teal-400">Registrar Evidencia</p>
            <p className="text-[11px] text-gray-400 mt-0.5">O que voce praticou esta semana?</p>
          </div>
          <ArrowRight size={18} className="text-teal-400" />
        </div>
      </button>

      {/* Past weeks */}
      <div>
        <h2 className="text-sm font-bold text-gray-300 mb-3">Historico de Semanas</h2>
        <div className="space-y-2">
          {trilha.map((s) => (
            <div key={s.semana}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.atual ? 'border-cyan-400/30' : 'border-white/[0.06]'}`}
              style={{ background: s.atual ? 'rgba(0, 180, 216, 0.06)' : '#0F2A4A' }}>
              {s.completada ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={18} className={`shrink-0 ${s.atual ? 'text-cyan-400' : 'text-gray-600'}`} />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${s.atual ? 'text-cyan-400' : s.completada ? 'text-white' : 'text-gray-500'}`}>
                  Semana {s.semana}
                  {s.ehImplementacao && <span className="ml-2 text-[10px] text-amber-400 font-bold uppercase">Implementacao</span>}
                </p>
              </div>
              {s.atual && <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Atual</span>}
              {s.completada && !s.atual && <span className="text-[10px] text-emerald-400">Concluida</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
