'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, BookOpen, Target, Sparkles, Lock, Check, Play, Video, FileText, Headphones, Award } from 'lucide-react';
import { loadTemporadaPorEmail } from '@/actions/temporadas';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };
const TIPO_LABEL = { conteudo: 'Episódio', aplicacao: 'Aplicação', avaliacao: 'Avaliação' };
const TIPO_COR = { conteudo: '#06B6D4', aplicacao: '#F59E0B', avaliacao: '#A78BFA' };

export default function TemporadaPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
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

  if (loading) return <Center><Loader2 className="animate-spin text-cyan-400" /></Center>;
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
  const arquivada = trilha.status === 'arquivada';
  const semanas = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const progressoMap = Object.fromEntries((progresso || []).map(p => [p.semana, p]));
  const concluidas = (progresso || []).filter(p => p.status === 'concluido').length;
  const pct = Math.round((concluidas / 14) * 100);

  return (
    <PageContainer>
      <PageHero
        eyebrow={`Temporada ${trilha.numero_temporada}`}
        title={trilha.competencia_foco}
        subtitle="14 semanas para evoluir 1 competência ao próximo nível"
      />

      {pausada && (
        <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
          <div className="text-xs text-amber-300">⏸ Sua temporada está pausada pelo gestor. Você poderá continuar quando for retomada.</div>
        </GlassCard>
      )}

      {trilha.status === 'concluida' && trilha.evolution_report && (
        <EvolutionReportCard report={trilha.evolution_report} />
      )}

      {/* Progresso */}
      <GlassCard className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase text-gray-400">Progresso</span>
          <span className="text-xs text-cyan-400 font-bold">{concluidas}/14 semanas</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      </GlassCard>

      {/* Timeline */}
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-3">
        {semanas.map(s => {
          const p = progressoMap[s.semana];
          const concluida = p?.status === 'concluido';
          const emAndamento = p?.status === 'em_andamento';
          const liberada = concluida || emAndamento || s.semana === 1;

          const Icon = s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);

          return (
            <button
              key={s.semana}
              onClick={() => liberada && router.push(`/dashboard/temporada/semana/${s.semana}`)}
              disabled={!liberada}
              className={`relative rounded-xl p-3 text-left transition-all border ${
                concluida ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400' :
                emAndamento ? 'bg-cyan-500/10 border-cyan-500/40 ring-2 ring-cyan-500/30 hover:border-cyan-400' :
                liberada ? 'bg-white/5 border-white/10 hover:border-white/30' :
                'bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400">Sem {s.semana}</span>
                {concluida ? <Check size={14} className="text-emerald-400" /> :
                 !liberada ? <Lock size={12} className="text-gray-600" /> :
                 <Icon size={14} style={{ color: TIPO_COR[s.tipo] }} />}
              </div>
              <div className="text-[11px] font-bold text-white truncate" title={s.descritor || TIPO_LABEL[s.tipo]}>
                {s.descritor || TIPO_LABEL[s.tipo]}
              </div>
              {s.conteudo?.formato_core && liberada && (
                <div className="text-[9px] text-gray-500 mt-0.5">{s.conteudo.formato_core}</div>
              )}
            </button>
          );
        })}
      </div>
    </PageContainer>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}

const CONVERGENCIA = {
  evolucao_confirmada: { label: 'Evolução confirmada', cor: 'emerald', icon: '✅' },
  evolucao_parcial: { label: 'Evolução parcial', cor: 'amber', icon: '🟡' },
  estagnacao: { label: 'Estagnação', cor: 'gray', icon: '⚪' },
  regressao: { label: 'Regressão', cor: 'red', icon: '🔻' },
};

function EvolutionReportCard({ report }) {
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
        {descritores.map((d, i) => {
          const conv = CONVERGENCIA[d.convergencia] || CONVERGENCIA.estagnacao;
          const delta = (d.nota_pos - d.nota_pre).toFixed(1);
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
