'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, Target, Sparkles, Lock, Check, Play, Video, FileText, Headphones, Award } from 'lucide-react';
import { loadTemporadaPorEmail } from '@/actions/temporadas';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';
import { semanaLiberadaPorData, formatarLiberacao } from '@/lib/season-engine/week-gating';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };
const TIPO_LABEL = { conteudo: 'Episódio', aplicacao: 'Prática', avaliacao: 'Avaliação' };
const TIPO_COR = { conteudo: '#06B6D4', aplicacao: '#F59E0B', avaliacao: '#A78BFA' };

// Fase 4 = Temporada — disciplinado
const PHASE_NUM = 4;
const PHASE_VARS = {
  '--phase-accent': '#b888e8',
  '--phase-deep': '#1a0d33',
  '--phase-glow': 'rgba(184,136,232,0.26)',
} as React.CSSProperties;

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

export default function TemporadaPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sb = getSupabase();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaPorEmail(user.email);
      if (r.error) setError(r.error); else setData(r);
      setLoading(false);
    })();
  }, [router, sb]);

  if (loading) return <Center><Loader2 className="animate-spin" style={{ color: 'var(--phase-accent, #b888e8)' }} /></Center>;
  if (error || !data?.trilha) return (
    <Center>
      <div className="text-center">
        <p className="text-gray-400 mb-2">{error || 'Sua temporada ainda não foi gerada'}</p>
        <p className="text-xs text-gray-500">Aguarde o RH/gestor liberar.</p>
      </div>
    </Center>
  );

  const { trilha, progresso } = data;
  const pausada = trilha.status === 'pausada';
  const semanas = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const progressoMap = Object.fromEntries((progresso || []).map((p: any) => [p.semana, p]));
  const concluidas = (progresso || []).filter((p: any) => p.status === 'concluido').length;
  const pct = Math.round((concluidas / 14) * 100);

  return (
    // ✅ data-phase="4" + CSS vars — toda a página herda a cor violeta da Temporada
    <div data-phase={String(PHASE_NUM)} style={PHASE_VARS}>
      <PageContainer>
        <PageHero
          eyebrow={`Temporada ${trilha.numero_temporada}`}
          title={trilha.competencia_foco}
          // ✅ subtítulo com ênfase serif em "evoluir" e "próximo nível"
          subtitle={
            <span>
              14 semanas para{' '}
              <em style={{ ...serifStyle, color: 'var(--phase-accent)', fontSize: 'inherit' }}>evoluir</em>{' '}
              1 competência ao{' '}
              <em style={{ ...serifStyle, color: 'var(--phase-accent)', fontSize: 'inherit' }}>próximo nível</em>
            </span>
          }
        />

        {pausada && (
          <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
            <div className="text-xs text-amber-300">⏸ Sua temporada está pausada pelo gestor. Você poderá continuar quando for retomada.</div>
          </GlassCard>
        )}

        {trilha.status === 'concluida' && trilha.evolution_report && (
          <>
            <EvolutionReportCard report={trilha.evolution_report} />
            <div className="mb-6">
              <button
                onClick={() => router.push('/dashboard/temporada/concluida')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                style={{ background: 'var(--phase-accent)', color: '#062032' }}
              >
                Ver relatório completo da temporada →
              </button>
            </div>
          </>
        )}

        {/* ✅ Progresso com tokens de fase */}
        <GlassCard className="mb-6" style={{ borderColor: 'color-mix(in oklab, var(--phase-accent) 22%, transparent)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.2em' }}>
              Progresso
            </span>
            {/* ✅ "X/14 semanas" em serif itálico na cor da fase */}
            <span style={{ ...serifStyle, fontSize: 16, color: 'var(--phase-accent)', letterSpacing: '-.01em' }}>
              {concluidas}<span style={{ opacity: 0.5, fontStyle: 'normal', fontSize: 13 }}>/14</span> semanas
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--phase-accent)' }}
            />
          </div>
        </GlassCard>

        {/* Timeline de semanas */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
          {semanas.map((s: any) => {
            const p = progressoMap[s.semana];
            const concluida = p?.status === 'concluido';
            const emAndamento = p?.status === 'em_andamento';
            const liberadaPorData = semanaLiberadaPorData(trilha.data_inicio, s.semana);
            const anteriorConcluida = s.semana === 1
              ? true
              : progressoMap[s.semana - 1]?.status === 'concluido';
            const liberada = concluida || (liberadaPorData && (emAndamento || anteriorConcluida));
            const motivoBloqueio = !liberada
              ? (!liberadaPorData
                  ? `Libera ${formatarLiberacao(trilha.data_inicio, s.semana)}`
                  : 'Conclua a semana anterior')
              : '';

            const Icon = s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);

            return (
              <button
                key={s.semana}
                onClick={() => liberada && router.push(s.semana === 14 ? '/dashboard/temporada/sem14' : `/dashboard/temporada/semana/${s.semana}`)}
                disabled={!liberada}
                title={motivoBloqueio}
                className={`relative rounded-xl p-3 text-left transition-all border ${
                  concluida
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400'
                    : emAndamento
                    ? 'border-2 hover:border-opacity-80'
                    : liberada
                    ? 'bg-white/5 border-white/10 hover:border-white/30'
                    : 'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
                }`}
                style={emAndamento ? {
                  background: 'color-mix(in oklab, var(--phase-accent) 10%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--phase-accent) 45%, transparent)',
                  boxShadow: '0 0 0 3px color-mix(in oklab, var(--phase-accent) 14%, transparent)',
                } : undefined}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400">Sem {s.semana}</span>
                  {concluida ? (
                    <Check size={14} className="text-emerald-400" />
                  ) : !liberada ? (
                    <Lock size={12} className="text-gray-600" />
                  ) : (
                    <Icon size={14} style={{ color: emAndamento ? 'var(--phase-accent)' : TIPO_COR[s.tipo] }} />
                  )}
                </div>
                {/* ✅ Semana em andamento ganha nome em serif */}
                <div
                  className="text-[11px] font-bold text-white truncate"
                  title={s.descritor || TIPO_LABEL[s.tipo]}
                  style={emAndamento ? { ...serifStyle, fontSize: 12, fontWeight: 400 } : undefined}
                >
                  {s.descritor || TIPO_LABEL[s.tipo]}
                </div>
                {s.conteudo?.formato_core && liberada && (
                  <div className="text-[9px] text-gray-500 mt-0.5">{s.conteudo.formato_core}</div>
                )}
                {!liberada && motivoBloqueio && (
                  <div className="text-[9px] text-gray-500 mt-0.5 truncate">{motivoBloqueio}</div>
                )}
              </button>
            );
          })}
        </div>
      </PageContainer>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white"
      style={{ background: '#0a0e1a' }}>
      {children}
    </div>
  );
}

