'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { TrendingUp, ArrowUp, ArrowDown, Minus, Loader2, BarChart3, Target } from 'lucide-react';
import { loadEvolucao } from './evolucao-actions';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';

export default function EvolucaoPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadEvolucao(user.email);
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <PageContainer><p className="text-center text-gray-400">{error}</p></PageContainer>;
  if (!data) return null;

  const { competencias, metricas, descritores } = data;

  if (competencias.length === 0) {
    return (
      <PageContainer>
        <PageHero
          eyebrow="SUA EVOLUÇÃO"
          title="Ainda sem dados de evolução"
          subtitle="Seus dados de evolução aparecerão aqui após você completar as avaliações."
        />
        <div className="flex justify-center">
          <GlassCard className="text-center max-w-[520px] w-full" padding="p-8">
            <TrendingUp size={40} className="text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              Complete as avaliações de competências pra começar a acompanhar sua evolução ao longo do tempo.
            </p>
          </GlassCard>
        </div>
      </PageContainer>
    );
  }

  const trendBg = metricas.deltaMedia > 0 ? 'rgba(16,185,129,0.12)'
    : metricas.deltaMedia < 0 ? 'rgba(239,68,68,0.12)'
    : 'rgba(148,163,184,0.12)';

  return (
    <PageContainer className="space-y-5">
      <PageHero
        eyebrow="SUA EVOLUÇÃO"
        title="Progresso por competência"
        subtitle="Compare suas avaliações ao longo do tempo e veja onde cresceu mais."
      />

      {/* Métricas principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <GlassCard padding="p-5">
          <BarChart3 size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl md:text-3xl font-black text-white">{metricas.totalAvaliadas}</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mt-1">Competências avaliadas</p>
        </GlassCard>
        <GlassCard padding="p-5">
          <Target size={18} className="text-cyan-400 mb-2" />
          <p className="text-2xl md:text-3xl font-black text-white">{metricas.notaMedia}</p>
          <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mt-1">Nota média</p>
        </GlassCard>
        {metricas.comReavaliacao > 0 && (
          <GlassCard padding="p-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: trendBg }}>
              {metricas.deltaMedia > 0 ? <ArrowUp size={18} className="text-emerald-400" /> :
               metricas.deltaMedia < 0 ? <ArrowDown size={18} className="text-red-400" /> :
               <Minus size={18} className="text-gray-400" />}
            </div>
            <p className={`text-2xl md:text-3xl font-black ${metricas.deltaMedia > 0 ? 'text-emerald-400' : metricas.deltaMedia < 0 ? 'text-red-400' : 'text-white'}`}>
              {metricas.deltaMedia > 0 ? '+' : ''}{metricas.deltaMedia}
            </p>
            <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mt-1">
              Evolução média · {metricas.comReavaliacao} reavaliadas
            </p>
          </GlassCard>
        )}
      </div>

      <div className="space-y-2">
        {competencias.map((comp, i) => {
          const notaInicial = comp.inicial?.nota_decimal || 0;
          const notaFinal = comp.reavaliacao?.nota_decimal || notaInicial;
          const delta = comp.reavaliacao ? notaFinal - notaInicial : null;
          const nivelFinal = comp.reavaliacao?.nivel || comp.inicial?.nivel || '—';

          return (
            <div key={i} className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-white">{comp.nome}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400">N{nivelFinal}</span>
                  {delta !== null && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      delta > 0 ? 'bg-green-400/10 text-green-400' : delta < 0 ? 'bg-red-400/10 text-red-400' : 'bg-gray-400/10 text-gray-400'
                    }`}>{delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 w-12">Inicial</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full bg-gray-500" style={{ width: `${Math.min(100, notaInicial * 10)}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 w-6 text-right">{notaInicial}</span>
                </div>
                {comp.reavaliacao && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-cyan-400 w-12">Atual</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, notaFinal * 10)}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-cyan-400 w-6 text-right">{notaFinal}</span>
                  </div>
                )}
              </div>
              {comp.inicial?.avaliacao_final?.feedback?.resumo && (
                <p className="text-[11px] text-gray-400 mt-2 leading-relaxed border-l-2 border-white/10 pl-2">
                  {comp.inicial.avaliacao_final.feedback.resumo}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {descritores.length > 0 && (
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-purple-400 mb-3">Evolução por Descritor</p>
          <div className="space-y-2">
            {descritores.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-gray-300 flex-1 truncate">{d.descritor || d.competencia_nome || `Descritor ${i + 1}`}</span>
                <span className={`text-[10px] font-bold ${(d.delta || 0) > 0 ? 'text-green-400' : (d.delta || 0) < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  {(d.delta || 0) > 0 ? '+' : ''}{d.delta || 0}
                </span>
                {d.convergencia && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-400/10 text-purple-400">{d.convergencia}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
