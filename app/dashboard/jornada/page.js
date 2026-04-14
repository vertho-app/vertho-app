'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Check, CircleDot, Lock, ArrowRight, ChevronRight } from 'lucide-react';
import { loadJornada } from './jornada-actions';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';

const FASE_HREF = {
  1: '/dashboard/perfil-comportamental',
  2: '/dashboard/assessment',
  3: '/dashboard/pdi',
  4: '/dashboard/temporada',
  5: '/dashboard/evolucao',
};

const CTA_LABEL = {
  1: 'Fazer diagnóstico (DISC)',
  2: 'Iniciar avaliação',
  3: 'Ver meu PDI',
  4: 'Ver minha temporada',
  5: 'Ver minha evolução',
};

const STATUS_LABEL = {
  completed: 'Concluída',
  current: 'Em curso',
  pending: 'Bloqueada',
};

function StepDot({ status }) {
  if (status === 'completed') {
    return (
      <div className="rounded-full flex items-center justify-center border-2 w-11 h-11 shrink-0"
        style={{
          background: '#0F2A4A',
          borderColor: '#00B4D8',
          boxShadow: '0 0 12px rgba(0,180,216,0.4)',
        }}>
        <Check size={20} className="text-cyan-400" strokeWidth={3} />
      </div>
    );
  }
  if (status === 'current') {
    return (
      <div className="rounded-full flex items-center justify-center border-2 w-12 h-12 shrink-0"
        style={{
          background: '#0F2A4A',
          borderColor: '#00B4D8',
          boxShadow: '0 0 24px rgba(0,180,216,0.7)',
        }}>
        <CircleDot size={22} className="text-cyan-400" />
      </div>
    );
  }
  return (
    <div className="rounded-full flex items-center justify-center border-2 w-11 h-11 shrink-0 opacity-70"
      style={{
        background: '#0F2A4A',
        borderColor: 'rgba(255,255,255,0.12)',
      }}>
      <Lock size={18} className="text-gray-500" />
    </div>
  );
}

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
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <PageContainer><p className="text-center text-gray-400">{error}</p></PageContainer>;
  if (!data) return null;

  const { colaborador, fases } = data;
  const total = fases.length;
  const faseAtualIdx = fases.findIndex(f => f.status !== 'completed');
  const concluidas = faseAtualIdx < 0 ? total : faseAtualIdx;
  const faseAtual = faseAtualIdx >= 0 ? fases[faseAtualIdx] : null;

  // Normaliza status em 3 buckets: completed | current | pending
  const enriched = fases.map((f, i) => ({
    ...f,
    displayStatus: i < concluidas ? 'completed' : i === faseAtualIdx ? 'current' : 'pending',
  }));

  // Progress bar horizontal: vai do centro da fase 1 (10%) até o centro da fase atual.
  // Entre os centros, a distância total é 80% (de 10% a 90%).
  const fillPct = faseAtualIdx < 0 ? 80 : (faseAtualIdx / (total - 1)) * 80;

  return (
    <PageContainer>
      <PageHero
        eyebrow="SUA JORNADA"
        title={faseAtual ? `Você está na Fase ${faseAtual.fase}` : 'Jornada concluída'}
        titleAccent={faseAtual ? `— ${faseAtual.titulo}` : ''}
        subtitle={`${concluidas} de ${total} fases concluídas · ${colaborador.nome_completo}`}
      />

      {/* Layout reordena no mobile: card focal ANTES da timeline, e lista oculta */}
      <div className="flex flex-col">

      {/* ── Timeline horizontal (desktop) ──────────────────────────────────── */}
      <div className="hidden md:block relative mb-10 order-1">
        {/* Linha de fundo */}
        <div className="absolute top-[22px] h-[2px] bg-white/[0.08] z-0"
          style={{ left: '10%', right: '10%' }} />
        {/* Linha preenchida até a fase atual */}
        <div className="absolute top-[22px] h-[2px] bg-cyan-400 z-0 transition-all duration-700"
          style={{
            left: '10%',
            width: `${fillPct}%`,
            boxShadow: '0 0 8px rgba(0,180,216,0.6)',
          }} />

        <div className="relative flex justify-between items-start z-10 gap-2">
          {enriched.map(f => {
            const clickable = f.displayStatus !== 'pending';
            return (
              <button key={f.fase}
                onClick={() => clickable && FASE_HREF[f.fase] && router.push(FASE_HREF[f.fase])}
                disabled={!clickable}
                className={`flex flex-col items-center gap-3 flex-1 min-w-0 transition-transform ${
                  clickable ? 'hover:scale-105 cursor-pointer' : 'cursor-default'
                }`}>
                <StepDot status={f.displayStatus} />
                <div className="text-center">
                  <p className={`font-bold text-sm ${f.displayStatus === 'pending' ? 'text-gray-500' : 'text-white'}`}>
                    Fase {f.fase}
                  </p>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold truncate max-w-[110px] ${
                    f.displayStatus === 'current' ? 'text-cyan-400'
                    : f.displayStatus === 'completed' ? 'text-gray-400'
                    : 'text-gray-600'
                  }`}>
                    {f.titulo}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Timeline vertical (mobile) ─── vem DEPOIS do card focal ─────── */}
      <div className="md:hidden mb-8 relative order-2">
        <div className="absolute left-[22px] top-6 bottom-6 w-[2px] bg-white/[0.08]" />
        {/* Linha cyan até a fase atual */}
        {concluidas > 0 && (
          <div className="absolute left-[22px] top-6 w-[2px] bg-cyan-400 transition-all duration-700"
            style={{
              height: `calc(${(concluidas / Math.max(1, total - 1)) * 100}% - ${concluidas >= total ? 0 : 24}px)`,
              boxShadow: '0 0 6px rgba(0,180,216,0.5)',
            }} />
        )}
        <div className="space-y-3 relative">
          {enriched.map(f => {
            const clickable = f.displayStatus !== 'pending';
            const statusText = STATUS_LABEL[f.displayStatus];
            const statusColor = f.displayStatus === 'current' ? 'text-cyan-400'
              : f.displayStatus === 'completed' ? 'text-emerald-400'
              : 'text-gray-500';
            return (
              <button key={f.fase}
                onClick={() => clickable && FASE_HREF[f.fase] && router.push(FASE_HREF[f.fase])}
                disabled={!clickable}
                className={`flex items-center gap-3 w-full text-left ${!clickable ? 'opacity-80' : ''}`}>
                <StepDot status={f.displayStatus} />
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${f.displayStatus === 'pending' ? 'text-gray-500' : 'text-white'}`}>
                    Fase {f.fase} — {f.titulo}
                  </p>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${statusColor}`}>
                    {statusText}
                  </p>
                </div>
                {clickable && <ChevronRight size={16} className="text-gray-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Card focal da fase atual ─── mobile: antes da timeline (order-1) ── */}
      {faseAtual && (
        <div className="flex justify-center mb-6 md:mb-12 order-1 md:order-2">
          <div className="rounded-2xl border-2 p-6 md:p-8 max-w-[640px] w-full"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(12px)',
              borderColor: 'rgba(0,180,216,0.4)',
              boxShadow: '0 0 40px rgba(0,180,216,0.15)',
            }}>
            <div className="flex flex-col items-center text-center">
              <p className="text-xl md:text-3xl font-extrabold text-white mb-1">
                Fase {faseAtual.fase} — {faseAtual.titulo}
              </p>
              <p className="text-sm font-semibold text-cyan-400 mb-4">Fase atual</p>
              <p className="text-gray-400 text-sm md:text-base mb-6 max-w-md leading-relaxed">
                {faseAtual.descricao}
              </p>
              <button onClick={() => FASE_HREF[faseAtual.fase] && router.push(FASE_HREF[faseAtual.fase])}
                className="inline-flex items-center gap-2 px-6 md:px-8 py-3 rounded-full font-bold text-white transition-all hover:scale-[1.02] active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #00B4D8, #0D9488)',
                  boxShadow: '0 0 28px rgba(0,180,216,0.3)',
                }}>
                {CTA_LABEL[faseAtual.fase] || 'Continuar'} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!faseAtual && (
        <div className="flex justify-center mb-6 md:mb-12 order-1 md:order-2">
          <GlassCard className="max-w-[640px] w-full text-center" padding="p-6 md:p-8">
            <p className="text-xl md:text-2xl font-extrabold text-white mb-1">🎉 Jornada concluída</p>
            <p className="text-sm text-gray-400 mb-4">
              Você completou todas as fases. Acompanhe sua evolução nos próximos ciclos.
            </p>
            <button onClick={() => router.push('/dashboard/evolucao')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-white"
              style={{
                background: 'linear-gradient(135deg, #00B4D8, #0D9488)',
                boxShadow: '0 0 28px rgba(0,180,216,0.3)',
              }}>
              Ver minha evolução <ArrowRight size={16} />
            </button>
          </GlassCard>
        </div>
      )}

      {/* ── Lista expandida — só desktop (mobile não mostra duplicado) ────── */}
      <div className="hidden md:block order-3">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mb-3">
          Todas as fases
        </p>
        <div className="space-y-2">
          {enriched.map(f => {
            const clickable = f.displayStatus !== 'pending';
            const statusColor = f.displayStatus === 'completed' ? 'text-emerald-400'
              : f.displayStatus === 'current' ? 'text-cyan-400'
              : 'text-gray-500';
            return (
              <button key={f.fase}
                onClick={() => clickable && FASE_HREF[f.fase] && router.push(FASE_HREF[f.fase])}
                disabled={!clickable}
                className={`w-full text-left rounded-xl p-3 md:p-4 border border-white/[0.06] transition-colors ${
                  clickable ? 'hover:border-white/[0.15] hover:bg-white/[0.03] cursor-pointer' : 'opacity-70 cursor-default'
                }`}
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm font-bold shrink-0 w-6 ${statusColor}`}>#{f.fase}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{f.titulo}</p>
                    <p className="text-[11px] text-gray-500 truncate">{f.descricao}</p>
                    {f.data && (
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {new Date(f.data).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${statusColor} shrink-0`}>
                    {STATUS_LABEL[f.displayStatus]}
                  </span>
                  {clickable && <ChevronRight size={14} className="text-gray-500 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      </div>{/* /flex-col reorder */}
    </PageContainer>
  );
}
