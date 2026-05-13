'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Building2, Users, ClipboardCheck, Database, BookOpen,
  Plus, Loader2, RefreshCw, Zap, BookMarked, ShieldCheck, ChevronRight,
  Trash2, Video, GraduationCap as GradIcon, BarChart2, FileText, Shield,
  Calculator, LayoutDashboard, Bell, Search, Settings, LogOut, Brain,
  Activity, CheckCircle2, Filter, Globe, Vote, Sparkles, TrendingUp,
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
// Cada item declara em que contexto aparece:
//   showWhenAll      → quando "Todas as empresas" está selecionado (admin-wide)
//   showWhenEmpresa  → quando uma empresa específica está selecionada (tenant-aware)
// Default: ambos true.
//
// `hrefFn(empresaId)` constrói a URL — recebe o ID quando há empresa selecionada,
// undefined quando "Todas".
type NavItem = {
  key: string;
  label: string;
  sub: string;
  icon: any;
  hrefFn: (empresaId?: string) => string;
  showWhenAll?: boolean;
  showWhenEmpresa?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  // Sempre visíveis
  { key: 'dashboard',  label: 'Dashboard',      sub: 'Visão geral',           icon: LayoutDashboard, hrefFn: () => '/admin/dashboard' },
  { key: 'empresas',   label: 'Empresas',       sub: 'Tenants e pipeline',    icon: Building2,       hrefFn: (id) => id ? `/admin/empresas/${id}` : '/admin/empresas/gerenciar' },

  // Tenant-aware (mostra "Todas" → admin global / com empresa → pipeline daquela)
  { key: 'pipeline',         label: 'Pipeline da empresa', sub: 'Fase 0 → Fase 5',           icon: Activity,        hrefFn: (id) => `/admin/empresas/${id}`,                       showWhenAll: false },
  { key: 'votacao',          label: 'Votação',             sub: 'Top 5 por colaboradores',   icon: Vote,            hrefFn: (id) => `/admin/empresas/${id}/votacao`,               showWhenAll: false },
  { key: 'perfis-disc',      label: 'Perfis Comportamentais', sub: 'DISC dos colabs',         icon: Brain,           hrefFn: (id) => `/admin/empresas/${id}/perfis-comportamentais`, showWhenAll: false },
  { key: 'simulador',        label: 'Simulador',           sub: 'Teste de fluxo',            icon: Zap,             hrefFn: () => '/admin/simulador',                              showWhenAll: false },
  { key: 'evidencias',       label: 'Evidências',          sub: 'Sessões socráticas',        icon: FileText,        hrefFn: (id) => `/admin/vertho/evidencias?empresa=${id}`,       showWhenAll: false },
  { key: 'acumulada',        label: 'Av. Acumulada',       sub: 'Auditoria sem 13',          icon: ClipboardCheck,  hrefFn: (id) => `/admin/vertho/avaliacao-acumulada?empresa=${id}`, showWhenAll: false },
  { key: 'sem14',            label: 'Sem 14',              sub: 'Auditoria final',           icon: ShieldCheck,     hrefFn: (id) => `/admin/vertho/auditoria-sem14?empresa=${id}`,  showWhenAll: false },

  // Sempre visíveis (admin operacional)
  { key: 'competencias',     label: 'Competências',        sub: 'Base e por cargo',           icon: BookMarked,     hrefFn: (id) => id ? `/admin/competencias?empresa=${id}` : '/admin/competencias' },
  { key: 'conteudos',        label: 'Conteúdos',           sub: 'Banco de aprendizagem',      icon: BookOpen,       hrefFn: (id) => id ? `/admin/conteudos?empresa=${id}` : '/admin/conteudos' },
  { key: 'videos',           label: 'Vídeos',              sub: 'Biblioteca Bunny',           icon: Video,          hrefFn: (id) => id ? `/admin/videos?empresa=${id}` : '/admin/videos' },
  { key: 'knowledge-base',   label: 'Knowledge Base',      sub: 'RAG per-tenant',             icon: Database,       hrefFn: (id) => id ? `/admin/vertho/knowledge-base?empresa=${id}` : '/admin/vertho/knowledge-base' },
  { key: 'preferencias',     label: 'Preferências',        sub: 'Aprendizagem',               icon: GradIcon,       hrefFn: () => '/admin/preferencias-aprendizagem' },

  // Admin-wide (só "Todas")
  { key: 'radar',            label: 'Radar (Ingestão)',    sub: 'Saeb / ICA / Censo',         icon: BarChart2,      hrefFn: () => '/admin/radar',                              showWhenEmpresa: false },
  { key: 'qualidade-dados',  label: 'Qualidade Dados',     sub: 'Radar quality',              icon: Database,       hrefFn: () => '/admin/radar/qualidade-dados',              showWhenEmpresa: false },
  { key: 'custo-ia',         label: 'Custo IA',            sub: 'Catálogo de chamadas',       icon: BarChart2,      hrefFn: () => '/admin/vertho/simulador-custo' },
  { key: 'orcamento',        label: 'Orçamento',           sub: 'Custo / Tabela / Final',     icon: Calculator,     hrefFn: () => '/admin/vertho/orcamento' },
  { key: 'mercado',          label: 'Mercado Potencial',   sub: 'Municípios · Redes · Escolas', icon: TrendingUp,   hrefFn: () => '/admin/vertho/mercado-potencial',          showWhenEmpresa: false },
  { key: 'admins',           label: 'Admins',              sub: 'Platform admins',            icon: Shield,         hrefFn: () => '/admin/platform-admins',                    showWhenEmpresa: false },
  { key: 'lixeira',          label: 'Lixeira',             sub: 'Registros excluídos',        icon: Trash2,         hrefFn: () => '/admin/lixeira',                            showWhenEmpresa: false },
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
  const [empresaFiltro, setEmpresaFiltroState] = useState<string>('all'); // 'all' | empresaId

  // Carrega filtro do localStorage no mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vertho-admin-filter-empresa');
      if (saved) setEmpresaFiltroState(saved);
    } catch {}
  }, []);

  // Wrapper persiste no localStorage
  function setEmpresaFiltro(id: string) {
    setEmpresaFiltroState(id);
    try { localStorage.setItem('vertho-admin-filter-empresa', id); } catch {}
  }

  // Se a empresa salva não existe mais (foi deletada), volta pra 'all'
  useEffect(() => {
    if (!data || empresaFiltro === 'all') return;
    const exists = data.empresas.some((e: any) => e.id === empresaFiltro);
    if (!exists) setEmpresaFiltro('all');
  }, [data, empresaFiltro]);

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

  const empresaSelecionada = empresaFiltro === 'all' ? null : empresas.find((e: any) => e.id === empresaFiltro);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (empresaSelecionada) return item.showWhenEmpresa !== false;
    return item.showWhenAll !== false;
  });

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

        {/* Contexto de filtro (visível apenas quando alguma empresa está selecionada) */}
        {!collapsed && empresaSelecionada && (
          <div className="px-3 pt-3 pb-1">
            <div className="rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
              <span style={{ ...serif, fontSize: 16, color: '#34c5cc' }}>{empresaGlyph(empresaSelecionada.nome)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[9px] uppercase tracking-widest" style={{ color: 'rgba(52,197,204,.7)', letterSpacing: '.18em' }}>Contexto</p>
                <p className="text-xs font-bold text-white truncate">{empresaSelecionada.nome}</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = item.key === 'dashboard';
            const href = item.hrefFn(empresaSelecionada?.id);
            return (
              <button
                key={item.key}
                onClick={() => router.push(href)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                title={collapsed ? item.label : undefined}
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
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 style={{ ...serif, fontSize: 28, color: '#fff', lineHeight: 1 }}>
              Painel <em style={{ color: '#34c5cc' }}>Admin</em>
            </h1>
            <span className="hidden sm:inline shrink-0" style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,.4)', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EmpresaFilter
              empresas={empresas}
              value={empresaFiltro}
              onChange={setEmpresaFiltro}
            />
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
                          onClick={() => setEmpresaFiltro(emp.id)}
                          className="w-full text-left group"
                          title={`Filtrar painel pela empresa ${emp.nome}`}
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
                <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>
                  {empresaSelecionada ? `Contextual à empresa ${empresaSelecionada.nome}` : 'Tarefas administrativas globais'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                  {empresaSelecionada ? (
                    <>
                      <QuickAction onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}`)} icon={<Activity size={16} />} accent="#34c5cc"
                        title="Pipeline" desc={`Fase 0 → 5 de ${empresaSelecionada.nome}`} />
                      <QuickAction onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}/votacao`)} icon={<Vote size={16} />} accent="#9e4edd"
                        title="Votação" desc="Resultados por cargo" />
                      <QuickAction onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}/perfis-comportamentais`)} icon={<Brain size={16} />} accent="#f4b740"
                        title="Perfis DISC" desc="Mapeamentos completos" />
                      <QuickAction onClick={() => router.push('/admin/simulador')} icon={<Zap size={16} />} accent="#2ecc71"
                        title="Rodar simulador" desc="Testar fluxo conversacional" />
                    </>
                  ) : (
                    <>
                      <QuickAction onClick={() => router.push('/admin/empresas/nova')} icon={<Plus size={16} />} accent="#34c5cc"
                        title="Nova empresa" desc="Criar e onboarding de tenant" />
                      <QuickAction onClick={() => router.push('/admin/radar')} icon={<BarChart2 size={16} />} accent="#9e4edd"
                        title="Radar (Ingestão)" desc="Subir dados Saeb/ICA/Censo" />
                      <QuickAction onClick={() => router.push('/admin/vertho/orcamento')} icon={<Calculator size={16} />} accent="#f4b740"
                        title="Orçamento" desc="Custo IA, tabela, valor final" />
                      <QuickAction onClick={() => router.push('/admin/vertho/knowledge-base')} icon={<Brain size={16} />} accent="#2ecc71"
                        title="Knowledge Base" desc="RAG per-tenant" />
                    </>
                  )}
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

function EmpresaFilter({ empresas, value, onChange }: { empresas: any[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Calcula posição do dropdown baseado no trigger (e reajusta em scroll/resize)
  useEffect(() => {
    if (!open) return;
    function updateCoords() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    updateCoords();
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [open]);

  // Click outside fecha
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e: any) => (e.nome || '').toLowerCase().includes(q));
  }, [empresas, search]);

  const empresaAtual = empresas.find((e: any) => e.id === value);
  const label = empresaAtual?.nome || 'Todas as empresas';
  const isAll = value === 'all';

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all"
        style={{
          background: isAll ? 'rgba(255,255,255,.04)' : 'rgba(52,197,204,.1)',
          border: `1px solid ${isAll ? 'rgba(255,255,255,.1)' : 'rgba(52,197,204,.3)'}`,
          color: isAll ? 'rgba(255,255,255,.85)' : '#34c5cc',
          minWidth: 200,
        }}
      >
        {isAll ? <Globe size={13} /> : <Filter size={13} />}
        <span className="flex-1 text-left truncate font-bold">{label}</span>
        <ChevronRight size={13} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          className="rounded-xl shadow-2xl"
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            width: 280,
            zIndex: 1000,
            background: 'rgba(9,29,56,.98)',
            border: '1px solid rgba(255,255,255,.1)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="p-2" style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,.4)' }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empresa…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none"
                style={{ background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)', color: '#fff' }}
              />
            </div>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-1">
            <button
              onClick={() => { onChange('all'); setOpen(false); setSearch(''); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5"
              style={{ color: isAll ? '#34c5cc' : 'rgba(255,255,255,.85)' }}
            >
              <Globe size={14} />
              <span className="flex-1 font-bold">Todas as empresas</span>
              {isAll && <CheckCircle2 size={13} />}
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-center" style={{ color: 'rgba(255,255,255,.4)' }}>Nenhuma empresa encontrada.</p>
            ) : (
              filtered.map((emp: any) => {
                const selected = emp.id === value;
                return (
                  <button
                    key={emp.id}
                    onClick={() => { onChange(emp.id); setOpen(false); setSearch(''); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-white/5"
                    style={{ color: selected ? '#34c5cc' : 'rgba(255,255,255,.85)' }}
                  >
                    <span style={{ ...serif, fontSize: 14, color: selected ? '#34c5cc' : 'rgba(255,255,255,.55)' }}>
                      {empresaGlyph(emp.nome)}
                    </span>
                    <span className="flex-1 truncate">{emp.nome}</span>
                    <span style={{ ...mono, fontSize: 9, color: 'rgba(255,255,255,.4)' }}>{fmt(emp.totalColab)}</span>
                    {selected && <CheckCircle2 size={13} />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

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
