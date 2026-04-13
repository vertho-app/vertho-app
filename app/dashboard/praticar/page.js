'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, CheckCircle2, Circle, Hammer, ArrowRight, AlertCircle } from 'lucide-react';
import { loadTrilhaAtual } from './praticar-actions';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';

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
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <PageContainer><p className="text-center text-gray-400">{error}</p></PageContainer>;
  if (!data) return null;

  // ── Estado: sem trilha preparada ─────────────────────────────────────────
  if (!data.semAtiva) {
    return (
      <PageContainer>
        <PageHero eyebrow="CAPACITAÇÃO" title="Trilha ainda não preparada" subtitle="Assim que seu PDI for concluído, o RH vai montar sua trilha personalizada de capacitação." />
        <div className="flex justify-center">
          <GlassCard className="text-center max-w-[560px] w-full" padding="p-8">
            <AlertCircle size={40} className="text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-5">
              Enquanto isso, você pode acompanhar seu progresso na jornada ou revisar seu perfil comportamental.
            </p>
            <button onClick={() => router.push('/dashboard')}
              className="px-6 py-3 rounded-full text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              Voltar ao dashboard
            </button>
          </GlassCard>
        </div>
      </PageContainer>
    );
  }

  // ── Estado: trilha preparada mas capacitação ainda não iniciada ─────────
  if (data.status === 'preparada') {
    return (
      <PageContainer>
        <PageHero
          eyebrow="CAPACITAÇÃO"
          title="Sua trilha está pronta"
          titleAccent="— aguardando início"
          subtitle={`Competência foco: ${data.competenciaFoco || 'em definição'}. O RH vai iniciar sua capacitação em breve e você receberá uma notificação quando começar.`}
        />

        {data.cursos?.length > 0 ? (
          <GlassCard>
            <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase mb-4">
              {data.cursos.length} cursos mapeados
            </p>
            <div className="space-y-2">
              {data.cursos.map((c, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-white/[0.04]"
                  style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <BookOpen size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{c.nome || `Curso ${i + 1}`}</p>
                    {c.competencia && <p className="text-[10px] text-gray-500 mt-0.5">{c.competencia}</p>}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        ) : (
          <GlassCard className="border-amber-400/20 text-center" padding="p-6">
            <p className="text-xs text-amber-400">Nenhum curso foi mapeado ainda para sua trilha. O RH vai completar essa configuração.</p>
          </GlassCard>
        )}
      </PageContainer>
    );
  }

  // ── Estado: trilha ativa ────────────────────────────────────────────────
  const { semanaAtual, totalSemanas, pilula, ehImplementacao, trilha } = data;
  const progressPercent = Math.round((semanaAtual / totalSemanas) * 100);

  return (
    <PageContainer>
      <PageHero
        eyebrow="CAPACITAÇÃO · FASE 4"
        title={`Semana ${semanaAtual} de ${totalSemanas}`}
        titleAccent={`— ${progressPercent}%`}
        subtitle={ehImplementacao
          ? 'Esta é uma semana de implementação — coloque em prática o que aprendeu.'
          : 'Assista o conteúdo da semana e registre sua evidência no fim.'}
      />

      {/* Progress bar */}
      <GlassCard className="mb-5" padding="p-4 md:p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Progresso da trilha</span>
          <span className="text-sm font-extrabold text-cyan-400">{progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPercent}%`, background: 'linear-gradient(90deg, #00B4D8, #0D9488)' }} />
        </div>
      </GlassCard>

      {/* Semana de implementação */}
      {ehImplementacao && (
        <GlassCard className="border-amber-500/30 mb-5" padding="p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Hammer size={18} className="text-amber-400" />
            <span className="text-sm font-bold text-amber-400">Semana de Implementação</span>
          </div>
          <p className="text-sm text-gray-300">
            Esta semana é dedicada a colocar em prática o que você aprendeu nas últimas semanas. Registre sua evidência abaixo!
          </p>
        </GlassCard>
      )}

      {/* Pílula da semana */}
      {pilula && (
        <GlassCard className="mb-5" padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={18} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">{pilula.titulo || `Pílula Semana ${semanaAtual}`}</span>
          </div>
          {pilula.resumo && <p className="text-sm text-gray-400 mb-3 leading-relaxed">{pilula.resumo}</p>}
          {pilula.url && (
            <a href={pilula.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
              Acessar conteúdo <ArrowRight size={14} />
            </a>
          )}
        </GlassCard>
      )}

      {/* CTA registrar evidência */}
      <button onClick={() => router.push('/dashboard/praticar/evidencia')}
        className="w-full rounded-2xl p-5 border-2 text-left transition-all hover:scale-[1.01] active:scale-[0.99] mb-10"
        style={{
          background: 'rgba(13,148,136,0.12)',
          borderColor: 'rgba(13,148,136,0.5)',
          boxShadow: '0 0 24px rgba(13,148,136,0.18)',
        }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm md:text-base font-extrabold text-teal-400">Registrar Evidência</p>
            <p className="text-xs text-gray-400 mt-1">O que você praticou esta semana?</p>
          </div>
          <ArrowRight size={20} className="text-teal-400 shrink-0" />
        </div>
      </button>

      {/* Histórico de semanas */}
      <div>
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mb-3">
          Histórico de semanas
        </p>
        <div className="space-y-2">
          {trilha.map(s => (
            <div key={s.semana}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                s.atual ? 'border-cyan-400/40' : 'border-white/[0.06]'
              }`}
              style={{
                background: s.atual ? 'rgba(0,180,216,0.08)' : 'rgba(255,255,255,0.02)',
              }}>
              {s.completada ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={18} className={`shrink-0 ${s.atual ? 'text-cyan-400' : 'text-gray-600'}`} />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${s.atual ? 'text-cyan-400' : s.completada ? 'text-white' : 'text-gray-500'}`}>
                  Semana {s.semana}
                  {s.ehImplementacao && (
                    <span className="ml-2 text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                      Implementação
                    </span>
                  )}
                </p>
              </div>
              {s.atual && <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Atual</span>}
              {s.completada && !s.atual && <span className="text-[10px] text-emerald-400 font-bold">Concluída</span>}
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
