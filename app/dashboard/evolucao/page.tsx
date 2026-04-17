'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, TrendingUp, Download, Clock, Quote, Target, Award } from 'lucide-react';
import { loadEvolucao } from './evolucao-actions';
import { fetchAuth } from '@/lib/auth/fetch-auth';

function classifyDelta(delta: number): { label: string; pill: string } {
  if (delta >= 0.5) return { label: 'Evolução confirmada', pill: 'bg-green-500/12 text-green-300 border border-green-500/22' };
  if (delta >= 0.2) return { label: 'Evolução parcial', pill: 'bg-[#9ae2e6]/8 text-[#9ae2e6] border border-[#9ae2e6]/16' };
  if (delta <= -0.2) return { label: 'Regressão', pill: 'bg-red-500/12 text-red-300 border border-red-500/18' };
  return { label: 'Estável', pill: 'bg-[#9ae2e6]/8 text-[#9ae2e6] border border-[#9ae2e6]/16' };
}

export default function EvolucaoPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadEvolucao();
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="px-5 pt-10 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { competencias, metricas, descritores, evolucao } = data;

  if (competencias.length === 0 && descritores.length === 0) {
    return (
      <div>
        <header className="px-5 pt-6 pb-4">
          <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Sua evolução</p>
          <h1 className="text-[2rem] leading-[1.05] font-extrabold tracking-tight">
            Ainda sem dados de evolução
          </h1>
          <p className="text-base text-white/65 mt-2">
            Seus dados aparecerão aqui após completar as avaliações.
          </p>
        </header>
        <div className="px-5 pb-28 flex justify-center">
          <div className="rounded-[28px] p-8 text-center w-full max-w-md"
            style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(154,226,230,0.12)' }}>
            <TrendingUp size={40} className="text-gray-500 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              Complete as avaliações de competências pra acompanhar sua evolução.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Contadores por classificação
  const confirmadas = descritores.filter((d: any) => (d.delta || 0) >= 0.5).length;
  const parciais = descritores.filter((d: any) => (d.delta || 0) >= 0.2 && (d.delta || 0) < 0.5).length;
  const atencao = descritores.filter((d: any) => (d.delta || 0) < 0.2).length;

  // Competência foco (da primeira competência)
  const compFoco = competencias[0]?.nome || 'Competência';

  // Melhor e pior descritor
  const sorted = [...descritores].sort((a: any, b: any) => (b.delta || 0) - (a.delta || 0));
  const melhor = sorted[0];
  const pior = sorted[sorted.length - 1];

  async function handleDownloadPDF() {
    try {
      const res = await fetchAuth('/api/temporada/concluida/pdf');
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `evolucao-${compFoco.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div>
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Sua evolução</p>
        <h1 className="text-[2rem] leading-[1.05] font-extrabold tracking-tight">
          Relatório de Evolução
        </h1>
      </header>

      <main className="flex-1 px-5 pb-28 space-y-5">
        {/* Hero */}
        <section className="rounded-[28px] p-5"
          style={{
            background: 'radial-gradient(circle at top right, rgba(158,78,221,0.24), transparent 40%), linear-gradient(135deg, #0f2b54 0%, #3b0a6d 100%)',
            border: '1px solid rgba(52,197,204,0.16)',
            boxShadow: '0 18px 42px rgba(0,0,0,0.24)',
          }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">
                Temporada {evolucao?.[0]?.numero_temporada || 1}
              </p>
              <h2 className="text-[1.85rem] leading-[1.06] font-extrabold tracking-tight max-w-[280px]">
                {compFoco}
              </h2>
            </div>
            <div className="shrink-0 px-3 py-2 rounded-full bg-white/10 border border-white/10 text-[12px] font-semibold text-white/85">
              {metricas.totalAvaliadas} comp.
            </div>
          </div>
          <p className="text-sm text-white/70 leading-relaxed mb-5">
            Veja onde houve avanço, onde ainda existe gap e quais sinais merecem atenção.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <p className="text-[11px] text-white/55 mb-1">Confirmadas</p>
              <p className="text-xl font-extrabold text-green-300">{confirmadas}</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <p className="text-[11px] text-white/55 mb-1">Parciais</p>
              <p className="text-xl font-extrabold text-[#9AE2E6]">{parciais}</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <p className="text-[11px] text-white/55 mb-1">Atenção</p>
              <p className="text-xl font-extrabold text-red-300">{atencao}</p>
            </div>
          </div>

          <button onClick={handleDownloadPDF}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, #34c5cc 0%, #2dd4bf 100%)', color: '#062032', boxShadow: '0 10px 24px rgba(52,197,204,0.22)' }}>
            <Download size={18} />
            Baixar relatório completo
          </button>
        </section>

        {/* Comparativo por descritor */}
        {descritores.length > 0 && (
          <section className="rounded-[28px] p-5"
            style={{ background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)', border: '1px solid rgba(52,197,204,0.12)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
            <div className="mb-4">
              <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Comparativo por descritor</p>
              <h2 className="text-lg font-bold">Pré x Pós temporada</h2>
            </div>

            <div className="space-y-3">
              {descritores.map((d: any, i: number) => {
                const delta = d.delta || 0;
                const cls = classifyDelta(delta);
                const notaPre = d.nota_pre ?? d.nota_inicial ?? 0;
                const notaPos = d.nota_pos ?? d.nota_final ?? (notaPre + delta);
                const barPct = Math.min(100, (Math.max(0, notaPos) / 4) * 100);
                const barColor = delta >= 0.2 ? '#34C5CC' : delta <= -0.2 ? '#E57373' : '#9AE2E6';

                return (
                  <article key={i} className="rounded-[22px] p-4"
                    style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold leading-snug">{d.descritor || d.competencia_nome || `Descritor ${i + 1}`}</h3>
                      </div>
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${cls.pill}`}>
                        {cls.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/55">{Number(notaPre).toFixed(2)} → {Number(notaPos).toFixed(2)}</span>
                      <span className={`font-bold ${delta > 0 ? 'text-green-300' : delta < 0 ? 'text-red-300' : 'text-[#9AE2E6]'}`}>
                        {delta > 0 ? '+' : ''}{Number(delta).toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Competências (se sem descritores, mostra competência-level) */}
        {descritores.length === 0 && competencias.length > 0 && (
          <section className="rounded-[28px] p-5"
            style={{ background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)', border: '1px solid rgba(52,197,204,0.12)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
            <div className="mb-4">
              <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Por competência</p>
              <h2 className="text-lg font-bold">Notas inicial x atual</h2>
            </div>
            <div className="space-y-3">
              {competencias.map((comp: any, i: number) => {
                const notaPre = comp.inicial?.nota_decimal || 0;
                const notaPos = comp.reavaliacao?.nota_decimal || notaPre;
                const delta = comp.reavaliacao ? notaPos - notaPre : 0;
                const cls = classifyDelta(delta);
                const barPct = Math.min(100, (notaPos / 4) * 100);
                const barColor = delta >= 0.2 ? '#34C5CC' : delta <= -0.2 ? '#E57373' : '#9AE2E6';
                return (
                  <article key={i} className="rounded-[22px] p-4"
                    style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-bold leading-snug flex-1">{comp.nome}</h3>
                      {comp.reavaliacao && (
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${cls.pill}`}>
                          {cls.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/55">{notaPre.toFixed(2)} → {notaPos.toFixed(2)}</span>
                      {comp.reavaliacao && (
                        <span className={`font-bold ${delta > 0 ? 'text-green-300' : delta < 0 ? 'text-red-300' : 'text-[#9AE2E6]'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Avaliação final */}
        {(melhor || pior) && (
          <section className="rounded-[28px] p-5"
            style={{ background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)', border: '1px solid rgba(52,197,204,0.12)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
            <div className="mb-4">
              <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Avaliação final</p>
              <h2 className="text-lg font-bold">Síntese do ciclo</h2>
            </div>
            <div className="space-y-3">
              {melhor && (melhor.delta || 0) > 0 && (
                <div className="rounded-[22px] p-4"
                  style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[12px] text-white/55 mb-1">Maior avanço</p>
                  <p className="font-bold">{melhor.descritor || melhor.competencia_nome}</p>
                </div>
              )}
              {pior && (pior.delta || 0) < 0 && (
                <div className="rounded-[22px] p-4"
                  style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[12px] text-white/55 mb-1">Principal ponto de atenção</p>
                  <p className="font-bold">{pior.descritor || pior.competencia_nome}</p>
                </div>
              )}
              <div className="rounded-[22px] p-4"
                style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-[12px] text-white/55 mb-1">Nota média atual</p>
                <p className="font-bold text-[#34C5CC]">{metricas.notaMedia} de 4.0
                  {metricas.deltaMedia !== 0 && (
                    <span className={`ml-2 text-sm ${metricas.deltaMedia > 0 ? 'text-green-300' : 'text-red-300'}`}>
                      ({metricas.deltaMedia > 0 ? '+' : ''}{metricas.deltaMedia})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button onClick={handleDownloadPDF}
              className="w-full mt-5 py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(90deg, #34c5cc 0%, #2dd4bf 100%)', color: '#062032', boxShadow: '0 10px 24px rgba(52,197,204,0.22)' }}>
              Ver relatório completo da temporada
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
