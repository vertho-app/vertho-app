'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, User, Mail, Briefcase, Building2, LogOut, Shield, ArrowRight } from 'lucide-react';
import { loadPerfil } from './perfil-actions';
import { PageContainer, PageHero, GlassCard } from '@/components/page-shell';

const ROLE_LABELS = {
  colaborador: { label: 'Colaborador', color: '#6B7280' },
  gestor: { label: 'Gestor', color: '#F59E0B' },
  rh: { label: 'RH', color: '#00B4D8' },
};

// Paleta DISC sem vermelho, consistente com o resto do app (D=amarelo, I=cinza, S=verde, C=azul)
const DISC_COLOR = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };

export default function PerfilPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadPerfil(user.email);
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <PageContainer><p className="text-center text-gray-400">{error}</p></PageContainer>;
  if (!data) return null;

  const { colaborador, empresaNome } = data;
  const role = ROLE_LABELS[colaborador.role] || ROLE_LABELS.colaborador;
  const hasDISC = colaborador.perfil_dominante && (colaborador.d_natural || colaborador.i_natural || colaborador.s_natural || colaborador.c_natural);
  const initials = (colaborador.nome_completo || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'U';

  return (
    <PageContainer className="space-y-5 max-w-[720px]">
      <PageHero
        eyebrow="MEU PERFIL"
        title={colaborador.nome_completo}
        subtitle={colaborador.cargo}
      />

      {/* Avatar + role badge */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-extrabold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
          {initials}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full inline-flex items-center gap-1"
          style={{ color: role.color, background: role.color + '18' }}>
          <Shield size={11} />
          {role.label}
        </span>
      </div>

      {/* Info card */}
      <GlassCard>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail size={16} className="text-gray-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Email</p>
              <p className="text-sm text-white truncate">{colaborador.email}</p>
            </div>
          </div>
          {colaborador.cargo && (
            <div className="flex items-center gap-3">
              <Briefcase size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Cargo</p>
                <p className="text-sm text-white">{colaborador.cargo}</p>
              </div>
            </div>
          )}
          {colaborador.area_depto && (
            <div className="flex items-center gap-3">
              <Building2 size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Área / Departamento</p>
                <p className="text-sm text-white">{colaborador.area_depto}</p>
              </div>
            </div>
          )}
          {empresaNome && (
            <div className="flex items-center gap-3">
              <Building2 size={16} className="text-gray-500 shrink-0" />
              <div>
                <p className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Empresa</p>
                <p className="text-sm text-white">{empresaNome}</p>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* DISC preview — leva pro perfil comportamental completo */}
      {hasDISC && (
        <button onClick={() => router.push('/dashboard/perfil-comportamental')}
          className="block w-full text-left rounded-2xl border border-white/[0.06] p-5 transition-all hover:border-cyan-400/40 hover:bg-white/[0.04]"
          style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-400 uppercase">Perfil Comportamental</p>
              <p className="text-base font-extrabold text-white mt-0.5">Perfil dominante: {colaborador.perfil_dominante}</p>
            </div>
            <ArrowRight size={18} className="text-cyan-400 shrink-0" />
          </div>
          <div className="space-y-1.5">
            {['D', 'I', 'S', 'C'].map(d => {
              const key = `${d.toLowerCase()}_natural`;
              const value = colaborador[key] || 0;
              return (
                <div key={d} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 w-3">{d}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${value}%`, background: DISC_COLOR[d] }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-8 text-right">{value}%</span>
                </div>
              );
            })}
          </div>
        </button>
      )}

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-400/20 hover:border-red-400/40 transition-all"
        style={{ background: 'rgba(239,68,68,0.06)' }}>
        <LogOut size={16} />
        Sair da conta
      </button>
    </PageContainer>
  );
}
