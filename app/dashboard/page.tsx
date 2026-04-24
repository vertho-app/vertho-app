'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import {
  Bell, ArrowRight, Play, Loader2,
  BookOpen, FileText, Headphones, Zap, MessageCircle,
} from 'lucide-react';
import { loadDashboardData } from './dashboard-actions';
import { loadHomeKpis } from '@/actions/dashboard-kpis';
import { loadUltimosVideosColab } from '@/actions/video-analytics';
import VideoModal from '@/components/video-modal';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { ContentThumb } from '@/components/content-thumb';

const BUNNY_LIBRARY = 636615;

const FORMATO_ICON: Record<string, any> = {
  video: Play,
  audio: Headphones,
  texto: FileText,
  case: BookOpen,
  pdf: FileText,
};
const FORMATO_LABEL: Record<string, string> = {
  video: 'Vídeo', audio: 'Áudio', texto: 'Artigo', case: 'Case', pdf: 'PDF',
};

// ✅ NOVO: tokens de fase mapeados — ativa CSS vars em toda a página
const PHASE_TOKENS: Record<number, { accent: string; deep: string; glow: string }> = {
  1: { accent: '#9ae2e6', deep: '#0a1a33', glow: 'rgba(154,226,230,0.22)' },
  2: { accent: '#34c5cc', deep: '#06202a', glow: 'rgba(52,197,204,0.24)'  },
  3: { accent: '#7ba7e0', deep: '#1a1f4a', glow: 'rgba(123,167,224,0.26)' },
  4: { accent: '#b888e8', deep: '#1a0d33', glow: 'rgba(184,136,232,0.26)' },
  5: { accent: '#e1aaf0', deep: '#1a0220', glow: 'rgba(225,170,240,0.26)' },
};

function ProgressRing({ fase, pct }: { fase: number; pct: number }) {
  const r = 46, c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="transparent" strokeWidth="10"
          stroke="rgba(154,226,230,0.14)" />
        <circle cx="60" cy="60" r={r} fill="transparent" strokeWidth="10"
          stroke="var(--phase-accent, #34C5CC)" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.35s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold">F{fase}</span>
        <span className="text-[11px] text-white/60">de 5 fases</span>
      </div>
    </div>
  );
}

