'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import {
  Search, Bell, ArrowRight, Play, ChevronRight, Loader2,
  BookOpen, FileEdit, Compass, Hourglass, CheckCircle2, AlertCircle, Hammer,
} from 'lucide-react';
import { loadDashboardData } from './dashboard-actions';
import { loadHomeKpis } from '@/actions/dashboard-kpis';
import { loadUltimosVideosColab } from '@/actions/video-analytics';
import VideoModal from '@/components/video-modal';

// Library do Bunny Stream — passada pro VideoModal. A lista de vídeos
// é carregada dinamicamente via /api/bunny-videos (cache 5 min).
const BUNNY_LIBRARY = 636615;

/**
 * Wrapper visual dos cards do bento. Recebe label, ícone e children livre
 * (cada KPI tem layout próprio dentro). Suporta empty state.
 */
function BentoCard({ label, icon: Icon, onClick, empty, emptyHint, children }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`text-left rounded-2xl border border-white/[0.06] p-5 md:p-6 h-36 md:h-44 flex flex-col justify-between transition-all duration-300 overflow-hidden ${
        onClick ? 'hover:bg-white/[0.05] hover:border-white/15 cursor-pointer active:scale-[0.99]' : ''
      }`}
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && <Icon size={11} className="text-gray-500 shrink-0" />}
        <span className="text-[10px] font-bold tracking-wider md:tracking-[0.2em] text-gray-400 uppercase truncate">{label}</span>
      </div>
      {empty ? (
        <div>
          <span className="text-4xl md:text-5xl font-black text-gray-600">—</span>
          {emptyHint && <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">{emptyHint}</p>}
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}
    </Wrapper>
  );
}

// ── KPIs específicos ────────────────────────────────────────────────────────

function CardPilula({ pilula, onClick }) {
  if (!pilula) {
    return <BentoCard label="Pílula da semana" icon={BookOpen} onClick={onClick}
      empty emptyHint="Trilha em montagem" />;
  }
  const status = pilula.status === 'concluida'
    ? { text: 'Concluída ✓', cls: 'text-emerald-400 bg-emerald-400/10' }
    : pilula.ehImplementacao
      ? { text: 'Implementação', cls: 'text-amber-400 bg-amber-400/10' }
      : { text: 'Em curso', cls: 'text-cyan-400 bg-cyan-400/10' };
  return (
    <BentoCard label={`Pílula · S${pilula.semana}`} icon={BookOpen} onClick={onClick}>
      <p className="text-base md:text-lg font-extrabold text-white leading-tight line-clamp-2">
        {pilula.titulo}
      </p>
      <span className={`inline-block mt-2 text-[9px] md:text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${status.cls}`}>
        {status.text}
      </span>
    </BentoCard>
  );
}

function CardEvidencia({ ev, onClick }) {
  if (!ev) {
    return <BentoCard label="Evidência" icon={FileEdit} onClick={onClick}
      empty emptyHint="Aguardando início da trilha" />;
  }

  if (ev.status === 'registrada') {
    return (
      <BentoCard label="Evidência" icon={CheckCircle2} onClick={onClick}>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl md:text-4xl font-black text-emerald-400">✓</span>
          <span className="text-sm md:text-base font-bold text-white">Registrada</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1">
          {ev.dataRegistro && new Date(ev.dataRegistro).toLocaleDateString('pt-BR')}
        </p>
      </BentoCard>
    );
  }

  if (ev.status === 'atrasada') {
    return (
      <BentoCard label="Evidência" icon={AlertCircle} onClick={onClick}>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl md:text-5xl font-black text-red-400">{ev.diasAtraso}d</span>
          <span className="text-xs md:text-sm font-bold text-red-400">de atraso</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5">Registre agora para não acumular</p>
      </BentoCard>
    );
  }

  // pendente
  return (
    <BentoCard label="Evidência" icon={Hourglass} onClick={onClick}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl md:text-5xl font-black text-cyan-400">{ev.diasRestantes}</span>
        <span className="text-xs md:text-sm font-bold text-white">{ev.diasRestantes === 1 ? 'dia' : 'dias'} restantes</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-1.5">Pra registrar essa semana</p>
    </BentoCard>
  );
}

function CardFase({ fase, onClick }) {
  if (!fase) {
    return <BentoCard label="Sua jornada" icon={Compass} onClick={onClick}
      empty emptyHint="Sem dados ainda" />;
  }
  if (fase.concluida) {
    return (
      <BentoCard label="Sua jornada" icon={Compass} onClick={onClick}>
        <p className="text-base md:text-lg font-extrabold text-white">Jornada concluída</p>
        <span className="inline-block mt-2 text-[9px] md:text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full text-emerald-400 bg-emerald-400/10">
          🎉 Completa
        </span>
      </BentoCard>
    );
  }
  return (
    <BentoCard label="Sua jornada" icon={Compass} onClick={onClick}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl md:text-5xl font-black text-white">F{fase.numero}</span>
        <span className="text-xs md:text-sm font-bold text-gray-400">de 5</span>
      </div>
      <p className="text-[11px] md:text-xs font-semibold text-cyan-400 mt-1.5 truncate">{fase.titulo}</p>
    </BentoCard>
  );
}

