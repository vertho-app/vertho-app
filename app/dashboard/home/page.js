'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import {
  Home, BookOpen, BarChart3, User, Settings,
  Search, Bell, ArrowRight, Play, ChevronRight, Star, Loader2,
} from 'lucide-react';
import { loadDashboardData } from '../dashboard-actions';

// Mocks estáticos para esta fase 1 (o projeto ainda não tem essas features)
const MOCK_CERTIFICACOES = 12;
const MOCK_FEEDBACK = 4.8;
const MOCK_FOCO = 'Liderança';
const MOCK_GAPS_CRITICOS = 1;

const MOCK_CAPACITACOES = [
  {
    titulo: 'Temporada 1: Liderança de Times',
    legenda: 'Módulo 4 de 8 • 12 min restantes',
    badge: 'CONTINUAR ASSISTINDO',
    progresso: 45,
    cover: 'linear-gradient(135deg, #0F2B54 0%, #0D9488 100%)',
  },
  {
    titulo: 'Inteligência Emocional',
    legenda: 'Nova Masterclass • 45 min',
    cover: 'linear-gradient(135deg, #001f47 0%, #0F2B54 60%, #00B4D8 140%)',
  },
  {
    titulo: 'Gestão Ágil',
    legenda: 'Certificação • 2.5 horas',
    cover: 'linear-gradient(135deg, #0F2A4A 0%, #0D9488 200%)',
  },
];

// ── Sidebar desktop ────────────────────────────────────────────────────────
function SideNav({ initials }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { icon: Home, href: '/dashboard/home', label: 'Início' },
    { icon: BookOpen, href: '/dashboard/praticar', label: 'Trilhas' },
    { icon: BarChart3, href: '/dashboard/jornada', label: 'Jornada' },
    { icon: User, href: '/dashboard/perfil-comportamental', label: 'Perfil' },
  ];

  return (
    <aside
      className="hidden md:flex fixed left-0 top-0 h-full w-20 border-r border-white/10 flex-col items-center py-8 gap-10 z-40"
      style={{ background: '#001330' }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
        {initials || 'U'}
      </div>
      <nav className="flex flex-col gap-8 flex-1">
        {items.map(it => {
          const active = pathname === it.href;
          const Icon = it.icon;
          return (
            <button key={it.href} onClick={() => router.push(it.href)}
              title={it.label}
              className={`transition-all duration-300 ${
                active
                  ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,180,216,0.45)] scale-110'
                  : 'text-gray-500 hover:text-white hover:scale-110 active:scale-95'
              }`}>
              <Icon size={22} />
            </button>
          );
        })}
      </nav>
      <button onClick={() => router.push('/dashboard/perfil')}
        title="Configurações"
        className="text-gray-500 hover:text-white transition-colors">
        <Settings size={22} />
      </button>
    </aside>
  );
}

// ── Bento card ─────────────────────────────────────────────────────────────
function BentoCard({ label, value, unit, accent = 'cyan', icon: Icon }) {
  const valueColor = accent === 'cyan' ? 'text-cyan-400' : 'text-white';
  const unitColor = accent === 'cyan' ? 'text-white' : 'text-gray-400';
  return (
    <div
      className="rounded-2xl border border-white/[0.06] p-6 md:p-8 h-40 md:h-48 flex flex-col justify-between transition-colors duration-300 hover:bg-white/[0.04]"
      style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}
    >
      <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={`text-4xl md:text-5xl font-black ${valueColor}`}>{value}</span>
        {Icon ? (
          <Icon size={22} className="text-cyan-400 mb-1" fill="currentColor" />
        ) : (
          <span className={`text-base md:text-lg font-semibold ${unitColor}`}>{unit}</span>
        )}
      </div>
    </div>
  );
}

// ── Card do carrossel ──────────────────────────────────────────────────────
function CapacitacaoCard({ item, onClick }) {
  return (
    <div className="flex-shrink-0 w-[340px] md:w-[420px] snap-start group cursor-pointer" onClick={onClick}>
      <div
        className="relative aspect-video rounded-xl overflow-hidden mb-3 border border-white/[0.05] transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ background: item.cover }}
      >
        {/* gradient escuro no rodapé pra legibilidade */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

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

// ── Página ─────────────────────────────────────────────────────────────────
export default function HomeCinematicPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const initials = (colaborador.nome_completo || '')
    .split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U';
  const progresso = colaborador.progresso || 0;

  return (
    <>
      <SideNav initials={initials} />

      {/* Conteúdo principal. ml-20 só em md+ pra dar espaço pra sidebar fixa */}
      <div className="md:ml-20">
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 md:h-20 flex items-center justify-between px-6 md:px-12 backdrop-blur"
          style={{ background: 'rgba(0,19,48,0.75)' }}>
          <div className="text-base md:text-xl font-extrabold text-white tracking-tight">
            Vertho Mentor IA
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <button className="text-gray-400 hover:text-white transition-colors" title="Buscar">
              <Search size={18} />
            </button>
            <button className="text-gray-400 hover:text-white transition-colors relative" title="Notificações">
              <Bell size={18} />
            </button>
            <button onClick={() => router.push('/dashboard/assessment')}
              className="hidden md:flex items-center gap-2 text-xs md:text-sm font-extrabold text-white px-5 py-2.5 rounded-full transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              Iniciar Avaliação
            </button>
          </div>
        </header>

        <main className="px-6 md:px-12 pt-6 pb-24">
          {/* Hero */}
          <section className="mb-10 md:mb-16">
            <p className="text-sm md:text-lg text-gray-400 mb-1">Olá, {firstName || 'você'}</p>
            <h1 className="font-extrabold text-3xl md:text-5xl text-white leading-tight max-w-3xl mb-6"
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
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-16 md:mb-20">
            <BentoCard label="Meu PDI" value={MOCK_GAPS_CRITICOS} unit="GAP CRÍTICO" accent="cyan" />
            <BentoCard label="Progresso Geral" value={progresso} unit="%" accent="white" />
            <BentoCard label="Certificações" value={MOCK_CERTIFICACOES} unit="ATIVAS" accent="white" />
            <BentoCard label="Time Feedback" value={MOCK_FEEDBACK} icon={Star} accent="white" />
          </section>

          {/* Carousel */}
          <section>
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <h2 className="text-xs md:text-sm font-bold tracking-[0.2em] text-gray-400">
                CAPACITAÇÃO RECOMENDADA
              </h2>
              <button onClick={() => router.push('/dashboard/praticar')}
                className="text-cyan-400 text-xs md:text-sm font-semibold flex items-center gap-1 hover:opacity-80">
                VER TUDO <ChevronRight size={16} />
              </button>
            </div>

            <div className="flex gap-4 md:gap-8 overflow-x-auto pb-6 snap-x -mx-6 md:-mx-12 px-6 md:px-12">
              {MOCK_CAPACITACOES.map((item, i) => (
                <CapacitacaoCard key={i} item={item} onClick={() => router.push('/dashboard/praticar')} />
              ))}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