export default function DashboardHomePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState<any>(null);
  const [capacitacoes, setCapacitacoes] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [ultimosVideos, setUltimosVideos] = useState<any[]>([]);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const [result, kpisR, histR] = await Promise.all([
        loadDashboardData(),
        loadHomeKpis(),
        loadUltimosVideosColab(user.email, 3),
      ]);
      if (!result.error) setData(result);
      if (!kpisR?.error) setKpis(kpisR);
      if (!histR?.error) setUltimosVideos(histR?.items || []);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    const competencia = data?.competenciaFoco;
    const empresaId = data?.colaborador?.empresa_id;
    if (!competencia) { setCapacitacoes([]); return; }
    const params = new URLSearchParams({ competencia });
    if (empresaId) params.set('empresa_id', empresaId);
    fetchAuth(`/api/capacitacao-recomendada?${params}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setCapacitacoes(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setCapacitacoes([]));
  }, [data?.competenciaFoco, data?.colaborador?.empresa_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!data?.colaborador) {
    return <div className="p-6 text-center text-gray-400">Colaborador não encontrado.</div>;
  }

  const { colaborador } = data;
  const firstName = (colaborador.nome_completo || '').split(' ')[0] || 'você';
  const faseNum: number = kpis?.fase?.numero || 1;
  const faseTitulo = kpis?.fase?.titulo || 'Diagnóstico';
  const pct = kpis?.fase?.concluida ? 100 : Math.round(((faseNum - 1) / 5) * 100 + (kpis?.pilula?.semana ? (kpis.pilula.semana / 14) * 20 : 0));
  const competencia = data.competenciaFoco;

  // ✅ tokens de fase pra injetar como CSS custom properties
  const phaseTokens = PHASE_TOKENS[faseNum] ?? PHASE_TOKENS[2];

  const faseDescricoes: Record<number, string> = {
    1: 'Responda os cenários para mapear seu nível atual.',
    2: 'Sua trilha de desenvolvimento está sendo montada.',
    3: 'Siga sua temporada de 14 semanas e evolua.',
    4: 'Pratique e registre evidências do seu progresso.',
    5: 'Etapa final de reavaliação e consolidação.',
  };

  function handleMainCTA() {
    if (competencia) return router.push('/dashboard/temporada');
    if (!colaborador.perfil_dominante) return router.push('/dashboard/perfil-comportamental');
    router.push('/dashboard/assessment');
  }

  function mainCTALabel() {
    if (competencia) return 'Iniciar atividade de hoje';
    if (!colaborador.perfil_dominante) return 'Fazer diagnóstico comportamental';
    return (colaborador.respondidas || 0) > 0 ? 'Continuar avaliação' : 'Iniciar avaliação';
  }

  return (
    // ✅ data-phase + CSS vars injetadas aqui — todo componente filho herda
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
        <p className="text-base text-white/70 mb-1">Olá, {firstName}</p>
        <h1 className="text-[2rem] leading-[1.05] font-extrabold tracking-tight">
          Seu próximo avanço começa hoje
        </h1>
      </header>

      {/* Main */}
      <main className="flex-1 px-5 pb-28 space-y-5">

        {/* Hero — usa tokens de fase */}
        <section
          className="rounded-[28px] p-5 shadow-2xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${phaseTokens.deep} 0%, #0f2b54 100%)`,
            border: `1px solid color-mix(in oklab, var(--phase-accent) 30%, transparent)`,
          }}
        >
          {/* glow radial */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at 85% 10%, var(--phase-glow), transparent 55%)' }}
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <span
                  className="block mb-2 text-[11px] font-bold tracking-[0.12em] uppercase"
                  style={{ color: 'var(--phase-accent)' }}
                >
                  Foco da semana
                </span>
                <h2 className="text-[1.5rem] sm:text-[1.85rem] leading-[1.08] font-extrabold tracking-tight line-clamp-2">
                  {competencia || 'Preparação'}
                </h2>
              </div>
              <div className="shrink-0 px-3 py-2 rounded-full bg-white/10 border border-white/10 text-[12px] font-semibold text-white/85">
                Fase {faseNum}
              </div>
            </div>
            <p className="text-sm text-white/70 mb-5 leading-relaxed">
              {faseDescricoes[faseNum] || 'Continue sua jornada de desenvolvimento.'}
            </p>
            <button
              onClick={handleMainCTA}
              className="w-full py-4 rounded-2xl font-bold text-base transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(90deg, var(--phase-accent), color-mix(in oklab, var(--phase-accent) 60%, white))`,
                color: '#062032',
                boxShadow: '0 10px 24px var(--phase-glow)',
              }}
            >
              {mainCTALabel()}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>

        {/* Progress + Next step */}
        <section className="grid grid-cols-2 gap-4">
          <div
            className="rounded-[24px] p-4 border"
            style={{
              background: 'linear-gradient(180deg, rgba(12,32,56,0.95) 0%, rgba(8,26,46,0.95) 100%)',
              borderColor: 'color-mix(in oklab, var(--phase-accent) 25%, transparent)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white/90">Seu progresso</h3>
              <span className="text-xs font-semibold" style={{ color: 'var(--phase-accent)' }}>
                {Math.min(pct, 100)}%
              </span>
            </div>
            <div className="flex items-center justify-center py-2">
              <ProgressRing fase={faseNum} pct={Math.min(pct, 100)} />
            </div>
            <p className="text-[13px] text-white/70 text-center">{faseTitulo}</p>
          </div>

          <div
            className="rounded-[24px] p-4 flex flex-col justify-between border"
            style={{
              background: 'linear-gradient(180deg, rgba(12,32,56,0.95) 0%, rgba(8,26,46,0.95) 100%)',
              borderColor: 'color-mix(in oklab, var(--phase-accent) 25%, transparent)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
            }}
          >
            <div>
              <h3 className="text-sm font-semibold text-white/90 mb-2">Próxima meta</h3>
              <p className="text-base font-semibold leading-snug">
                {kpis?.proximoMarco?.label || (competencia ? `Avançar em ${competencia}` : 'Completar diagnóstico')}
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-white/10">
              <p className="text-[12px] text-white/60 mb-1">Prazo recomendado</p>
              <p className="text-sm font-medium" style={{ color: 'var(--phase-accent)' }}>
                {kpis?.proximoMarco?.diasAte != null
                  ? `${kpis.proximoMarco.diasAte} dia${kpis.proximoMarco.diasAte !== 1 ? 's' : ''}`
                  : 'Hoje'}
              </p>
            </div>
          </div>
        </section>

        {/* Secondary cards */}
        <section className="space-y-4">
          {/* Pílula / Insight */}
          <button
            onClick={() => router.push('/dashboard/praticar')}
            className="w-full text-left rounded-[22px] p-4 flex items-start gap-4 transition-all active:scale-[0.99]"
            style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(154,226,230,0.12)' }}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#0F2B54] border border-[#34C5CC]/20 flex items-center justify-center shrink-0">
              <Zap size={20} style={{ color: 'var(--phase-accent)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-1" style={{ color: 'var(--phase-accent)' }}>
                {kpis?.pilula ? `Pílula · Semana ${kpis.pilula.semana}` : 'Insight do dia'}
              </p>
              <h4 className="text-base font-bold mb-1 line-clamp-1">
                {kpis?.pilula?.titulo || 'Novas técnicas de liderança'}
              </h4>
              <p className="text-sm text-white/65 leading-relaxed line-clamp-2">
                {kpis?.pilula
                  ? (kpis.pilula.status === 'concluida' ? 'Concluída ✓ — Veja seu progresso' : 'Clique para acessar o conteúdo da semana')
                  : 'Um pequeno avanço pode aumentar muito seu impacto.'}
              </p>
            </div>
          </button>

          {/* Mentor IA (Beto) */}
          <button
            onClick={() => {
              const betoBtn = document.querySelector('[data-beto-trigger]') as HTMLButtonElement;
              if (betoBtn) betoBtn.click();
            }}
            className="w-full text-left rounded-[22px] p-4 flex items-start gap-4 transition-all active:scale-[0.99]"
            style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(154,226,230,0.12)' }}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#0F2B54] border border-[#34C5CC]/20 flex items-center justify-center shrink-0">
              <MessageCircle size={20} style={{ color: 'var(--phase-accent)' }} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold tracking-[0.12em] uppercase mb-1" style={{ color: 'var(--phase-accent)' }}>
                Mentor IA
              </p>
              <h4 className="text-base font-bold mb-1">Tire dúvidas sobre sua atividade</h4>
              <p className="text-sm text-white/65 leading-relaxed">
                O Beto pode explicar conceitos, sugerir exemplos e ajudar você a avançar.
              </p>
            </div>
          </button>
        </section>

        {/* Capacitação recomendada */}
        {capacitacoes.length > 0 && (
          <section className="pt-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold tracking-[0.12em] uppercase" style={{ color: 'var(--phase-accent)' }}>
                Capacitação recomendada
              </h3>
              <button
                onClick={() => router.push('/dashboard/temporada')}
                className="text-sm font-semibold"
                style={{ color: 'var(--phase-accent)' }}
              >
                Ver tudo
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {capacitacoes.slice(0, 4).map(item => {
                const isVideo = item.formato === 'video' && item.bunny_video_id;
                const label = FORMATO_LABEL[item.formato] || 'Conteúdo';
                const pillColors: Record<string, string> = {
                  video: 'bg-[#34C5CC]/15 text-[#9AE2E6]',
                  audio: 'bg-[#9E4EDD]/18 text-[#E1AAF0]',
                  texto: 'bg-emerald-400/15 text-emerald-300',
                  case: 'bg-amber-400/15 text-amber-300',
                };
                return (
                  <article
                    key={item.id}
                    className="rounded-[22px] overflow-hidden cursor-pointer transition-all active:scale-[0.98]"
                    style={{
                      background: 'linear-gradient(180deg, rgba(12,32,56,0.95), rgba(8,26,46,0.95))',
                      border: '1px solid rgba(52,197,204,0.16)',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                    }}
                    onClick={() => {
                      if (isVideo) setActiveVideo({ videoId: item.bunny_video_id, titulo: item.titulo });
                      else if (item.url) window.open(item.url, '_blank', 'noopener');
                    }}
                  >
                    <ContentThumb
                      formato={item.formato}
                      ordem={item.ordem ?? null}
                      duracao={item.duracao_fmt ?? null}
                      titulo={item.titulo}
                      bunnyId={item.bunny_video_id}
                    />
                    <div className="p-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold mb-2 ${pillColors[item.formato] || pillColors.video}`}>
                        {label}
                      </span>
                      <h4 className="font-bold leading-snug mb-1 line-clamp-2 text-sm">{item.titulo}</h4>
                      <p className="text-[13px] text-white/60 line-clamp-1">{item.descritor || item.competencia || ''}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Continuar de onde parou */}
        {ultimosVideos.length > 0 && (
          <section className="pt-1">
            <h3 className="text-sm font-semibold tracking-[0.12em] uppercase mb-3" style={{ color: 'var(--phase-accent)' }}>
              Continuar de onde parou
            </h3>
            <div className="space-y-2">
              {ultimosVideos.map(v => {
                const meta = capacitacoes.find((c: any) => c.bunny_video_id === v.videoId);
                const titulo = meta?.titulo || 'Vídeo';
                return (
                  <button
                    key={v.videoId}
                    onClick={() => setActiveVideo({ videoId: v.videoId, titulo })}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.99]"
                    style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(154,226,230,0.12)' }}
                  >
                    <div
                      className="relative w-20 h-12 shrink-0 rounded-lg overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #0F2B54, #0D9488)' }}
                    >
                      <img
                        src={`/api/bunny-thumb/${v.videoId}`}
                        alt={titulo}
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play size={16} className="text-white" fill="currentColor" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{titulo}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">
                        {v.concluido ? 'Concluído ✓' : `${v.pct}% assistido`}
                      </p>
                      <div className="mt-1.5 h-1 rounded-full overflow-hidden bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${v.pct}%`, background: v.concluido ? '#10B981' : 'var(--phase-accent)' }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Gestor: botão equipe */}
        {(data?.view === 'gestor' || data?.view === 'rh') && (
          <button
            onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
            className="w-full py-3 rounded-2xl text-sm font-bold border transition-all active:scale-[0.98]"
            style={{
              color: 'var(--phase-accent)',
              borderColor: 'color-mix(in oklab, var(--phase-accent) 30%, transparent)',
              background: 'color-mix(in oklab, var(--phase-accent) 5%, transparent)',
            }}
          >
            Ver evolução da equipe
          </button>
        )}
      </main>

      {activeVideo && (
        <VideoModal
          libraryId={BUNNY_LIBRARY}
          videoId={activeVideo.videoId}
          title={activeVideo.titulo}
          colaboradorId={data?.colaborador?.id}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}
