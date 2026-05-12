'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, ClipboardCheck, Target, Database, BookOpen, GraduationCap,
  Plus, Loader2, RefreshCw, Zap, BookMarked, ShieldCheck, ChevronRight,
  Trash2, Video, GraduationCap as GradIcon, BarChart2, FileText, Shield,
  Calculator, LayoutDashboard, Bell, Search, Settings, LogOut, Brain,
  Activity, CheckCircle2,
} from 'lucide-react';
import { loadAdminDashboard } from './actions';

function fmt(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('pt-BR');
}

const serif: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
};

// ── nav items (sidebar) ─────────────────────────────────────────────────────
const NAV_ITEMS = [
  { label: 'Dashboard',      sub: 'Visão geral',            href: '/admin/dashboard',                  icon: LayoutDashboard },
  { label: 'Empresas',       sub: 'Tenants e pipeline',      href: '/admin/empresas/gerenciar',         icon: Building2 },
  { label: 'Competências',   sub: 'Base e por cargo',        href: '/admin/competencias',               icon: BookMarked },
  { label: 'Conteúdos',      sub: 'Banco de aprendizagem',   href: '/admin/conteudos',                  icon: BookOpen },
  { label: 'Vídeos',         sub: 'Biblioteca Bunny',        href: '/admin/videos',                     icon: Video },
  { label: 'Radar (Ingestão)', sub: 'Saeb / ICA / Censo',    href: '/admin/radar',                      icon: BarChart2 },
  { label: 'Qualidade Dados', sub: 'Radar quality',         href: '/admin/radar/qualidade-dados',      icon: Database },
  { label: 'Simulador',      sub: 'Teste de fluxo',          href: '/admin/simulador',                  icon: Zap },
  { label: 'Custo IA',       sub: 'Catálogo de chamadas',    href: '/admin/vertho/simulador-custo',     icon: BarChart2 },
  { label: 'Orçamento',      sub: 'Custo / Tabela / Final',  href: '/admin/vertho/orcamento',           icon: Calculator },
  { label: 'Evidências',     sub: 'Sessões socráticas',      href: '/admin/vertho/evidencias',          icon: FileText },
  { label: 'Av. Acumulada',  sub: 'Auditoria sem 13',        href: '/admin/vertho/avaliacao-acumulada', icon: ClipboardCheck },
  { label: 'Sem 14',         sub: 'Auditoria final',         href: '/admin/vertho/auditoria-sem14',     icon: ShieldCheck },
  { label: 'Knowledge Base', sub: 'RAG per-tenant',          href: '/admin/vertho/knowledge-base',      icon: Database },
  { label: 'Preferências',   sub: 'Aprendizagem',            href: '/admin/preferencias-aprendizagem',  icon: GradIcon },
  { label: 'Admins',         sub: 'Platform admins',         href: '/admin/platform-admins',            icon: Shield },
  { label: 'Lixeira',        sub: 'Registros excluídos',     href: '/admin/lixeira',                    icon: Trash2 },
];

