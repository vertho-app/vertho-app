'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, ClipboardCheck, Target, Database, BookOpen, GraduationCap,
  Plus, Loader2, ChevronRight, RefreshCw, Zap, BookMarked, ShieldCheck
} from 'lucide-react';
import { loadAdminDashboard } from './actions';

function fmt(n) { return (n ?? 0).toLocaleString('pt-BR'); }

const HOVER_STYLES = {
  cyan: 'hover:border-cyan-400/30 hover:text-cyan-400',
  amber: 'hover:border-amber-400/30 hover:text-amber-400',
  purple: 'hover:border-purple-400/30 hover:text-purple-400',
};

function NavBtn({ onClick, icon: Icon, label, hover = 'cyan' }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-transparent text-gray-300 transition-all ${HOVER_STYLES[hover]}`}>
      <Icon size={14} /> {label}
    </button>
  );
}

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
        <div className="flex items-center gap-2 flex-wrap">
          {/* Grupo: Gestão de conteúdo */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-white/5">
            <NavBtn onClick={() => router.push('/admin/competencias')} icon={BookMarked} label="Competências" hover="cyan" />
            <NavBtn onClick={() => router.push('/admin/conteudos')} icon={BookMarked} label="Conteúdos" hover="cyan" />
            <NavBtn onClick={() => router.push('/admin/videos')} icon={BookMarked} label="Vídeos" hover="cyan" />
            <NavBtn onClick={() => router.push('/admin/preferencias-aprendizagem')} icon={GraduationCap} label="Preferências" hover="cyan" />
          </div>

          {/* Grupo: Sistema */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-white/5">
            <NavBtn onClick={() => router.push('/admin/simulador')} icon={Zap} label="Simulador" hover="amber" />
            <NavBtn onClick={() => router.push('/admin/vertho/simulador-custo')} icon={ShieldCheck} label="Custo IA" hover="purple" />
            <NavBtn onClick={() => router.push('/admin/vertho/evidencias')} icon={ShieldCheck} label="Evidências" hover="purple" />
            <NavBtn onClick={() => router.push('/admin/vertho/avaliacao-acumulada')} icon={ShieldCheck} label="Avaliação Acumulada" hover="purple" />
            <NavBtn onClick={() => router.push('/admin/vertho/auditoria-sem14')} icon={ShieldCheck} label="Auditoria Sem 14" hover="purple" />
            <NavBtn onClick={() => router.push('/admin/vertho/knowledge-base')} icon={ShieldCheck} label="Knowledge Base" hover="cyan" />
            <NavBtn onClick={() => router.push('/admin/platform-admins')} icon={ShieldCheck} label="Admins" hover="purple" />
            <NavBtn onClick={() => router.push('/admin/lixeira')} icon={ShieldCheck} label="Lixeira" hover="amber" />
          </div>

          {/* Ações */}
          <button onClick={() => router.push('/admin/empresas/nova')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 transition-all">
            <Plus size={14} /> Nova Empresa
          </button>
          <button onClick={handleRefresh} disabled={refreshing} title="Atualizar"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-500 hover:text-white transition-colors">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══ KPIs Unificados (7 em uma grade) ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {[
          { label: 'Empresas', value: empresas.length, icon: Building2, color: '#06B6D4' },
          { label: 'Colaboradores', value: totalColabs, icon: Users, color: '#22C55E' },
          { label: 'Avaliações', value: totalAvaliacoes, icon: ClipboardCheck, color: '#F59E0B' },
          { label: 'PDIs Ativos', value: totalPDIs, icon: Target, color: '#A78BFA' },
          { label: 'Cenários', value: totalCenarios, icon: Zap, color: '#EC4899' },
          { label: 'Trilhas', value: totalTrilhas, icon: BookMarked, color: '#14B8A6' },
          { label: 'Capacitação', value: totalCapacitacao, icon: GraduationCap, color: '#8B5CF6' },
        ].map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl px-4 py-3 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <Icon size={18} style={{ color: kpi.color }} />
              <p className="text-2xl font-bold text-white mt-2 leading-none">{fmt(kpi.value)}</p>
              <p className="text-[11px] text-gray-400 mt-1">{kpi.label}</p>
            </div>
          );
        })}
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
