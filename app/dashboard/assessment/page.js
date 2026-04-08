'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, CheckCircle, Clock, ChevronRight, Brain } from 'lucide-react';
import { loadAssessmentData } from './assessment-actions';

export default function AssessmentPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadAssessmentData(user.email);
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { competencias, sessoes, colaborador } = data;

  if (!competencias.length) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <Brain size={40} className="text-gray-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Avaliação de Competências</p>
          <p className="text-sm text-gray-400">Nenhuma competência disponível para avaliação no momento. O administrador precisa configurar as competências da sua empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6">
      <div className="mb-6">
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400">Avaliação</p>
        <h1 className="text-xl font-bold text-white mt-1">Suas Competências</h1>
        <p className="text-sm text-gray-400 mt-1">{sessoes.filter(s => s.status === 'concluido').length}/{competencias.length} concluídas</p>
      </div>

      {/* Progress */}
      <div className="rounded-xl p-4 mb-6 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Progresso</span>
          <span className="text-sm font-bold text-cyan-400">
            {competencias.length > 0 ? Math.round((sessoes.filter(s => s.status === 'concluido').length / competencias.length) * 100) : 0}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
          <div className="h-full rounded-full bg-cyan-400 transition-all"
            style={{ width: `${competencias.length > 0 ? (sessoes.filter(s => s.status === 'concluido').length / competencias.length) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Competency list */}
      <div className="space-y-2">
        {competencias.map(comp => {
          const sessao = sessoes.find(s => s.competencia_id === comp.id);
          const concluida = sessao?.status === 'concluido';
          const emAndamento = sessao?.status === 'em_andamento';

          return (
            <button key={comp.id}
              onClick={() => {
                if (concluida) return; // Já concluída — não permite refazer
                router.push(`/dashboard/assessment/chat?competencia=${comp.id}`);
              }}
              disabled={concluida}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                concluida
                  ? 'border-green-400/20 opacity-70'
                  : emAndamento
                    ? 'border-cyan-400/30 hover:border-cyan-400/50'
                    : 'border-white/[0.06] hover:border-white/[0.15]'
              }`}
              style={{ background: '#0F2A4A' }}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                concluida ? 'bg-green-400/10' : emAndamento ? 'bg-cyan-400/10' : 'bg-white/[0.06]'
              }`}>
                {concluida ? <CheckCircle size={18} className="text-green-400" /> :
                 emAndamento ? <Clock size={18} className="text-cyan-400" /> :
                 <Brain size={18} className="text-gray-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{comp.nome}</p>
                {comp.pilar && <p className="text-[10px] text-gray-500">{comp.pilar}</p>}
                {concluida && sessao?.nivel && (
                  <p className="text-[10px] text-green-400 mt-0.5">Nível {sessao.nivel} — Nota {sessao.nota_decimal}</p>
                )}
                {emAndamento && (
                  <p className="text-[10px] text-cyan-400 mt-0.5">Em andamento — {sessao.confianca || 0}% confiança</p>
                )}
              </div>
              {!concluida && <ChevronRight size={16} className="text-gray-600 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
