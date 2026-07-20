'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Building2, Users, ClipboardCheck, Plus, Zap, ShieldCheck,
  BarChart2, Brain, Activity, CheckCircle2, Globe, Vote,
  TrendingUp, Target, Calculator, DollarSign,
} from 'lucide-react';
import { LoadingState, MetricCard, Surface } from '@/components/ui';
import { loadAdminDashboard } from './actions';
import { useAdminShell } from '../_shell/AdminShellContext';
import { empresaGlyph, fmtNum as fmt, serifStyle as serif, monoStyle as mono } from '../_shell/nav-items';

// ─────────────────────────────────────────────────────────────────────────────
// Apenas o CONTEÚDO do dashboard. A casca (sidebar + header + filtro de empresa +
// fundo navy) vive no AdminShell, montado em app/admin/layout.tsx e compartilhado
// por todas as telas admin. O filtro de empresa vem do contexto do shell.
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const t = useTranslations('AdminDashboard');
  const locale = useLocale();
  const router = useRouter();
  const { empresaFiltro, setEmpresaFiltro, registerRefresh } = useAdminShell();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await loadAdminDashboard();
    setData(r);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Liga o botão de refresh do header (shell) ao reload deste dashboard.
  useEffect(() => {
    registerRefresh(load);
    return () => registerRefresh(null);
  }, [registerRefresh]);

  if (loading) {
    return (
      <LoadingState title="Carregando dashboard" className="py-24" />
    );
  }

  const { empresas, totalColabs, totalAvaliacoes, totalPDIs, health } = data;
  const allHealthOk = Object.values(health).every((v) => v === 'OK');

  const empresaSelecionada = empresaFiltro === 'all' ? null : empresas.find((e: any) => e.id === empresaFiltro);

  // Top 5 empresas por engagement (proxy: nº de colaboradores)
  const top5 = [...empresas]
    .sort((a: any, b: any) => (b.totalColab || 0) - (a.totalColab || 0))
    .slice(0, 5);
  const maxColab = top5[0]?.totalColab || 1;

  return (
    <div className="p-5 md:p-8">
      <div className="max-w-[1280px] mx-auto space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label={t('kpis.companies')} value={fmt(empresas.length, locale)} helper={t('kpis.activeCompanies', { count: empresas.length })} accent="#34c5cc" icon={<Building2 size={14} />} />
          <MetricCard label={t('kpis.collaborators')} value={fmt(totalColabs, locale)} accent="#2ecc71" icon={<Users size={14} />} />
          <MetricCard label={t('kpis.assessments')} value={fmt(totalAvaliacoes, locale)} accent="#f4b740" icon={<CheckCircle2 size={14} />} />
          <MetricCard label={t('kpis.activePdis')} value={fmt(totalPDIs, locale)} accent="#9e4edd" icon={<ClipboardCheck size={14} />} />
        </div>

        {/* Atividade Recente (span 2) + Empresas Ativas (span 1) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Panel className="lg:col-span-2 flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity size={14} style={{ color: '#34c5cc' }} /> Atividade recente
                </h2>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>{t('activity.subtitle')}</p>
              </div>
              <button
                onClick={() => router.push('/admin/radar/funnel')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:border-cyan-400 hover:text-cyan-300"
                style={{ borderColor: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.6)' }}
              >
                {t('activity.viewFunnel')}
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center opacity-50 gap-2 mt-4">
              <BarChart2 size={32} style={{ color: 'rgba(255,255,255,.3)' }} />
              <p className="text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>{t('activity.empty')}</p>
            </div>
          </Panel>

          <Panel className="flex flex-col">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <h2 className="text-sm font-bold text-white">{t('companies.title')}</h2>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,.4)' }}>{t('companies.subtitle')}</p>
              </div>
              <button
                onClick={() => router.push('/admin/empresas/gerenciar')}
                className="text-[10px] font-bold hover:text-cyan-300 transition-colors shrink-0"
                style={{ color: 'rgba(255,255,255,.55)' }}
              >
                {t('companies.viewAll')}
              </button>
            </div>
            {top5.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-70 py-4">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,.5)' }}>{t('companies.empty')}</p>
                <button
                  onClick={() => router.push('/admin/empresas/nova')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  style={{ background: 'rgba(52,197,204,.12)', border: '1px solid rgba(52,197,204,.3)', color: '#34c5cc' }}
                >
                  <Plus size={12} /> {t('companies.new')}
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
                      title={t('companies.filterBy', { name: emp.nome })}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-white truncate flex items-center gap-1.5">
                          <span style={{ ...serif, fontSize: 14, color }}>{empresaGlyph(emp.nome)}</span>
                          {emp.nome}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: 'rgba(255,255,255,.5)', letterSpacing: '.05em' }}>
                          {fmt(emp.totalColab, locale)}
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
              {t('health.title')}
            </h2>
            <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>{t('health.subtitle')}</p>

            <div
              className="rounded-lg p-3 flex items-center justify-between mb-3"
              style={{ background: 'rgba(52,197,204,.05)', border: '1px solid rgba(52,197,204,.18)' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#34c5cc', boxShadow: '0 0 8px #34c5cc' }} />
                <div>
                  <p className="text-sm font-bold text-white">Supabase</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,.4)' }}>{t('health.databaseOperational')}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                style={{ background: 'rgba(52,197,204,.12)', color: '#34c5cc', border: '1px solid rgba(52,197,204,.3)' }}>
                {t('health.connected')}
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
            <h2 className="text-sm font-bold text-white">{t('quickActions.title')}</h2>
            <p className="text-[11px] mb-4" style={{ color: 'rgba(255,255,255,.4)' }}>
              {empresaSelecionada ? t('quickActions.companyContext', { name: empresaSelecionada.nome }) : t('quickActions.globalContext')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
              {empresaSelecionada ? (
                <>
                  <QuickAction onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}`)} icon={<Activity size={16} />} accent="#34c5cc"
                    title={t('quickActions.pipeline.title')} desc={t('quickActions.pipeline.descCompany', { name: empresaSelecionada.nome })} />
                  <QuickAction onClick={() => router.push(`/admin/cargos?empresa=${empresaSelecionada.id}&tab=votacao`)} icon={<Vote size={16} />} accent="#9e4edd"
                    title={t('quickActions.voting.title')} desc={t('quickActions.voting.desc')} />
                  <QuickAction onClick={() => router.push(`/admin/empresas/${empresaSelecionada.id}/perfis-comportamentais`)} icon={<Brain size={16} />} accent="#f4b740"
                    title={t('quickActions.disc.title')} desc={t('quickActions.disc.desc')} />
                  <QuickAction onClick={() => router.push('/admin/simulador')} icon={<Zap size={16} />} accent="#2ecc71"
                    title={t('quickActions.simulator.title')} desc={t('quickActions.simulator.desc')} />
                </>
              ) : (
                <>
                  <QuickAction onClick={() => router.push('/admin/empresas/nova')} icon={<Plus size={16} />} accent="#34c5cc"
                    title={t('quickActions.newCompany.title')} desc={t('quickActions.newCompany.desc')} />
                  <QuickAction onClick={() => router.push('/admin/vertho/mercado-potencial')} icon={<TrendingUp size={16} />} accent="#f97354"
                    title={t('quickActions.market.title')} desc={t('quickActions.market.desc')} />
                  <QuickAction onClick={() => router.push('/admin/vertho/radarempresas')} icon={<Target size={16} />} accent="#34c5cc"
                    title={t('quickActions.companyRadar.title')} desc={t('quickActions.companyRadar.desc')} />
                  <QuickAction onClick={() => router.push('/admin/vertho/mercado-potencial?tab=unificado')} icon={<Globe size={16} />} accent="#9e7bff"
                    title={t('quickActions.cityPotential.title')} desc={t('quickActions.cityPotential.desc')} />
                  <QuickAction onClick={() => router.push('/admin/radar')} icon={<BarChart2 size={16} />} accent="#9e4edd"
                    title={t('quickActions.radar.title')} desc={t('quickActions.radar.desc')} />
                  <QuickAction onClick={() => router.push('/admin/vertho/orcamento')} icon={<Calculator size={16} />} accent="#f4b740"
                    title={t('quickActions.budget.title')} desc={t('quickActions.budget.desc')} />
                  <QuickAction onClick={() => router.push('/admin/vertho/knowledge-base')} icon={<Brain size={16} />} accent="#2ecc71"
                    title={t('quickActions.knowledge.title')} desc={t('quickActions.knowledge.desc')} />
                  {/* Artefato-centro-de-controle do plano de custo IA (claude.ai, externo) */}
                  <QuickAction onClick={() => window.open('https://claude.ai/code/artifact/889943d5-3aca-42d2-acad-39346f9cc076', '_blank', 'noopener')} icon={<DollarSign size={16} />} accent="#38bdf8"
                    title={t('quickActions.costPlan.title')} desc={t('quickActions.costPlan.desc')} />
                </>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <Surface className={className}>
      {children}
    </Surface>
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
