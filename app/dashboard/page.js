'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import {
  Search, Bell, ArrowRight, Play, ChevronRight, Star, Loader2,
} from 'lucide-react';
import { loadDashboardData } from './dashboard-actions';
import VideoModal from '@/components/video-modal';

// Mocks estáticos — features ainda não existem no projeto
const MOCK_CERTIFICACOES = 12;
const MOCK_FEEDBACK = 4.8;
const MOCK_FOCO = 'Liderança';
const MOCK_GAPS_CRITICOS = 1;

// Library do Bunny Stream — passada pro VideoModal. A lista de vídeos
// é carregada dinamicamente via /api/bunny-videos (cache 5 min).
const BUNNY_LIBRARY = 636615;

function BentoCard({ label, value, unit, accent = 'cyan', icon: Icon }) {
  const valueColor = accent === 'cyan' ? 'text-cyan-400' : 'text-white';
  const unitColor = accent === 'cyan' ? 'text-white' : 'text-gray-400';
  return (
    <div
      className="rounded-2xl border border-white/[0.06] p-5 md:p-7 h-36 md:h-44 flex flex-col justify-between transition-colors duration-300 hover:bg-white/[0.04]"
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}
    >
      <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl md:text-5xl font-black ${valueColor}`}>{value}</span>
        {Icon ? (
          <Icon size={22} className="text-cyan-400 mb-1" fill="currentColor" />
        ) : (
          <span className={`text-sm md:text-lg font-semibold ${unitColor}`}>{unit}</span>
        )}
      </div>
    </div>
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
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadDashboardData(user.email);
      if (!result.error) setData(result);
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
            Seu foco de evolução hoje é{' '}
            <span className="text-cyan-400">{MOCK_FOCO}</span>
          </h1>
          <button onClick={() => router.push('/dashboard/assessment')}
            className="flex items-center gap-3 px-6 py-3 md:px-8 md:py-4 rounded-full font-semibold text-white transition-all hover:scale-[1.02] active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #0D9488, #0F766E)',
              boxShadow: '0 0 28px rgba(0,180,216,0.25)',
            }}>
            Iniciar Avaliação de {MOCK_FOCO}
            <ArrowRight size={18} />
          </button>
        </section>

        {/* Bento grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-14 md:mb-16">
          <BentoCard label="Meu PDI" value={MOCK_GAPS_CRITICOS} unit="GAP CRÍTICO" accent="cyan" />
          <BentoCard label="Progresso Geral" value={progresso} unit="%" accent="white" />
          <BentoCard label="Certificações" value={MOCK_CERTIFICACOES} unit="ATIVAS" accent="white" />
          <BentoCard label="Time Feedback" value={MOCK_FEEDBACK} icon={Star} accent="white" />
        </section>

        {/* Carousel */}
        <section>
          <div className="flex justify-between items-center mb-5 md:mb-6">
            <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-gray-400">
              CAPACITAÇÃO RECOMENDADA
            </h2>
            <button onClick={() => router.push('/dashboard/praticar')}
              className="text-cyan-400 text-xs md:text-sm font-semibold flex items-center gap-1 hover:opacity-80">
              VER TUDO <ChevronRight size={16} />
            </button>
          </div>

          {capacitacoes.length === 0 ? (
            <p className="text-xs text-gray-500">Nenhum vídeo disponível no momento.</p>
          ) : (
            <div className="flex gap-4 md:gap-6 overflow-x-auto pb-6 snap-x -mx-5 md:-mx-10 px-5 md:px-10">
              {capacitacoes.map(item => (
                <CapacitacaoCard key={item.videoId} item={item}
                  onClick={() => setActiveVideo({ videoId: item.videoId, titulo: item.titulo })} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Modal do vídeo (Bunny Stream) */}
      {activeVideo && (
        <VideoModal
          libraryId={BUNNY_LIBRARY}
          videoId={activeVideo.videoId}
          title={activeVideo.titulo}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </div>
  );
}