const CONVERGENCIA: Record<string, { label: string; cor: string; icon: string }> = {
  evolucao_confirmada: { label: 'Evolução confirmada', cor: 'emerald', icon: '✅' },
  evolucao_parcial:    { label: 'Evolução parcial',    cor: 'amber',   icon: '🟡' },
  estagnacao:          { label: 'Estagnação',          cor: 'gray',    icon: '⚪' },
  regressao:           { label: 'Regressão',           cor: 'red',     icon: '🔻' },
};

function EvolutionReportCard({ report }: { report: any }) {
  const descritores = report?.descritores || [];
  return (
    <GlassCard className="mb-6 border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 to-emerald-500/5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={18} className="text-cyan-400" />
        <h2 className="text-sm uppercase font-bold text-cyan-400">Evolution Report</h2>
      </div>
      {report.insight_geral && (
        <p className="text-sm text-gray-200 italic mb-4">"{report.insight_geral}"</p>
      )}
      <div className="space-y-2 mb-3">
        {descritores.map((d: any, i: number) => {
          const conv = CONVERGENCIA[d.convergencia] || CONVERGENCIA.estagnacao;
          const delta = Number((d.nota_pos - d.nota_pre).toFixed(1));
          return (
            <div key={i} className={`p-2 rounded-lg bg-white/5 border border-${conv.cor}-500/20`}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">{conv.icon} {d.descritor}</div>
                <div className="text-[10px] text-gray-400">
                  {d.nota_pre} → <span className={`text-${conv.cor}-400 font-bold`}>{d.nota_pos}</span> ({delta > 0 ? '+' : ''}{delta})
                </div>
              </div>
              {d.depois && <div className="text-[11px] text-gray-400 mt-1">{d.depois}</div>}
            </div>
          );
        })}
      </div>
      {report.proximo_passo && (
        <div className="text-xs text-gray-300 mt-4 pt-3 border-t border-white/10">
          <strong className="text-cyan-400">Próximo passo: </strong>{report.proximo_passo}
        </div>
      )}
    </GlassCard>
  );
}
