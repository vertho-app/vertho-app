'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Brain, Target, MessageSquare, FileText, ChevronRight, Loader2 } from 'lucide-react';
import { loadDashboardData } from './dashboard-actions';

export default function DashboardPage() {
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

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (!data?.colaborador) return <div className="p-6 text-center text-gray-400">Colaborador não encontrado.</div>;

  const { colaborador, view } = data;
  const firstName = colaborador.nome_completo?.split(' ')[0] || '';
  const progresso = colaborador.progresso || 0;

  // Determinar próximo passo
  const proximoPasso = getProximoPasso(colaborador);

  const quickAccess = [
    { label: 'Perfil Comportamental', icon: Brain, href: '/dashboard/perfil-cis', color: '#00B4D8' },
    { label: 'Competências', icon: Target, href: '/dashboard/assessment', color: '#00B4D8' },
    { label: 'Mentor IA', icon: MessageSquare, href: '#beto', color: '#00B4D8', action: 'beto' },
    { label: 'Meu PDI', icon: FileText, href: '/dashboard/pdi', color: '#00B4D8' },
  ];

  return (
    <div className="px-4 py-6 max-w-[800px] mx-auto">
      {/* Hero card */}
      <div className="rounded-xl p-5 mb-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <p className="text-sm text-gray-400">Olá{firstName ? `, ${firstName}` : ''}</p>
        <p className="text-lg font-bold text-white mt-0.5">Vamos continuar sua evolução</p>
        <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
          <div className="h-full rounded-full transition-all duration-500 bg-cyan-400" style={{ width: `${progresso}%` }} />
        </div>
        <p className="text-[11px] text-gray-500 mt-1.5">{progresso}% da jornada concluída</p>
      </div>

      {/* Próximo passo */}
      {proximoPasso && (
        <button onClick={() => router.push(proximoPasso.href)}
          className="w-full rounded-xl p-4 mb-6 border border-cyan-400/20 flex items-center justify-between hover:border-cyan-400/40 transition-colors"
          style={{ background: 'rgba(0,180,216,0.06)' }}>
          <div>
            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Próximo Passo</p>
            <p className="text-sm font-semibold text-white mt-0.5">{proximoPasso.label}</p>
          </div>
          <ChevronRight size={18} className="text-cyan-400" />
        </button>
      )}

      {/* Acesso Rápido */}
      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Acesso Rápido</p>
      <div className="grid grid-cols-2 gap-3">
        {quickAccess.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.label}
              onClick={() => {
                if (item.action === 'beto') {
                  // Trigger BETO chat open - dispatch custom event
                  window.dispatchEvent(new CustomEvent('open-beto'));
                } else {
                  router.push(item.href);
                }
              }}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/[0.06] hover:border-white/[0.15] transition-all"
              style={{ background: '#0F2A4A' }}>
              <Icon size={28} style={{ color: item.color }} />
              <span className="text-sm font-semibold text-white">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function getProximoPasso(colab) {
  // Lógica para determinar o próximo passo do colaborador
  if (!colab.perfil_dominante) {
    return { label: 'Preencher perfil comportamental', href: '/dashboard/perfil-cis' };
  }
  if (colab.respondidas === 0) {
    return { label: 'Iniciar avaliação de competências', href: '/dashboard/assessment' };
  }
  if (colab.respondidas < colab.totalComp) {
    return { label: `Continuar avaliação (${colab.respondidas}/${colab.totalComp})`, href: '/dashboard/assessment' };
  }
  return { label: 'Ver seu Plano de Desenvolvimento', href: '/dashboard/pdi' };
}
