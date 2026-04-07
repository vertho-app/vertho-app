'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, User, Mail, Briefcase, Building2, LogOut, Shield } from 'lucide-react';
import { loadPerfil } from './perfil-actions';

const ROLE_LABELS = {
  colaborador: { label: 'Colaborador', color: '#6B7280' },
  gestor: { label: 'Gestor', color: '#F59E0B' },
  rh: { label: 'RH', color: '#00B4D8' },
};

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
      if (result.error) { setError(result.error); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador, empresaNome } = data;
  const role = ROLE_LABELS[colaborador.role] || ROLE_LABELS.colaborador;
  const hasDISC = colaborador.perfil_dominante && (colaborador.d_natural || colaborador.i_natural || colaborador.s_natural || colaborador.c_natural);

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: 'rgba(0, 180, 216, 0.12)' }}>
          <User size={32} className="text-cyan-400" />
        </div>
        <h1 className="text-xl font-bold text-white">{colaborador.nome_completo}</h1>
        <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
          style={{ color: role.color, background: role.color + '15' }}>
          <Shield size={10} className="inline mr-1" style={{ marginTop: '-1px' }} />
          {role.label}
        </span>
      </div>

      {/* Info card */}
      <div className="rounded-xl p-4 border border-white/[0.06] space-y-3" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center gap-3">
          <Mail size={16} className="text-gray-500 shrink-0" />
          <div>
            <p className="text-[10px] text-gray-500">Email</p>
            <p className="text-sm text-white">{colaborador.email}</p>
          </div>
        </div>
        {colaborador.cargo && (
          <div className="flex items-center gap-3">
            <Briefcase size={16} className="text-gray-500 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500">Cargo</p>
              <p className="text-sm text-white">{colaborador.cargo}</p>
            </div>
          </div>
        )}
        {colaborador.area_depto && (
          <div className="flex items-center gap-3">
            <Building2 size={16} className="text-gray-500 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500">Area / Departamento</p>
              <p className="text-sm text-white">{colaborador.area_depto}</p>
            </div>
          </div>
        )}
        {empresaNome && (
          <div className="flex items-center gap-3">
            <Building2 size={16} className="text-gray-500 shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500">Empresa</p>
              <p className="text-sm text-white">{empresaNome}</p>
            </div>
          </div>
        )}
      </div>

      {/* DISC profile preview */}
      {hasDISC && (
        <button onClick={() => router.push('/dashboard/perfil-cis')}
          className="w-full rounded-xl p-4 border border-white/[0.06] text-left hover:border-white/[0.15] transition-all"
          style={{ background: '#0F2A4A' }}>
          <p className="text-sm font-bold text-white mb-2">Perfil Comportamental</p>
          <div className="space-y-1.5">
            {[
              { label: 'D', value: colaborador.d_natural, color: '#EF4444' },
              { label: 'I', value: colaborador.i_natural, color: '#F59E0B' },
              { label: 'S', value: colaborador.s_natural, color: '#10B981' },
              { label: 'C', value: colaborador.c_natural, color: '#3B82F6' },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 w-3">{d.label}</span>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
                  <div className="h-full rounded-full" style={{ width: `${d.value || 0}%`, background: d.color }} />
                </div>
                <span className="text-[10px] text-gray-500 w-8 text-right">{d.value || 0}%</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-cyan-400 mt-2">Perfil dominante: {colaborador.perfil_dominante}</p>
        </button>
      )}

      {/* Logout */}
      <button onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-red-400 border border-red-400/20 hover:border-red-400/40 transition-all"
        style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
        <LogOut size={16} />
        Sair da conta
      </button>
    </div>
  );
}
