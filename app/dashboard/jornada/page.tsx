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

const PHASE_TOKENS: Record<number, { accent: string; deep: string; glow: string }> = {
  1: { accent: '#9ae2e6', deep: '#0a1a33', glow: 'rgba(154,226,230,0.22)' },
  2: { accent: '#34c5cc', deep: '#06202a', glow: 'rgba(52,197,204,0.24)'  },
  3: { accent: '#7ba7e0', deep: '#1a1f4a', glow: 'rgba(123,167,224,0.26)' },
  4: { accent: '#b888e8', deep: '#1a0d33', glow: 'rgba(184,136,232,0.26)' },
  5: { accent: '#e1aaf0', deep: '#1a0220', glow: 'rgba(225,170,240,0.26)' },
};

const FASE_GLYPH = ['', 'a', 'b', 'c', 'd', 'e'];

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
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
  const phaseTokens = PHASE_TOKENS[faseNum] ?? PHASE_TOKENS[2];

  const enriched = fases.map((f: any, i: number) => ({
    ...f,
    displayStatus: i < concluidas ? 'completed' : i === faseAtualIdx ? 'current' : 'pending',
    tokens: PHASE_TOKENS[f.fase] ?? PHASE_TOKENS[2],
  }));

  return (
    <div
      data-phase={String(faseNum)}
      style={{
        '--phase-accent': phaseTokens.accent,
        '--phase-deep': phaseTokens.deep,
        '--phase-glow': phaseTokens.glow,
      } as React.CSSProperties}
    >
      {/* Header */}
      <header className="px-5 pt-6 pb-4">
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2"
          style={{ color: 'var(--phase-accent)' }}>
          Sua jornada
        </p>
        <h1 style={{
          ...serifStyle,
          fontSize: 'clamp(30px, 5.5vw, 48px)',
          lineHeight: 1.02,
          letterSpacing: '-0.02em',
          marginBottom: 8,
          color: '#fff',
        }}>
          {faseAtual ? (
            <>Você está na{' '}
              <em style={{ color: 'var(--phase-accent)' }}>
                Fase {faseNum} — {faseAtual.titulo}
              </em>
            </>
          ) : (
            <em style={{ color: 'var(--phase-accent)' }}>Jornada concluída</em>
          )}
        </h1>
        <p className="text-sm text-white/55">
          {concluidas} de {total} fases concluídas · {firstName || colaborador.nome_completo}
        </p>
      </header>

      <main className="flex-1 px-5 pb-28 space-y-6">

        {/* Hero card */}
        <section className="rounded-[28px] p-5 relative overflow-hidden"
          style={{
            background: `radial-gradient(circle at top right, ${phaseTokens.glow}, transparent 42%), linear-gradient(135deg, ${phaseTokens.deep} 0%, #0f2b54 100%)`,
            border: `1px solid color-mix(in oklab, var(--phase-accent) 25%, transparent)`,
            boxShadow: '0 16px 40px rgba(0,0,0,0.22)',
          }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-2"
                style={{ color: 'var(--phase-accent)' }}>
                Fase atual
              </p>
              <h2 style={{
                ...serifStyle,
                fontSize: 'clamp(26px, 5vw, 38px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}>
                {faseAtual?.titulo || <em style={{ color: 'var(--phase-accent)' }}>Todas concluídas</em>}
              </h2>
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-[11px] font-semibold text-white/80"
              style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.08em' }}>
              F{String(faseNum).padStart(2, '0')}
            </span>
          </div>
          <p className="text-sm text-white/65 leading-relaxed mb-5">
            {FASE_DESC[faseNum] || 'Continue sua jornada de desenvolvimento.'}
          </p>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
              <p className="text-[11px] text-white/50 mb-1 uppercase tracking-wider">Progresso geral</p>
              <p style={{ ...serifStyle, fontSize: 26, color: 'var(--phase-accent)' }}>{pct}%</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4">
              <p className="text-[11px] text-white/50 mb-1 uppercase tracking-wider">Status atual</p>
              <p style={{ ...serifStyle, fontSize: 20, color: 'var(--phase-accent)' }}>
                {faseAtual ? 'Em curso' : 'Concluída'}
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push(FASE_HREF[faseNum] || '/dashboard/evolucao')}
            className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(90deg, var(--phase-accent), color-mix(in oklab, var(--phase-accent) 88%, white))`,
              color: '#062032',
              boxShadow: '0 10px 24px var(--phase-glow)',
            }}>
            {CTA_LABEL[faseNum] || 'Ver minha evolução'}
            <ArrowRight size={18} />
          </button>
        </section>

        {/* Timeline vertical */}
        <section className="rounded-[28px] p-5"
          style={{
            background: 'linear-gradient(180deg, rgba(12,32,56,0.96) 0%, rgba(8,26,46,0.96) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 style={{ ...serifStyle, fontSize: 22, color: '#fff', marginBottom: 2 }}>
                Fases da jornada
              </h3>
              <p className="text-sm text-white/50">Acompanhe seu caminho até aqui</p>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: 'var(--phase-accent)', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '.14em' }}>
              {total} ETAPAS
            </span>
          </div>

          <div className="relative">
            <div className="absolute left-[22px] top-3 bottom-3 w-[2px] opacity-55"
              style={{ background: 'linear-gradient(180deg, #9ae2e6 0%, #34c5cc 25%, #7ba7e0 50%, #b888e8 75%, #e1aaf0 100%)' }} />

            <div className="space-y-5 relative z-10">
              {enriched.map((f: any) => {
                const isDone = f.displayStatus === 'completed';
                const isCurrent = f.displayStatus === 'current';
                const clickable = f.displayStatus !== 'pending';
                const glyph = FASE_GLYPH[f.fase] ?? '';
                const tk = f.tokens;

                return (
                  <button key={f.fase}
                    onClick={() => clickable && FASE_HREF[f.fase] && router.push(FASE_HREF[f.fase])}
                    disabled={!clickable}
                    className={`flex items-center gap-4 w-full text-left ${!clickable ? 'opacity-50' : ''}`}>
                    <div
                      className="shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: isCurrent ? 48 : 44,
                        height: isCurrent ? 48 : 44,
                        background: isDone || isCurrent ? tk.accent : 'rgba(11,29,50,1)',
                        border: `2px solid ${isDone || isCurrent ? tk.accent : 'rgba(255,255,255,0.12)'}`,
                        color: isDone || isCurrent ? '#062032' : 'rgba(255,255,255,0.3)',
                        boxShadow: isCurrent ? `0 0 0 6px ${tk.glow}, 0 0 28px ${tk.glow}` : 'none',
                        fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                        fontStyle: 'italic',
                        fontSize: isCurrent ? 22 : 18,
                        transition: 'all .2s ease',
                      }}>
                      {isDone ? <Check size={18} strokeWidth={2.5} /> : glyph}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 style={{
                        fontFamily: isCurrent
                          ? 'var(--font-serif, "Instrument Serif", serif)'
                          : 'inherit',
                        fontStyle: isCurrent ? 'italic' : 'normal',
                        fontWeight: isCurrent ? 400 : 600,
                        fontSize: isCurrent ? 19 : 15,
                        color: isCurrent ? '#fff' : 'rgba(255,255,255,0.75)',
                        marginBottom: 2,
                      }}>
                        Fase {f.fase} — {f.titulo}
                      </h4>
                      <p style={{
                        ...serifStyle,
                        fontSize: 13,
                        color: isDone || isCurrent ? tk.accent : 'rgba(255,255,255,0.3)',
                      }}>
                        {isDone ? 'concluída' : isCurrent ? 'em curso' : 'bloqueada'}
                      </p>
                      {isCurrent && (
                        <p className="text-sm text-white/55 mt-1.5 leading-relaxed">
                          {FASE_DESC[f.fase] || ''}
                        </p>
                      )}
                    </div>

                    {isCurrent && (
                      <ArrowRight size={16} style={{ color: 'var(--phase-accent)', flexShrink: 0 }} />
                    )}
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
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid color-mix(in oklab, var(--phase-accent) 22%, transparent)` }}>
            <Clock size={20} style={{ color: 'var(--phase-accent)' }} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-1"
              style={{ color: 'var(--phase-accent)' }}>
              Próximo passo
            </p>
            <h4 style={{ ...serifStyle, fontSize: 17, color: '#fff', marginBottom: 4 }}>
              {faseAtual ? `Concluir ${faseAtual.titulo.toLowerCase()}` : 'Acompanhar sua evolução'}
            </h4>
            <p className="text-sm text-white/55 leading-relaxed">
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
