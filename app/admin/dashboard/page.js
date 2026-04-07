'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, ClipboardCheck, Target, Database, BookOpen, GraduationCap,
  Plus, Loader2, ChevronRight, RefreshCw, Zap, BookMarked
} from 'lucide-react';
import { loadAdminDashboard } from './actions';

function fmt(n) { return (n ?? 0).toLocaleString('pt-BR'); }

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  async function load() {
    const r = await loadAdminDashboard();
    setData(r);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  function handleRefresh() {
    setRefreshing(true);
    load();
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  const { empresas, totalColabs, totalAvaliacoes, totalPDIs, totalCenarios, totalTrilhas, totalCapacitacao, health } = data;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* ═══ Header ═══ */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: '28px' }} className="shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white">Painel Admin</h1>
            <p className="text-xs text-gray-500">Visao global de todas as empresas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/admin/competencias')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-cyan-400/30 hover:text-cyan-400 transition-all">
            <BookMarked size={14} /> Competencias
          </button>
          <button onClick={() => router.push('/admin/simulador')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-white/10 text-gray-300 hover:border-amber-400/30 hover:text-amber-400 transition-all">
            <Zap size={14} /> Simulador
          </button>
          <button onClick={() => router.push('/admin/empresas/nova')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white border border-green-400/30 hover:bg-green-400/10 transition-all">
            <Plus size={14} /> Nova Empresa
          </button>
          <button onClick={handleRefresh} disabled={refreshing}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ KPIs Row 1 ═══ */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Empresas', value: empresas.length, icon: Building2, color: '#06B6D4' },
          { label: 'Colaboradores', value: totalColabs, icon: Users, color: '#22C55E' },
          { label: 'Avaliacoes', value: totalAvaliacoes, icon: ClipboardCheck, color: '#F59E0B' },
          { label: 'PDIs Ativos', value: totalPDIs, icon: Target, color: '#A78BFA' },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl px-4 py-3 border border-white/[0.06] flex items-center gap-3" style={{ background: '#0F2A4A' }}>
              <Icon size={20} style={{ color: kpi.color }} className="shrink-0" />
              <div>
                <p className="text-2xl font-bold text-white leading-tight">{fmt(kpi.value)}</p>
                <p className="text-xs text-gray-500">{kpi.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ KPIs Row 2 ═══ */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'CENARIOS', value: totalCenarios },
          { label: 'TRILHAS', value: totalTrilhas },
          { label: 'CAPACITACAO', value: totalCapacitacao },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
            <p className="text-2xl font-bold text-white">{fmt(kpi.value)}</p>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ═══ Content: Empresas + System Health ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Lista de Empresas */}
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Building2 size={16} className="text-cyan-400" />
            <span className="text-sm font-bold text-white">Empresas ({empresas.length})</span>
          </div>
          <div className="divide-y divide-white/[0.03]">
            {empresas.map(emp => (
              <button key={emp.id} onClick={() => router.push(`/admin/empresas/${emp.id}`)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-400/10 shrink-0">
                  <Building2 size={18} className="text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{emp.nome}</p>
                  <p className="text-[11px] text-gray-500">Clique para ver o pipeline completo</p>
                </div>
                <ChevronRight size={16} className="text-gray-600 shrink-0" />
              </button>
            ))}
            {empresas.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-500">Nenhuma empresa cadastrada</p>
              </div>
            )}
          </div>
        </div>

        {/* System Health */}
        <div className="rounded-xl border border-white/[0.06] overflow-hidden self-start" style={{ background: '#0F2A4A' }}>
          <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <Zap size={16} className="text-amber-400" />
            <span className="text-sm font-bold text-white">System Health</span>
          </div>
          <div className="p-5">
            {/* Supabase status */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
                <span className="text-sm font-semibold text-white">Supabase</span>
              </div>
              <span className="text-xs font-bold text-green-400">Conectado</span>
            </div>

            {/* Tables */}
            <div className="space-y-2.5">
              {Object.entries(health).map(([table, status]) => (
                <div key={table} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === 'OK' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                    <span className="text-xs text-gray-400">{table}</span>
                  </div>
                  <span className={`text-xs font-bold ${status === 'OK' ? 'text-green-400' : 'text-red-400'}`}>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
