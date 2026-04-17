'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Check, ArrowRight, Clock } from 'lucide-react';
import { loadJornada } from './jornada-actions';

const FASE_HREF: Record<number, string> = {
  1: '/dashboard/perfil-comportamental',
  2: '/dashboard/assessment',
  3: '/dashboard/pdi',
  4: '/dashboard/temporada',
  5: '/dashboard/evolucao',
};

const CTA_LABEL: Record<number, string> = {
  1: 'Fazer diagnóstico (DISC)',
  2: 'Iniciar avaliação',
  3: 'Ver meu PDI',
  4: 'Ver minha temporada',
  5: 'Ver minha evolução',
};

const FASE_DESC: Record<number, string> = {
  1: 'Mapeamento do seu perfil comportamental e estilo de liderança.',
  2: 'Avaliação de competências por cenários situacionais.',
  3: 'Seu plano de desenvolvimento individual baseado nos resultados.',
  4: 'Temporada de 14 semanas com conteúdo, prática e reflexão.',
  5: 'Medição de evolução pós-capacitação e consolidação dos avanços.',
};

export default function JornadaPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadJornada();
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="px-5 pt-10 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador, fases } = data;
  const total = fases.length;
  const faseAtualIdx = fases.findIndex((f: any) => f.status !== 'completed');
  const concluidas = faseAtualIdx < 0 ? total : faseAtualIdx;
  const faseAtual = faseAtualIdx >= 0 ? fases[faseAtualIdx] : null;
  const faseNum = faseAtual?.fase || total;
  const pct = Math.round((concluidas / total) * 100);
  const firstName = (colaborador.nome_completo || '').split(' ')[0] || '';

  const enriched = fases.map((f: any, i: number) => ({
    ...f,
    displayStatus: i < concluidas ? 'completed' : i === faseAtualIdx ? 'current' : 'pending',
  }));

  return (
    <div>
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Sua jornada</p>
        <h1 className="text-[2.05rem] leading-[1.03] font-extrabold tracking-tight mb-2">
          {faseAtual ? (
            <>Você está na Fase {faseNum}{' '}<span className="text-[#34C5CC]">{faseAtual.titulo}</span></>
          ) : (
            <span className="text-[#34C5CC]">Jornada concluída 🎉</span>
          )}
        </h1>
        <p className="text-base text-white/65">
          {concluidas} de {total} fases concluídas • {firstName || colaborador.nome_completo}
        </p>
      </header>

      <main className="flex-1 px-5 pb-28 space-y-6">
        {/* Hero card */}
        <section className="rounded-[28px] p-5"
          style={{
            background: 'radial-gradient(circle at top right, rgba(52,197,204,0.14), transparent 42%), linear-gradient(135deg, #0f2b54 0%, #123960 100%)',
            border: '1px solid rgba(52,197,204,0.2)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
          }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">Fase atual</p>
              <h2 className="text-[1.9rem] leading-[1.06] font-extrabold tracking-tight">
                {faseAtual?.titulo || 'Todas concluídas'}
              </h2>
            </div>
            <div className="shrink-0 px-3 py-2 rounded-full bg-white/10 border border-white/10 text-[12px] font-semibold text-white/85">
              Fase {faseNum}
            </div>
          </div>
          <p className="text-sm text-white/70 leading-relaxed mb-5">
            {FASE_DESC[faseNum] || 'Continue sua jornada de desenvolvimento.'}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-[12px] text-white/55 mb-1">Progresso geral</p>
              <p className="text-xl font-extrabold">{pct}%</p>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <p className="text-[12px] text-white/55 mb-1">Status atual</p>
              <p className="text-xl font-extrabold text-[#34C5CC]">
                {faseAtual ? 'Em curso' : 'Concluída'}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(FASE_HREF[faseNum] || '/dashboard/evolucao')}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(90deg, #34c5cc 0%, #2dd4bf 100%)', color: '#062032', boxShadow: '0 10px 24px rgba(52,197,204,0.22)' }}>
            {CTA_LABEL[faseNum] || 'Ver minha evolução'}
            <ArrowRight size={18} />
          </button>
        </section>

        {/* Timeline vertical */}
        <section className="rounded-[28px] p-5"
          style={{
            background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)',
            border: '1px solid rgba(52,197,204,0.14)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-bold">Fases da jornada</h3>
              <p className="text-sm text-white/60">Acompanhe seu caminho até aqui</p>
            </div>
            <span className="text-sm font-semibold text-[#9AE2E6]">{total} etapas</span>
          </div>

          <div className="relative">
            {/* Linha de fundo */}
            <div className="absolute left-5 top-3 bottom-3 w-[2px]"
              style={{ background: 'linear-gradient(180deg, rgba(52,197,204,0.55) 0%, rgba(52,197,204,0.18) 100%)' }} />

            <div className="space-y-6 relative z-10">
              {enriched.map((f: any) => {
                const isDone = f.displayStatus === 'completed';
                const isCurrent = f.displayStatus === 'current';
                const clickable = f.displayStatus !== 'pending';

                const dotClass = isDone
                  ? 'border-2 border-[rgba(52,197,204,0.65)] shadow-[0_0_0_6px_rgba(52,197,204,0.05)]'
                  : isCurrent
                  ? 'border-2 border-[#34c5cc] shadow-[0_0_0_8px_rgba(52,197,204,0.08)]'
                  : 'border-2 border-white/16';

                const dotBg = isDone || isCurrent
                  ? 'radial-gradient(circle at center, rgba(52,197,204,0.18), rgba(11,29,50,1))'
                  : 'rgba(11,29,50,0.88)';

                return (
                  <button key={f.fase}
                    onClick={() => clickable && FASE_HREF[f.fase] && router.push(FASE_HREF[f.fase])}
                    disabled={!clickable}
                    className={`flex items-start gap-4 w-full text-left ${!clickable ? 'opacity-60' : ''}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${dotClass}`}
                      style={{ background: dotBg }}>
                      {isDone ? (
                        <Check size={20} className="text-[#34C5CC]" strokeWidth={2.2} />
                      ) : isCurrent ? (
                        <div className="w-3 h-3 rounded-full bg-[#34C5CC]" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                      )}
                    </div>
                    <div className="pt-1 flex-1 min-w-0">
                      <h4 className={`font-bold ${isCurrent ? 'text-xl text-white' : 'text-lg text-white/88'}`}>
                        Fase {f.fase} — {f.titulo}
                      </h4>
                      <p className={`text-[12px] font-semibold tracking-[0.14em] uppercase mt-1 ${
                        isDone ? 'text-[#34C5CC]' : isCurrent ? 'text-[#9AE2E6]' : 'text-gray-500'
                      }`}>
                        {isDone ? 'Concluída' : isCurrent ? 'Em curso' : 'Bloqueada'}
                      </p>
                      {isCurrent && (
                        <p className="text-sm text-white/60 mt-2 leading-relaxed">
                          {FASE_DESC[f.fase] || ''}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Próximo passo */}
        <section className="rounded-[24px] p-4 flex items-start gap-4"
          style={{
            background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)',
            border: '1px solid rgba(52,197,204,0.14)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}>
          <div className="w-12 h-12 rounded-2xl bg-[#0F2B54] border border-[#34C5CC]/20 flex items-center justify-center shrink-0">
            <Clock size={20} className="text-[#34C5CC]" />
          </div>
          <div>
            <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-1">Próximo passo</p>
            <h4 className="text-base font-bold mb-1">
              {faseAtual ? `Concluir ${faseAtual.titulo.toLowerCase()}` : 'Acompanhar sua evolução'}
            </h4>
            <p className="text-sm text-white/65 leading-relaxed">
              {faseAtual
                ? 'Finalize esta fase para avançar na sua jornada de desenvolvimento.'
                : 'Visualize seu relatório consolidado de evolução e próximos passos.'}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