function empresaGlyph(nome: string) {
  return (nome || '?').trim()[0]?.toUpperCase() ?? '?';
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function load() {
    const r = await loadAdminDashboard();
    setData(r);
    setLoading(false);
    setRefreshing(false);
  }
  useEffect(() => { load(); }, []);

  function handleRefresh() { setRefreshing(true); load(); }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh" style={{ background: '#06172c' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#34c5cc' }} />
      </div>
    );
  }

  const { empresas, totalColabs, totalAvaliacoes, totalPDIs, health } = data;
  const allHealthOk = Object.values(health).every((v) => v === 'OK');

  // Top 5 empresas por engagement (proxy: nº de colaboradores)
  const top5 = [...empresas]
    .sort((a: any, b: any) => (b.totalColab || 0) - (a.totalColab || 0))
    .slice(0, 5);
  const maxColab = top5[0]?.totalColab || 1;

  return (
    <div
      className="min-h-dvh flex"
      style={{
        background:
          'radial-gradient(1100px 500px at 90% -5%, rgba(52,197,204,.07), transparent 55%), ' +
          'radial-gradient(900px 500px at -5% 30%, rgba(158,78,221,.1), transparent 60%), ' +
          'linear-gradient(180deg, #06172c 0%, #091d35 50%, #0a1f3a 100%)',
        color: '#d7e3ff',
      }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-64'} shrink-0 flex flex-col transition-all duration-200 hidden md:flex`}
        style={{
          background: 'rgba(7,27,56,.65)',
          backdropFilter: 'blur(12px)',
          borderRight: '1px solid rgba(255,255,255,.06)',
        }}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.95 }} />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,.4)', letterSpacing: '.2em' }}>Painel</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 transition-colors shrink-0"
            style={{ color: 'rgba(255,255,255,.4)' }}
            title={collapsed ? 'Expandir' : 'Recolher'}
          >
            <ChevronRight size={14} className={collapsed ? '' : 'rotate-180'} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === '/admin/dashboard';
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                style={{
                  background: active ? 'rgba(52,197,204,.12)' : 'transparent',
                  border: active ? '1px solid rgba(52,197,204,.25)' : '1px solid transparent',
                  color: active ? '#34c5cc' : 'rgba(255,255,255,.7)',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.04)';
                    (e.currentTarget as HTMLElement).style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,.7)';
                  }
                }}
              >
                <Icon size={16} className="shrink-0" />
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{item.label}</p>
                    <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.4)' }}>{item.sub}</p>
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,.05)' }}>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,.55)' }}
              onClick={() => router.push('/login')}
            >
              <LogOut size={14} />
              <span>Sair</span>
            </button>
          </div>
        )}
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between gap-4 px-5 md:px-8 h-16 shrink-0"
          style={{ background: 'rgba(7,27,56,.45)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.05)' }}
        >
          <div className="flex items-baseline gap-3">
            <h1 style={{ ...serif, fontSize: 28, color: '#fff', lineHeight: 1 }}>
              Painel <em style={{ color: '#34c5cc' }}>Admin</em>
            </h1>
            <span className="hidden sm:inline" style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,.4)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,.4)' }} />
              <input
                placeholder="Buscar…"
                className="pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
                style={{
                  background: 'rgba(0,0,0,.22)',
                  border: '1px solid rgba(255,255,255,.08)',
                  color: '#fff',
                  width: 220,
                }}
              />
            </div>
            <button onClick={handleRefresh} disabled={refreshing} title="Atualizar"
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: 'rgba(255,255,255,.5)' }}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'rgba(255,255,255,.5)' }} title="Notificações">
              <Bell size={14} />
            </button>
            <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors" style={{ color: 'rgba(255,255,255,.5)' }} title="Configurações">
              <Settings size={14} />
            </button>
          </div>
        </header>

        {/* Canvas */}
        <main className="flex-1 overflow-y-auto p-5 md:p-8">
          <div className="max-w-[1280px] mx-auto space-y-5">
            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Empresas" value={empresas.length} sub={`${empresas.length} ativas`} accent="#34c5cc" icon={<Building2 size={14} />} />
              <KpiCard label="Colaboradores" value={totalColabs} accent="#2ecc71" icon={<Users size={14} />} />
              <KpiCard label="Avaliações" value={totalAvaliacoes} accent="#f4b740" icon={<CheckCircle2 size={14} />} />
              <KpiCard label="PDIs ativos" value={totalPDIs} accent="#9e4edd" icon={<ClipboardCheck size={14} />} />
            </div>

            {/* Atividade Recente (span 2) + Empresas Ativas (span 1) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel className="lg:col-span-2 flex flex-col min-h-[280px]">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity size={14} style={{ color: '#34c5cc' }} /> Atividade recente
                    </h2>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>Últimos 7 dias em todas as empresas</p>
                  </div>
                  <button
                    onClick={() => router.push('/admin/radar/funnel')}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:border-cyan-400 hover:text-cyan-300"
                    style={{ borderColor: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)' }}
                  >
                    Ver funil →
                  </button>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center opacity-50 gap-2 mt-4">
                  <BarChart2 size={32} style={{ color: 'rgba(255,255,255,.3)' }} />
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Sem atividade recente</p>
                </div>
              </Panel>

              <Panel className="flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <h2 className="text-sm font-bold text-white">Empresas ativas</h2>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>Top 5 por colaboradores</p>
                  </div>
                  <button
                    onClick={() => router.push('/admin/empresas/gerenciar')}
                    className="text-[10px] font-bold hover:text-cyan-300 transition-colors shrink-0"
                    style={{ color: 'rgba(255,255,255,.55)' }}
                  >
                    Ver todas →
                  </button>
                </div>
                {top5.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-70 py-4">
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>Nenhuma empresa cadastrada.</p>
                    <button
                      onClick={() => router.push('/admin/empresas/nova')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                      style={{ background: 'rgba(52,197,204,.12)', border: '1px solid rgba(52,197,204,.3)', color: '#34c5cc' }}
                    >
                      <Plus size={12} /> Nova
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 flex-1 mt-3">
                    {top5.map((emp: any, idx: number) => {
                      const pct = maxColab > 0 ? Math.round((emp.totalColab / maxColab) * 100) : 0;
                      const color = idx === 0 ? '#34c5cc' : idx === 1 ? '#9e4edd' : idx === 2 ? '#f4b740' : '#2ecc71';
                      return (
                        <button
                          key={emp.id}
                          onClick={() => router.push(`/admin/empresas/${emp.id}`)}
                          className="w-full text-left group"
                          title={`Abrir pipeline de ${emp.nome}`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-white truncate flex items-center gap-1.5">
                              <span style={{ ...serif, fontSize: 14, color }}>{empresaGlyph(emp.nome)}</span>
                              {emp.nome}
                            </span>
                            <span style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,.5)', letterSpacing: '.05em' }}>
                              {fmt(emp.totalColab)}
                            </span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(255,255,255,.06)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}55` }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </div>

            {/* System Health + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Panel className="flex flex-col">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck size={14} style={{ color: allHealthOk ? '#2ecc71' : '#f97354' }} />
                  Saúde do sistema
                </h2>
                <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>Conexões e tabelas</p>

                <div
                  className="rounded-lg p-3 flex items-center justify-between mb-3"
                  style={{ background: 'rgba(52,197,204,.05)', border: '1px solid rgba(52,197,204,.18)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34c5cc', boxShadow: '0 0 8px #34c5cc' }} />
                    <div>
                      <p className="text-sm font-bold text-white">Supabase</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.4)' }}>Database operacional</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                    style={{ background: 'rgba(52,197,204,.12)', color: '#34c5cc', border: '1px solid rgba(52,197,204,.3)' }}>
                    Conectado
                  </span>
                </div>

                <div className="space-y-1.5 flex-1">
                  {Object.entries(health).map(([table, status]: [string, any]) => (
                    <div key={table} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: status === 'OK' ? '#2ecc71' : '#f97354' }} />
                        <span style={{ ...mono, fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{table}</span>
                      </div>
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: status === 'OK' ? '#2ecc71' : '#f97354', letterSpacing: '.08em' }}>
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel className="lg:col-span-2 flex flex-col">
                <h2 className="text-sm font-bold text-white">Ações rápidas</h2>
                <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>Tarefas administrativas comuns</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  <QuickAction onClick={() => router.push('/admin/empresas/nova')} icon={<Plus size={16} />} accent="#34c5cc"
                    title="Nova empresa" desc="Criar e onboarding de tenant" />
                  <QuickAction onClick={() => router.push('/admin/simulador')} icon={<Zap size={16} />} accent="#9e4edd"
                    title="Rodar simulador" desc="Testar fluxo conversacional" />
                  <QuickAction onClick={() => router.push('/admin/vertho/orcamento')} icon={<Calculator size={16} />} accent="#f4b740"
                    title="Orçamento" desc="Custo IA, tabela, valor final" />
                  <QuickAction onClick={() => router.push('/admin/vertho/knowledge-base')} icon={<Brain size={16} />} accent="#2ecc71"
                    title="Knowledge Base" desc="RAG per-tenant" />
                </div>
              </Panel>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, icon }: { label: string; value: number; sub?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div
      className="relative rounded-xl p-4 overflow-hidden"
      style={{
        background: 'linear-gradient(140deg, rgba(255,255,255,.04), rgba(255,255,255,.01))',
        border: '1px solid rgba(255,255,255,.08)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,.55)' }}>{label}</span>
        <span style={{ color: 'rgba(255,255,255,.4)' }}>{icon}</span>
      </div>
      <div style={{ ...mono, fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-.02em' }}>
        {fmt(value)}
      </div>
      {sub && <p className="text-[10px] mt-1" style={{ color: accent }}>{sub}</p>}
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: accent, opacity: .6, boxShadow: `0 0 10px ${accent}` }} />
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{
        background: 'linear-gradient(140deg, rgba(255,255,255,.035), rgba(255,255,255,.01))',
        border: '1px solid rgba(255,255,255,.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {children}
    </div>
  );
}

function QuickAction({ onClick, icon, accent, title, desc }: { onClick: () => void; icon: React.ReactNode; accent: string; title: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all active:scale-[0.99]"
      style={{
        background: 'rgba(255,255,255,.025)',
        border: '1px solid rgba(255,255,255,.08)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = `${accent}10`;
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}55`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.025)';
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)';
      }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}15`, color: accent }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white truncate">{title}</p>
        <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,.5)' }}>{desc}</p>
      </div>
    </button>
  );
}
