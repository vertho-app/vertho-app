'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Building2, Users, Plus, Loader2, ArrowLeft } from 'lucide-react';

export default function AdminDashboard() {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('empresas')
        .select('id, nome, segmento, slug, created_at')
        .order('nome');

      if (data) {
        // Buscar contagem de colaboradores por empresa
        const enriched = await Promise.all(data.map(async emp => {
          const { count } = await supabase
            .from('colaboradores')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', emp.id);
          return { ...emp, totalColab: count || 0 };
        }));
        setEmpresas(enriched);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[700px] mx-auto px-4 py-6 sm:px-6" style={{ background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)', minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <img src="/logo-vertho.png" alt="Vertho" style={{ height: '26px' }} className="shrink-0" />
        <h1 className="text-lg font-bold text-white">Painel Admin</h1>
        <button onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Dashboard
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <Building2 size={20} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-bold text-white">{empresas.length}</p>
          <p className="text-xs text-gray-500">Empresas</p>
        </div>
        <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <Users size={20} className="text-cyan-400 mb-2" />
          <p className="text-2xl font-bold text-white">{empresas.reduce((s, e) => s + e.totalColab, 0)}</p>
          <p className="text-xs text-gray-500">Colaboradores</p>
        </div>
      </div>

      {/* Nova empresa */}
      <button onClick={() => router.push('/admin/empresas/nova')}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white mb-6"
        style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
        <Plus size={16} /> Nova Empresa
      </button>

      {/* Lista */}
      <div className="space-y-2">
        {empresas.map(emp => (
          <button key={emp.id} onClick={() => router.push(`/admin/empresas/${emp.id}`)}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] text-left hover:border-white/[0.15] transition-all"
            style={{ background: '#0F2A4A' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-400/10">
              <Building2 size={18} className="text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{emp.nome}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-gray-500">
                  {emp.segmento === 'educacao' ? 'Educacao' : emp.segmento === 'corporativo' ? 'Corporativo' : '—'}
                </span>
                <span className="text-[10px] text-gray-400">{emp.totalColab} colaboradores</span>
                {emp.slug && <span className="text-[10px] text-cyan-400/60">{emp.slug}.vertho.com.br</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
