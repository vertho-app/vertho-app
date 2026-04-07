'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { ClipboardCheck, Target, TrendingUp, BookOpen, Loader2, Users, BarChart3 } from 'lucide-react';

function detectRole(cargo) {
  if (!cargo) return 'colaborador';
  const lower = cargo.toLowerCase();
  if (/\b(rh|diretor|ceo|admin|diretora|superintendente)\b/.test(lower)) return 'rh';
  if (/\b(coordenador|gestor|gerente|coordenadora|gestora|supervisora?)\b/.test(lower)) return 'gestor';
  return 'colaborador';
}

export default function DashboardPage() {
  const [colab, setColab] = useState(null);
  const [role, setRole] = useState('colaborador');
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const { data } = await supabase
        .from('colaboradores')
        .select('id, nome_completo, cargo, empresa_id, area_depto, perfil_dominante')
        .eq('email', user.email)
        .single();

      if (data) {
        const detectedRole = detectRole(data.cargo);
        setRole(detectedRole);

        // Buscar progresso individual
        const { count: totalComp } = await supabase
          .from('competencias')
          .select('id', { count: 'exact', head: true })
          .eq('empresa_id', data.empresa_id);

        const { count: respondidas } = await supabase
          .from('respostas')
          .select('id', { count: 'exact', head: true })
          .eq('colaborador_id', data.id)
          .not('nivel_ia4', 'is', null);

        data.totalComp = totalComp || 0;
        data.respondidas = respondidas || 0;
        data.progresso = totalComp ? Math.round((respondidas / totalComp) * 100) : 0;

        // Se RH ou Gestor, buscar dados da equipe
        if (detectedRole !== 'colaborador') {
          const { count: totalColabs } = await supabase
            .from('colaboradores')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', data.empresa_id);

          const { count: totalRespostas } = await supabase
            .from('respostas')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', data.empresa_id)
            .not('nivel_ia4', 'is', null);

          setTeamData({
            totalColabs: totalColabs || 0,
            totalRespostas: totalRespostas || 0,
          });
        }
      }

      setColab(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (!colab) return <div className="p-6 text-center text-gray-400">Colaborador nao encontrado para este e-mail.</div>;

  const cards = [
    { label: 'Assessment', desc: `${colab.respondidas}/${colab.totalComp} competencias`, icon: ClipboardCheck, href: '/dashboard/assessment', color: '#3B82F6' },
    { label: 'PDI', desc: 'Plano de desenvolvimento', icon: Target, href: '/dashboard/pdi', color: '#22C55E' },
    { label: 'Praticar', desc: 'Exercicios semanais', icon: TrendingUp, href: '/dashboard/praticar', color: '#F59E0B' },
    { label: 'Jornada', desc: 'Sua evolucao', icon: BookOpen, href: '/dashboard/jornada', color: '#A78BFA' },
  ];

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">
          Ola, {colab.nome_completo?.split(' ')[0] || 'Colaborador'}!
        </h1>
        <p className="text-sm text-gray-400 mt-1">{colab.cargo || 'Colaborador'}</p>
        {role !== 'colaborador' && (
          <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-400">
            {role === 'rh' ? 'Visao RH' : 'Visao Gestor'}
          </span>
        )}
      </div>

      {/* Team KPIs (RH/Gestor only) */}
      {teamData && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <Users size={18} className="text-cyan-400 mb-1" />
            <p className="text-xl font-bold text-white">{teamData.totalColabs}</p>
            <p className="text-[10px] text-gray-500">{role === 'rh' ? 'Total empresa' : 'Na equipe'}</p>
          </div>
          <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <BarChart3 size={18} className="text-cyan-400 mb-1" />
            <p className="text-xl font-bold text-white">{teamData.totalRespostas}</p>
            <p className="text-[10px] text-gray-500">Avaliacoes concluidas</p>
          </div>
        </div>
      )}

      {/* Individual Progress */}
      <div className="rounded-xl p-4 mb-6 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Seu Progresso</span>
          <span className="text-sm font-bold text-cyan-400">{colab.progresso}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
          <div className="h-full rounded-full transition-all duration-500 bg-cyan-400" style={{ width: `${colab.progresso}%` }} />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <button key={card.href} onClick={() => router.push(card.href)}
              className="flex flex-col items-start gap-2 p-4 rounded-xl border border-white/[0.06] text-left hover:border-white/[0.15] transition-all"
              style={{ background: '#0F2A4A' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: card.color + '15' }}>
                <Icon size={18} style={{ color: card.color }} />
              </div>
              <div>
                <p className="text-sm font-bold text-white">{card.label}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">{card.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Perfil CIS shortcut */}
      {colab.perfil_dominante && (
        <button onClick={() => router.push('/dashboard/perfil-cis')}
          className="w-full mt-4 p-4 rounded-xl border border-white/[0.06] text-left hover:border-white/[0.15] transition-all"
          style={{ background: '#0F2A4A' }}>
          <p className="text-sm font-bold text-white">Perfil Comportamental</p>
          <p className="text-[10px] text-gray-500 mt-0.5">Seu perfil: <span className="text-cyan-400">{colab.perfil_dominante}</span></p>
        </button>
      )}
    </div>
  );
}