function CardProximoMarco({ marco, onClick }) {
  if (!marco) {
    return <BentoCard label="Próximo marco" icon={Hourglass} onClick={onClick}
      empty emptyHint="Sem marcos agendados" />;
  }
  const tipoIcon = marco.tipo === 'implementacao' ? Hammer : marco.tipo === 'fim' ? CheckCircle2 : BookOpen;
  return (
    <BentoCard label="Próximo marco" icon={tipoIcon} onClick={onClick}>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl md:text-5xl font-black text-cyan-400">{marco.diasAte}d</span>
        <span className="text-xs md:text-sm font-bold text-white">{marco.diasAte === 1 ? 'dia' : 'dias'}</span>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5 truncate">{marco.label}</p>
    </BentoCard>
  );
}

function CapacitacaoCard({ item, onClick }) {
  return (
    <div className="flex-shrink-0 w-[300px] md:w-[420px] snap-start group cursor-pointer" onClick={onClick}>
      <div
        className="relative aspect-video rounded-xl overflow-hidden mb-3 border border-white/[0.05] transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ background: 'linear-gradient(135deg, #0F2B54 0%, #0D9488 100%)' }}
      >
        {/* Thumbnail real do Bunny via proxy. Fica sobreposta ao gradient
            (que serve de fallback se a imagem não carregar). */}
        <img src={`/api/bunny-thumb/${item.videoId}`}
          alt={item.titulo}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Play overlay central — aparece cheio no hover */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{
              background: 'rgba(0,180,216,0.85)',
              boxShadow: '0 0 24px rgba(0,180,216,0.5)',
            }}>
            <Play size={26} className="text-white ml-1" fill="currentColor" />
          </div>
        </div>

        {item.badge && (
          <div className="absolute top-4 left-4 bg-cyan-400 text-slate-900 text-[10px] font-extrabold px-3 py-1 rounded-full flex items-center gap-1">
            <Play size={10} fill="currentColor" />
            {item.badge}
          </div>
        )}

        {typeof item.progresso === 'number' && (
          <div className="absolute bottom-0 left-0 w-full h-1 bg-white/15">
            <div className="bg-cyan-400 h-full" style={{ width: `${item.progresso}%` }} />
          </div>
        )}
      </div>
      <h3 className="text-white font-semibold text-base mb-1">{item.titulo}</h3>
      <p className="text-gray-500 text-xs">{item.legenda}</p>
    </div>
  );
}

