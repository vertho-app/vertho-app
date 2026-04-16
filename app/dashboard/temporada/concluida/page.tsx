'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, Sparkles, Trophy, Target, MessageSquare, CheckCircle2, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import ReactMarkdown from 'react-markdown';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';

const CONVERGENCIA = {
  evolucao_confirmada: { cor: 'emerald', icon: TrendingUp, label: 'Evolução confirmada' },
  evolucao_parcial:    { cor: 'amber',   icon: TrendingUp, label: 'Evolução parcial' },
  estagnacao:          { cor: 'gray',    icon: Minus,      label: 'Estagnação' },
  regressao:           { cor: 'red',     icon: TrendingDown, label: 'Regressão' },
};

export default function TemporadaConcluidaPage() {
  const router = useRouter();
  const sb = getSupabase();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaConcluida(user.email);
      if (r.error) setError(r.error);
      else setData(r);
      setLoading(false);
    })();
  }, [router, sb]);

  if (loading) return <Center><Loader2 className="animate-spin text-cyan-400" /></Center>;
  if (error) return <Center><div className="text-center"><p className="text-gray-400">{error}</p><button onClick={() => router.push('/dashboard/temporada')} className="text-cyan-400 text-xs mt-3">← Voltar</button></div></Center>;

  const { colab, trilha, evolutionReport, momentos, missoes, sem14 } = data;
  const firstName = (colab.nome || '').split(' ')[0];
  const descritores = evolutionReport?.descritores || [];
  const resumo = evolutionReport?.resumo || {};

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.push('/dashboard/temporada')} className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400">
          <ArrowLeft size={14} /> Voltar à temporada
        </button>
        <button onClick={async () => {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch('/api/temporada/concluida/pdf', {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (!res.ok) { alert('Erro ao gerar PDF'); return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `temporada-${data.trilha.numeroTemporada}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }} className="flex items-center gap-2 text-xs text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 rounded-full px-3 py-1.5">
          <Download size={12} /> Baixar PDF
        </button>
      </div>

      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="text-xs uppercase text-amber-400 tracking-widest font-bold">Temporada {trilha.numeroTemporada} concluída</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-2">
          {firstName}, veja o que mudou em você
        </h1>
        <p className="text-sm text-gray-400">
          14 semanas dedicadas a <span className="text-cyan-400">{trilha.competencia}</span>.
        </p>
      </div>

      {/* Resumo numérico */}
      <GlassCard className="mb-6 border-cyan-500/20 bg-cyan-500/[0.03]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Stat label="Confirmadas" valor={resumo.confirmadas || 0} cor="text-emerald-400" />
          <Stat label="Parciais" valor={resumo.parciais || 0} cor="text-amber-400" />
          <Stat label="Estagnadas" valor={resumo.estagnacoes || 0} cor="text-gray-400" />
          <Stat label="Regressões" valor={resumo.regressoes || 0} cor="text-red-400" />
        </div>
        {evolutionReport?.insight_geral && (
          <p className="text-sm text-gray-200 italic border-l-2 border-cyan-500/50 pl-3">
            "{evolutionReport.insight_geral}"
          </p>
        )}
      </GlassCard>

      {/* Bloco 1 — Comparativo por descritor */}
      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Descritor a descritor</h2>
        <div className="space-y-2">
          {descritores.map((d, i) => {
            const conv = CONVERGENCIA[d.convergencia] || CONVERGENCIA.estagnacao;
            const Icon = conv.icon;
            const delta = Number((d.nota_pos - d.nota_pre).toFixed(1));
            return (
              <GlassCard key={i} className={`border-${conv.cor}-500/20 bg-${conv.cor}-500/[0.03]`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-${conv.cor}-500/15`}>
                    <Icon size={18} className={`text-${conv.cor}-400`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className="text-sm font-bold text-white">{d.descritor}</p>
                      <div className="text-xs text-right shrink-0">
                        <span className="text-gray-400">{d.nota_pre}</span>
                        <span className={`text-${conv.cor}-400 font-bold mx-2`}>→ {d.nota_pos}</span>
                        <span className={`text-[10px] text-${conv.cor}-400`}>({delta > 0 ? '+' : ''}{delta})</span>
                      </div>
                    </div>
                    <p className={`text-[10px] uppercase text-${conv.cor}-400 mt-1`}>{conv.label}</p>
                    {d.antes && d.depois && (
                      <div className="mt-2 text-xs space-y-0.5">
                        <p className="text-gray-500"><span className="text-gray-400">Antes:</span> {d.antes}</p>
                        <p className="text-gray-200"><span className="text-cyan-400">Depois:</span> {d.depois}</p>
                      </div>
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* Bloco 2 — Momentos da temporada */}
      {momentos.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Momentos de insight</h2>
          <div className="space-y-2">
            {momentos.map((m, i) => (
              <GlassCard key={i} className="border-cyan-500/15">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[9px] uppercase text-gray-500">Sem</p>
                    <p className="text-lg font-extrabold text-cyan-300">{m.semana}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{m.descritor}</p>
                    <p className="text-sm text-gray-200 italic">💡 {m.insight}</p>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Bloco 3 — Missões práticas */}
      {missoes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Missões que você executou</h2>
          <div className="space-y-2">
            {missoes.map((m, i) => (
              <GlassCard key={i} className="border-amber-500/15">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[9px] uppercase text-gray-500">Sem</p>
                    <p className="text-lg font-extrabold text-amber-400">{m.semana}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase mb-1 tracking-widest">
                      {m.modo === 'pratica' ? 'Missão real' : 'Cenário escrito'}
                    </p>
                    {m.compromisso && (
                      <p className="text-xs text-gray-200 mb-1"><span className="text-amber-400">Compromisso:</span> {m.compromisso}</p>
                    )}
                    {m.sintese && (
                      <p className="text-xs text-gray-400"><span className="text-gray-500">Síntese:</span> {m.sintese}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Bloco 4 — Avaliação final (sem 14) */}
      {sem14 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">Avaliação final</h2>
          <GlassCard className="border-purple-500/20 bg-purple-500/[0.03]">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-purple-400" />
              <span className="text-xs uppercase text-purple-400 font-bold tracking-widest">Cenário B · Resposta e devolutiva</span>
            </div>
            {sem14.cenario && (
              <details className="mb-3">
                <summary className="text-xs text-cyan-400 cursor-pointer">Ver o cenário apresentado</summary>
                <div className="prose prose-invert prose-sm max-w-none mt-2 text-xs text-gray-300">
                  <ReactMarkdown>{sem14.cenario}</ReactMarkdown>
                </div>
              </details>
            )}
            {sem14.resposta && (
              <details className="mb-3">
                <summary className="text-xs text-cyan-400 cursor-pointer">Ver sua resposta</summary>
                <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap border-l-2 border-cyan-500/30 pl-3">{sem14.resposta}</p>
              </details>
            )}
            {sem14.resumo_avaliacao && (
              <div className="rounded-lg bg-white/[0.03] p-3 mt-3">
                <p className="text-[10px] uppercase text-purple-400 font-bold tracking-widest mb-1">Devolutiva</p>
                <p className="text-sm text-gray-200">{sem14.resumo_avaliacao}</p>
              </div>
            )}
            {sem14.nota_media_pos != null && (
              <p className="text-xs text-gray-400 mt-3">
                Nota média pós-temporada: <span className="text-purple-300 font-bold">{Number(sem14.nota_media_pos).toFixed(1)}/4.0</span>
              </p>
            )}
          </GlassCard>
        </section>
      )}

      {/* Bloco 5 — Próximos passos */}
      {evolutionReport?.proximo_passo && (
        <GlassCard className="border-emerald-500/20 bg-emerald-500/[0.03] mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs uppercase text-emerald-400 font-bold tracking-widest">Próximos passos</span>
          </div>
          <p className="text-sm text-gray-200">{evolutionReport.proximo_passo}</p>
        </GlassCard>
      )}
    </PageContainer>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}

function Stat({ label, valor, cor }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}