export default function DashboardHomePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState(null); // { videoId, titulo }
  const [capacitacoes, setCapacitacoes] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [ultimosVideos, setUltimosVideos] = useState([]);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const [result, kpisR, histR] = await Promise.all([
        loadDashboardData(user.email),
        loadHomeKpis(user.email),
        loadUltimosVideosColab(user.email, 3),
      ]);
      if (!result.error) setData(result);
      if (!kpisR?.error) setKpis(kpisR);
      if (!histR?.error) setUltimosVideos(histR?.items || []);
      setLoading(false);
    }
    init();
  }, []);

  // Lista de vídeos do Bunny — atualiza a cada montagem; o server cacheia 5 min
  useEffect(() => {
    fetch('/api/bunny-videos')
      .then(r => r.ok ? r.json() : null)
      .then(d => setCapacitacoes(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setCapacitacoes([]));
  }, []);

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
  const firstName = (colaborador.nome_completo || '').split(' ')[0] || '';
  const progresso = colaborador.progresso || 0;

  return (
    <div>
      {/* Top bar editorial (desktop) */}
      <div className="hidden md:flex items-center justify-between h-20 px-10 sticky top-0 z-30 backdrop-blur"
        style={{ background: 'rgba(9,29,53,0.75)' }}>
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '26px' }} />
        <div className="flex items-center gap-5">
          <button className="text-gray-400 hover:text-white transition-colors" title="Buscar">
            <Search size={18} />
          </button>
          <button className="text-gray-400 hover:text-white transition-colors" title="Notificações">
            <Bell size={18} />
          </button>
          <button onClick={() => router.push('/dashboard/assessment')}
            className="flex items-center gap-2 text-sm font-extrabold text-white px-5 py-2.5 rounded-full transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            Iniciar Avaliação
          </button>
        </div>
      </div>

      <main className="px-5 md:px-10 pt-6 pb-24">
        {/* Hero */}
        <section className="mb-10 md:mb-14">
          <p className="text-sm md:text-lg text-gray-400 mb-1">Olá, {firstName || 'você'}</p>
          <h1 className="font-extrabold text-2xl md:text-5xl text-white leading-tight max-w-3xl mb-6"
            style={{ textShadow: '0 0 40px rgba(0, 180, 216, 0.18)' }}>
            {data?.competenciaFoco
              ? <>Seu foco de evolução hoje é <span className="text-cyan-400">{data.competenciaFoco}</span></>
              : <>Prepare-se para sua jornada de desenvolvimento</>
            }
          </h1>
          <button onClick={() => {
              if (data?.competenciaFoco) return router.push('/dashboard/temporada');
              if (!data?.colaborador?.perfil_dominante) return router.push('/dashboard/perfil-comportamental/mapeamento');
              router.push('/dashboard/assessment');
            }}
            className="flex items-center gap-3 px-6 py-3 md:px-8 md:py-4 rounded-full font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #0D9488, #0F766E)',
              boxShadow: '0 0 28px rgba(0,180,216,0.25)',
            }}>
            {(() => {
              if (data?.competenciaFoco) return `Ver Temporada de ${data.competenciaFoco}`;
              if (!data?.colaborador?.perfil_dominante) return 'Fazer diagnóstico comportamental';
              const respondidas = data?.colaborador?.respondidas || 0;
              return respondidas > 0 ? 'Continuar avaliação de competências' : 'Iniciar avaliação de competências';
            })()}
            <ArrowRight size={18} />
          </button>
        </section>

        {/* Bento grid — 4 KPIs do ciclo semanal */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-14 md:mb-16">
          <CardPilula pilula={kpis?.pilula}
            onClick={() => router.push('/dashboard/praticar')} />
          <CardEvidencia ev={kpis?.evidencia}
            onClick={() => router.push('/dashboard/praticar/evidencia')} />
          <CardFase fase={kpis?.fase}
            onClick={() => router.push('/dashboard/jornada')} />
          <CardProximoMarco marco={kpis?.proximoMarco}
            onClick={() => router.push('/dashboard/praticar')} />
        </section>

        {/* Meu histórico — últimos vídeos assistidos */}
        {ultimosVideos.length > 0 && (
          <section className="mb-12 md:mb-14">
            <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-gray-400 mb-4">
              CONTINUAR DE ONDE PAROU
            </h2>
            <div className="space-y-2">
              {ultimosVideos.map(v => {
                const meta = capacitacoes.find(c => c.videoId === v.videoId);
                const titulo = meta?.titulo || 'Vídeo';
                return (
                  <button key={v.videoId}
                    onClick={() => setActiveVideo({ videoId: v.videoId, titulo })}
                    className="w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl border border-white/[0.06] text-left transition-all hover:border-white/15 hover:bg-white/[0.03] active:scale-[0.99]"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {/* Thumb do bunny */}
                    <div className="relative w-24 h-14 md:w-28 md:h-16 shrink-0 rounded-lg overflow-hidden border border-white/[0.05]"
                      style={{ background: 'linear-gradient(135deg, #0F2B54 0%, #0D9488 100%)' }}>
                      <img src={`/api/bunny-thumb/${v.videoId}`} alt={titulo}
                        className="w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play size={20} className="text-white drop-shadow" fill="currentColor" />
                      </div>
                      {v.concluido && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8l3 3 7-7" stroke="#0A1D35" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm md:text-base font-bold text-white truncate">{titulo}</p>
                      <p className="text-[10px] md:text-xs text-gray-500 mt-0.5">
                        {v.concluido ? 'Concluído' : `${v.pct}% assistido`}
                        {' · '}
                        {new Date(v.watchedAt).toLocaleDateString('pt-BR')}
                      </p>
                      {/* Progress bar fina */}
                      <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${v.pct}%`, background: v.concluido ? '#10B981' : '#00B4D8' }} />
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Carousel — só aparece se o colab já tem temporada gerada */}
        {data?.temporadaPronta && capacitacoes.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-5 md:mb-6">
              <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-gray-400">
                CAPACITAÇÃO RECOMENDADA
              </h2>
              <button onClick={() => router.push('/dashboard/temporada')}
                className="text-cyan-400 text-xs md:text-sm font-semibold flex items-center gap-1 hover:opacity-80">
                VER TUDO <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex gap-4 md:gap-6 overflow-x-auto pb-6 snap-x -mx-5 md:-mx-10 px-5 md:px-10">
              {capacitacoes.map(item => (
                <CapacitacaoCard key={item.videoId} item={item}
                  onClick={() => setActiveVideo({ videoId: item.videoId, titulo: item.titulo })} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Modal do vídeo (Bunny Stream) */}
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
