'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft, ArrowRight, BarChart3, Brain, Building2, CalendarDays, Check,
  Download, Eye, FileChartColumn, FileText, Flag, Gauge, Layers, Lightbulb,
  Route, Search, ShieldAlert, Sparkles, Target, TrendingUp, UserRound, UsersRound,
} from 'lucide-react';
import { PageContainer, PageHero } from '@/components/page-shell';
import InAppPdfDocument from '@/components/pdf/in-app-pdf-document';
import type { RhReportDocument, RhReportKind, RhReportsCenter, RhReportsScope } from '@/lib/relatorios/rh-center';
import type { RhDescriptorScope } from '@/lib/relatorios/dashboard-insights';

type DashboardTab = 'overview' | 'roles' | 'priorities' | 'documents';
type DocumentSection = 'organization' | 'managers' | 'people';

const serifStyle = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic' as const,
  fontWeight: 400,
};

const DASHBOARD_TABS = [
  { key: 'overview', icon: Gauge },
  { key: 'roles', icon: UsersRound },
  { key: 'priorities', icon: Target },
  { key: 'documents', icon: FileText },
] as const;

const SECTION_ICONS = {
  organization: Building2,
  managers: UsersRound,
  people: UserRound,
} as const;

const DOCUMENT_ICONS: Record<RhReportKind, any> = {
  rh: FileChartColumn,
  perfil_org: UsersRound,
  dna: Sparkles,
  pulso_executivo: FileChartColumn,
  pulso_complementar_nr1: FileText,
  gestor: UsersRound,
  individual: UserRound,
};

const LEVEL_COLORS = ['#FB7185', '#FBBF24', '#22D3EE', '#34D399'];

function normalize(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatDate(value: string | null, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] border border-white/[0.08] ${className}`} style={{ background: 'linear-gradient(150deg, rgba(18,49,83,.92), rgba(7,24,42,.96))' }}>
      {children}
    </div>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[9px] font-bold uppercase tracking-[0.23em] text-[var(--brand-300,#67e8f9)]">{eyebrow}</p>
      <h2 className="mt-1 text-[26px] leading-none text-white" style={serifStyle}>{title}</h2>
      {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">{subtitle}</p>}
    </div>
  );
}

function DashboardNavigation({ active, onChange, t }: { active: DashboardTab; onChange: (tab: DashboardTab) => void; t: any }) {
  return (
    <nav aria-label={t('dashboard.navigation')} className="mb-7 overflow-x-auto pb-1 [scrollbar-width:none]">
      <div className="flex min-w-max gap-1 rounded-2xl border border-white/[0.08] bg-[#071829]/75 p-1.5">
        {DASHBOARD_TABS.map(({ key, icon: Icon }) => {
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-current={selected ? 'page' : undefined}
              className="flex h-10 items-center gap-2 rounded-xl px-4 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)]"
              style={{
                color: selected ? '#fff' : 'rgba(255,255,255,.42)',
                background: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 18%, #0b2138)' : 'transparent',
                boxShadow: selected ? 'inset 0 0 0 1px color-mix(in oklab, var(--brand-400, #22d3ee) 30%, transparent)' : 'none',
              }}
            >
              <Icon size={15} className={selected ? 'text-[var(--brand-300,#67e8f9)]' : ''} />
              {t(`dashboard.tabs.${key}`)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Filtro de turma (mig 210).
 *
 * Só aparece com 2+ turmas ativas: com uma turma o recorte é a empresa, e um
 * seletor de opção única seria ruído. O estado mora na URL: a página é montada
 * no servidor, então trocar de turma tem que refazer as consultas, e o RH
 * consegue mandar a leitura de uma turma por link.
 */
function ScopeFilter({ scope, t }: { scope: RhReportsScope; t: any }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  // Com uma turma só o recorte é a empresa e o seletor seria ruído. A exceção é
  // um link que já chega recortado (`?turma=`): aí a barra tem que aparecer, ou
  // a tela mostraria números de uma turma sem nada dizendo qual.
  if (scope.turmas.length < 2 && !scope.turmaId) return null;

  function selecionar(turmaId: string | null) {
    // O `?document=` sai junto: um PDF individual da turma anterior não
    // pertence ao novo recorte, e reabri-lo mostraria uma pessoa que a lista
    // filtrada nem lista.
    const destino = turmaId ? `${pathname}?turma=${encodeURIComponent(turmaId)}` : pathname;
    startTransition(() => router.replace(destino, { scroll: false }));
  }

  const opcoes = [{ id: null as string | null, nome: t('dashboard.scope.all'), membros: scope.pessoasEmpresa }]
    .concat(scope.turmas.map((turma) => ({ id: turma.id, nome: turma.nome, membros: turma.membros })));

  return (
    <section aria-label={t('dashboard.scope.eyebrow')} className={`mb-4 rounded-2xl border border-white/[0.08] bg-[#071829]/75 px-4 py-3 transition-opacity ${pending ? 'opacity-50' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex shrink-0 items-center gap-2 text-[9px] font-bold uppercase tracking-[0.23em] text-[var(--brand-300,#67e8f9)]">
          <Layers size={13} /> {t('dashboard.scope.eyebrow')}
        </p>
        <div className="flex flex-wrap gap-2">
          {opcoes.map((opcao) => {
            const selected = scope.turmaId === opcao.id;
            return (
              <button
                key={opcao.id || 'todas'}
                type="button"
                onClick={() => selecionar(opcao.id)}
                aria-pressed={selected}
                disabled={pending}
                className="flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)] disabled:cursor-wait"
                style={{
                  color: selected ? '#fff' : 'rgba(255,255,255,.45)',
                  borderColor: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 55%, transparent)' : 'rgba(255,255,255,.09)',
                  background: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 14%, transparent)' : 'transparent',
                }}
              >
                {opcao.nome}
                <span className="font-mono text-[9px] text-white/35">{t('dashboard.scope.people', { count: opcao.membros })}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Selo das seções que NÃO seguem o recorte.
 *
 * A narrativa executiva e as prioridades nascem do PDF consolidado da empresa:
 * recortá-las exigiria regerar o documento por turma. Sem este aviso o filtro
 * deixaria a tela pior do que era. Hoje o RH desconfia do número; com um
 * seletor no topo ele leria a análise dos 282 achando que fala dos 126.
 */
function CompanyScopeNotice({ scope, t }: { scope: RhReportsScope; t: any }) {
  if (!scope.insightScopeIsCompany) return null;
  return (
    <div className="mb-3 flex gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-xs leading-relaxed text-amber-100/65">
      <Building2 size={15} className="mt-0.5 shrink-0 text-amber-300" />
      <span>
        <strong className="mr-2 rounded-full border border-amber-300/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200">
          {t('dashboard.scope.companyBadge')}
        </strong>
        {t('dashboard.scope.companyNotice')}
      </span>
    </div>
  );
}

function JourneyPulse({ reports, t }: { reports: RhReportsCenter; t: any }) {
  const p = reports.dashboard.panorama;
  // `journey` é INSTANTÂNEO (trilhas ativas), como o título da seção promete:
  // "onde as pessoas estão agora". Quem conclui sai dele, e sem o degrau de
  // conclusão ao lado isso lê como perda de tração — o oposto do que aconteceu.
  // O número já era calculado e aparecia só num rodapé chamado "Encerradas".
  const stages = [
    { key: 'people', value: p.pessoas, icon: UserRound, color: '#8BE8EF' },
    { key: 'profile', value: p.comPerfil, icon: Brain, color: '#69D6E2' },
    { key: 'mapping', value: p.comMapeamento, icon: BarChart3, color: '#B77CFF' },
    { key: 'journey', value: p.emJornada, icon: Route, color: '#34D399' },
    { key: 'completed', value: p.jornadasEncerradas, icon: Check, color: '#F5C97B' },
  ] as const;

  return (
    <Panel className="relative overflow-hidden p-5 md:p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[var(--brand-400,#22d3ee)]/[0.09] blur-3xl" />
      <div className="relative flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.23em] text-[var(--brand-300,#67e8f9)]">{t('dashboard.pulse.eyebrow')}</p>
          <h2 className="mt-1 text-[27px] leading-none text-white" style={serifStyle}>{t('dashboard.pulse.title')}</h2>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-white/40">{t('dashboard.pulse.subtitle')}</p>
      </div>

      <div className="relative mt-6 grid gap-2 sm:grid-cols-4">
        <div className="pointer-events-none absolute left-[8%] right-[8%] top-[25px] hidden h-px bg-gradient-to-r from-cyan-300/30 via-violet-400/40 to-emerald-400/30 sm:block" />
        {stages.map(({ key, value, icon: Icon, color }, index) => {
          const percentage = p.pessoas > 0 ? Math.round((value / p.pessoas) * 100) : 0;
          return (
            <div key={key} className="relative rounded-[18px] border border-white/[0.07] bg-black/10 p-4">
              <div className="relative z-10 flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-full border bg-[#0b2138]" style={{ color, borderColor: `${color}55` }}><Icon size={17} /></span>
                <span className="font-mono text-[10px] text-white/35">{String(index + 1).padStart(2, '0')}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[30px] leading-none text-white tabular-nums" style={serifStyle}>{p.indisponivel ? '—' : value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-white/55">{t(`dashboard.pulse.${key}`)}</p>
                </div>
                {!p.indisponivel && <span className="font-mono text-[10px]" style={{ color }}>{percentage}%</span>}
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${p.indisponivel ? 0 : percentage}%`, background: color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Em dia e atrasada qualificam SÓ quem está em jornada agora: com a
          conclusão promovida a degrau, repetir o total de encerradas aqui
          embaixo daria dois lugares para o mesmo número. */}
      <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.055] px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-white/60"><Check size={14} className="text-emerald-300" /> {t('dashboard.pulse.onTrack')}</span>
          <strong className="text-lg text-emerald-300 tabular-nums">{p.indisponivel ? '—' : p.emDia}</strong>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-white/60"><ShieldAlert size={14} className="text-amber-300" /> {t('dashboard.pulse.behind')}</span>
          <strong className="text-lg text-amber-300 tabular-nums">{p.indisponivel ? '—' : p.atrasadas}</strong>
        </div>
      </div>
    </Panel>
  );
}

function ExecutiveReading({ reports, t }: { reports: RhReportsCenter; t: any }) {
  const insight = reports.dashboard.insight;
  if (!insight) {
    return (
      <Panel className="p-5 md:p-6">
        <FileChartColumn className="text-white/25" size={24} />
        <h2 className="mt-3 text-xl text-white" style={serifStyle}>{t('dashboard.unavailable.title')}</h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/40">{t('dashboard.unavailable.description')}</p>
      </Panel>
    );
  }

  return (
    <div>
      <CompanyScopeNotice scope={reports.scope} t={t} />
      <div className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
      <Panel className="relative overflow-hidden p-5 md:p-6">
        <span className="absolute right-5 top-4 text-[72px] leading-none text-[var(--brand-300,#67e8f9)]/[0.07]" style={serifStyle}>“</span>
        <p className="text-[9px] font-bold uppercase tracking-[0.23em] text-[var(--brand-300,#67e8f9)]">{t('dashboard.executive.eyebrow')}</p>
        <h2 className="mt-2 max-w-3xl text-[22px] leading-[1.25] text-white md:text-[26px]" style={serifStyle}>{insight.executive.reading || t('dashboard.executive.fallback')}</h2>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4">
            <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300"><TrendingUp size={13} /> {t('dashboard.executive.strength')}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/60">{insight.executive.strength || '—'}</p>
          </div>
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300"><ShieldAlert size={13} /> {t('dashboard.executive.risk')}</p>
            <p className="mt-2 text-xs leading-relaxed text-white/60">{insight.executive.risk || '—'}</p>
          </div>
        </div>
      </Panel>

      <Panel className="p-5 md:p-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.23em] text-white/40">{t('dashboard.levels.title')}</p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-[48px] leading-none text-white tabular-nums" style={serifStyle}>{insight.indicators.average ?? '—'}</span>
          <span className="text-xs text-white/35">{t('dashboard.levels.ofFour')}</span>
        </div>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white/[0.05]">
          {insight.indicators.levels.map(({ level, percentage }, index) => <div key={level} title={`N${level}: ${percentage}%`} style={{ width: `${percentage}%`, background: LEVEL_COLORS[index] }} />)}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {insight.indicators.levels.map(({ level, percentage }, index) => (
            <div key={level}><p className="font-mono text-[9px]" style={{ color: LEVEL_COLORS[index] }}>N{level}</p><p className="mt-0.5 text-sm font-bold text-white tabular-nums">{percentage}%</p></div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.07] pt-4">
          <div><p className="text-[10px] text-white/35">{t('dashboard.levels.evaluated')}</p><p className="mt-1 text-lg text-white">{insight.indicators.evaluated ?? '—'}</p></div>
          <div><p className="text-[10px] text-white/35">{t('dashboard.levels.assessments')}</p><p className="mt-1 text-lg text-white">{insight.indicators.assessments ?? '—'}</p></div>
        </div>
      </Panel>
      </div>
    </div>
  );
}

function OverviewTab({ reports, t }: { reports: RhReportsCenter; t: any }) {
  const comparison = reports.dashboard.insight?.comparison;
  const profile = reports.dashboard.insight?.organizationalProfile;
  return (
    <div className="space-y-4">
      <JourneyPulse reports={reports} t={t} />
      <ExecutiveReading reports={reports} t={t} />
      {(comparison?.analysis || profile?.description) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {comparison?.analysis && (
            <Panel className="p-5">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brand-300,#67e8f9)]"><BarChart3 size={13} /> {t('dashboard.comparison.title')}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{comparison.analysis}</p>
              <div className="mt-4 space-y-2">
                {comparison.positive && <p className="rounded-xl bg-emerald-400/[0.06] px-3 py-2 text-xs leading-relaxed text-emerald-100/75">+ {comparison.positive}</p>}
                {comparison.attention && <p className="rounded-xl bg-amber-300/[0.06] px-3 py-2 text-xs leading-relaxed text-amber-100/75">! {comparison.attention}</p>}
              </div>
            </Panel>
          )}
          {profile?.description && (
            <Panel className="p-5">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-300"><Brain size={13} /> {t('dashboard.profile.title')}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">{profile.description}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {profile.strength && <p className="text-xs leading-relaxed text-emerald-200/70"><strong className="block text-[9px] uppercase tracking-wider text-emerald-300">{t('dashboard.executive.strength')}</strong>{profile.strength}</p>}
                {profile.risk && <p className="text-xs leading-relaxed text-amber-100/70"><strong className="block text-[9px] uppercase tracking-wider text-amber-300">{t('dashboard.executive.risk')}</strong>{profile.risk}</p>}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function DescriptorAnalysis({
  scope,
  requestedRole,
  organizationFallback,
  turmaNome,
  t,
}: {
  scope: RhDescriptorScope | null;
  requestedRole: string;
  organizationFallback: boolean;
  /** Turma do recorte, quando há uma. Este bloco SEGUE o filtro. */
  turmaNome: string | null;
  t: any;
}) {
  const [selectedName, setSelectedName] = useState(scope?.competencies[0]?.competency || '');
  const competency = scope?.competencies.find((item) => item.competency === selectedName)
    || scope?.competencies[0];

  if (!scope || !competency) {
    return (
      <Panel className="border-dashed p-5 md:p-6">
        <BarChart3 size={22} className="text-white/20" />
        <h3 className="mt-3 text-xl text-white" style={serifStyle}>{t('dashboard.roles.descriptors.emptyTitle')}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/40">{t('dashboard.roles.descriptors.emptyDescription')}</p>
      </Panel>
    );
  }

  return (
    <section aria-labelledby="descriptor-analysis-title">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.23em] text-[var(--brand-300,#67e8f9)]">{t('dashboard.roles.descriptors.eyebrow')}</p>
          <h3 id="descriptor-analysis-title" className="mt-1 text-[26px] leading-none text-white" style={serifStyle}>{t('dashboard.roles.descriptors.title')}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">{t('dashboard.roles.descriptors.subtitle')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {turmaNome && (
            <span className="rounded-full border border-[var(--brand-400,#22d3ee)]/25 bg-[var(--brand-400,#22d3ee)]/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--brand-300,#67e8f9)]">
              {t('dashboard.scope.reading', { name: turmaNome })}
            </span>
          )}
          <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
            {organizationFallback
              ? t('dashboard.roles.descriptors.organizationScope', { count: scope.evaluated })
              : t('dashboard.roles.descriptors.roleScope', { count: scope.evaluated })}
          </span>
        </div>
      </div>

      {organizationFallback && (
        <div className="mb-3 flex gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] px-4 py-3 text-xs leading-relaxed text-amber-100/65">
          <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-300" />
          <span>{t('dashboard.roles.descriptors.organizationNotice', { role: requestedRole })}</span>
        </div>
      )}

      <div className="mb-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
        {scope.competencies.map((item) => {
          const selected = item.competency === competency.competency;
          return (
            <button
              key={item.competency}
              type="button"
              onClick={() => setSelectedName(item.competency)}
              aria-pressed={selected}
              className="shrink-0 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)]"
              style={{
                borderColor: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 48%, transparent)' : 'rgba(255,255,255,.08)',
                background: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 12%, rgba(8,26,46,.94))' : 'rgba(8,26,46,.72)',
              }}
            >
              <span className={`block max-w-[220px] truncate text-[11px] font-bold ${selected ? 'text-white' : 'text-white/50'}`}>{item.competency}</span>
              <span className="mt-1 block font-mono text-[9px] text-white/30">{t('dashboard.roles.descriptors.competencyAverage', { value: item.average.toFixed(2) })}</span>
            </button>
          );
        })}
      </div>

      <Panel className="overflow-hidden">
        <header className="relative overflow-hidden border-b border-white/[0.08] px-5 py-5 md:px-6">
          <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-[var(--brand-400,#22d3ee)]/[0.1] blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--brand-300,#67e8f9)]">{t('dashboard.roles.descriptors.competency')}</p>
                {competency.priority && <span className="rounded-full bg-rose-400/10 px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] text-rose-300">{t('dashboard.roles.descriptors.priority')}</span>}
              </div>
              <h4 className="mt-1 max-w-3xl text-[24px] leading-tight text-white" style={serifStyle}>{competency.competency}</h4>
            </div>
            <div className="flex items-baseline gap-2 sm:text-right">
              <span className="text-xs text-white/35">{t('dashboard.roles.descriptors.levelAverage')}</span>
              <strong className="text-[31px] font-normal leading-none text-white tabular-nums" style={serifStyle}>{competency.average.toFixed(2)}</strong>
              <span className="text-[10px] text-white/30">/ 4</span>
            </div>
          </div>
          <div className="relative mt-4 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
            {competency.levels.map(({ level, percentage }, index) => (
              <div key={level} title={`N${level}: ${percentage}%`} style={{ width: `${percentage}%`, background: LEVEL_COLORS[index] }} />
            ))}
          </div>
          <div className="relative mt-2 grid grid-cols-4 gap-2">
            {competency.levels.map(({ level, percentage }, index) => (
              <p key={level} className="font-mono text-[9px]" style={{ color: LEVEL_COLORS[index] }}>N{level} <strong>{percentage}%</strong></p>
            ))}
          </div>
        </header>

        <div className="space-y-2 p-4 md:hidden">
          {competency.descriptors.map((descriptor) => (
            <div key={descriptor.descriptor} className="rounded-2xl border border-white/[0.07] bg-black/10 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold leading-snug text-white/75">{descriptor.descriptor}</p>
                <span className="shrink-0 rounded-lg bg-white/[0.05] px-2 py-1 font-mono text-[9px] text-white/40">{descriptor.average.toFixed(2)}</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                {descriptor.levels.map(({ level, percentage }, index) => (
                  <div key={level} style={{ width: `${percentage}%`, background: LEVEL_COLORS[index] }} />
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {descriptor.levels.map(({ level, percentage }, index) => (
                  <p key={level} className="font-mono text-[9px]" style={{ color: LEVEL_COLORS[index] }}>N{level} {percentage}%</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-black/15">
              <tr className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/40">
                <th className="w-[48%] px-6 py-3">{t('dashboard.roles.descriptors.descriptor')}</th>
                {[1, 2, 3, 4].map((level, index) => (
                  <th key={level} className="px-3 py-3 text-center" style={{ color: LEVEL_COLORS[index] }}>{t(`dashboard.roles.descriptors.levels.n${level}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {competency.descriptors.map((descriptor) => (
                <tr key={descriptor.descriptor} className="border-t border-white/[0.07]">
                  <th scope="row" className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium leading-snug text-white/72">{descriptor.descriptor}</span>
                      <span className="shrink-0 font-mono text-[9px] text-white/28">{t('dashboard.roles.descriptors.rowAverage', { value: descriptor.average.toFixed(2) })}</span>
                    </div>
                  </th>
                  {descriptor.levels.map(({ level, percentage }, index) => (
                    <td key={level} className="border-l border-white/[0.05] px-3 py-4 text-center font-mono text-sm font-bold tabular-nums" style={{ color: LEVEL_COLORS[index], background: `${LEVEL_COLORS[index]}0D` }}>{percentage}%</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(competency.strength || competency.opportunity) && (
          <footer className="grid gap-2 border-t border-white/[0.08] bg-black/10 p-4 sm:grid-cols-2 md:px-6">
            {competency.strength && (
              <div className="rounded-xl border border-emerald-400/12 bg-emerald-400/[0.045] px-3 py-2.5 text-xs leading-relaxed text-emerald-100/70">
                <strong className="text-emerald-300">{t('dashboard.roles.descriptors.strength')}:</strong> {competency.strength.descriptor} — {t('dashboard.roles.descriptors.strengthValue', { percentage: competency.strength.percentage })}
              </div>
            )}
            {competency.opportunity && (
              <div className="rounded-xl border border-rose-400/12 bg-rose-400/[0.045] px-3 py-2.5 text-xs leading-relaxed text-rose-100/70">
                <strong className="text-rose-300">{t('dashboard.roles.descriptors.opportunity')}:</strong> {competency.opportunity.descriptor} — {t('dashboard.roles.descriptors.opportunityValue', { percentage: competency.opportunity.percentage })}
              </div>
            )}
          </footer>
        )}
      </Panel>
    </section>
  );
}

function RolesTab({ reports, t }: { reports: RhReportsCenter; t: any }) {
  const insight = reports.dashboard.insight;
  const [selectedRole, setSelectedRole] = useState(0);
  const role = insight?.roles[selectedRole];
  const focus = insight?.roleFocus.find((item) => normalize(item.role) === normalize(role?.role));
  const roleDescriptorScope = reports.dashboard.descriptorAnalysis?.roles.find(
    (item) => normalize(item.role) === normalize(role?.role),
  );
  const descriptorScope = roleDescriptorScope || reports.dashboard.descriptorAnalysis?.organization || null;
  if (!insight || insight.roles.length === 0) return <ExecutiveReading reports={reports} t={t} />;

  return (
    <div>
      <SectionTitle eyebrow={t('dashboard.roles.eyebrow')} title={t('dashboard.roles.title')} subtitle={t('dashboard.roles.subtitle')} />
      <CompanyScopeNotice scope={reports.scope} t={t} />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
        {insight.roles.map((item, index) => (
          <button key={`${item.role}-${index}`} type="button" onClick={() => setSelectedRole(index)} className="shrink-0 rounded-full border px-4 py-2 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)]" style={{ color: selectedRole === index ? '#fff' : 'rgba(255,255,255,.45)', borderColor: selectedRole === index ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 55%, transparent)' : 'rgba(255,255,255,.09)', background: selectedRole === index ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 14%, transparent)' : 'transparent' }}>
            {item.role}
          </button>
        ))}
      </div>

      {role && (
        <div className="space-y-7">
          <div className="grid gap-3 lg:grid-cols-[.75fr_1.25fr]">
            <Panel className="p-5 md:p-6">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">{t('dashboard.roles.average')}</p>
            <div className="mt-3 flex items-end gap-2"><span className="text-[54px] leading-none text-white" style={serifStyle}>{role.average?.toFixed(1) ?? '—'}</span><span className="pb-1 text-xs text-white/35">/ 4</span></div>
            <p className="mt-3 text-[10px] leading-relaxed text-white/32">{t('dashboard.roles.averageDescription')}</p>
            <div className="mt-4 grid grid-cols-4 gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div key={level} className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full" style={{ width: role.average && role.average >= level ? '100%' : role.average && role.average > level - 1 ? `${(role.average - (level - 1)) * 100}%` : '0%', background: LEVEL_COLORS[level - 1] }} /></div>
              ))}
            </div>
            {focus && (
              <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-400/[0.07] p-4">
                <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-violet-300"><Target size={13} /> {t('dashboard.roles.focus')}</p>
                <p className="mt-2 text-base text-white" style={serifStyle}>{focus.competency}</p>
                {focus.horizon && <p className="mt-1 text-[10px] text-violet-200/55">{focus.horizon}</p>}
              </div>
            )}
            </Panel>

            <Panel className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brand-300,#67e8f9)]">{t('dashboard.roles.reading')}</p><h3 className="mt-1 text-[25px] leading-none text-white" style={serifStyle}>{role.role}</h3></div>
              <UsersRound size={20} className="text-white/25" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/60">{role.reading || '—'}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-emerald-300">{t('dashboard.roles.strengths')}</p><ul className="mt-2 space-y-2 text-xs leading-relaxed text-white/55">{(role.strengths.length ? role.strengths : ['—']).map((item) => <li key={item} className="flex gap-2"><span className="text-emerald-300">+</span>{item}</li>)}</ul></div>
              <div><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-amber-300">{t('dashboard.roles.risks')}</p><ul className="mt-2 space-y-2 text-xs leading-relaxed text-white/55">{(role.risks.length ? role.risks : ['—']).map((item) => <li key={item} className="flex gap-2"><span className="text-amber-300">!</span>{item}</li>)}</ul></div>
            </div>
            {focus && (focus.rationale || focus.impact) && (
              <div className="mt-5 border-t border-white/[0.07] pt-4">
                {focus.rationale && <p className="text-xs leading-relaxed text-white/48">{focus.rationale}</p>}
                {focus.impact && <p className="mt-2 flex gap-2 text-xs leading-relaxed text-[var(--brand-200,#a5f3fc)]/70"><ArrowRight size={13} className="mt-0.5 shrink-0" /> {focus.impact}</p>}
              </div>
            )}
            </Panel>
          </div>

          <DescriptorAnalysis
            key={`${role.role}-${roleDescriptorScope ? 'role' : 'organization'}`}
            scope={descriptorScope}
            requestedRole={role.role}
            organizationFallback={!roleDescriptorScope && Boolean(descriptorScope)}
            turmaNome={reports.scope.turmaNome}
            t={t}
          />
        </div>
      )}
    </div>
  );
}

function PrioritiesTab({ reports, t }: { reports: RhReportsCenter; t: any }) {
  const insight = reports.dashboard.insight;
  if (!insight) return <ExecutiveReading reports={reports} t={t} />;
  const plan = [
    { key: 'short', items: insight.actionPlan.shortTerm, color: '#FB7185' },
    { key: 'medium', items: insight.actionPlan.mediumTerm, color: '#22D3EE' },
    { key: 'long', items: insight.actionPlan.longTerm, color: '#34D399' },
  ] as const;

  return (
    <div>
      <SectionTitle eyebrow={t('dashboard.priorities.eyebrow')} title={t('dashboard.priorities.title')} subtitle={t('dashboard.priorities.subtitle')} />
      <CompanyScopeNotice scope={reports.scope} t={t} />
      <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-3">
          {insight.criticalCompetencies.map((item, index) => (
            <Panel key={`${item.competency}-${index}`} className="overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
                <div><p className="text-[9px] font-bold uppercase tracking-[0.17em] text-amber-300">{item.criticality || t('dashboard.priorities.attention')}</p><h3 className="mt-1 text-xl leading-tight text-white" style={serifStyle}>{item.competency}</h3></div>
                <Flag size={17} className="shrink-0 text-amber-300/60" />
              </div>
              <div className="p-5">
                {item.rationale && <p className="text-sm leading-relaxed text-white/60">{item.rationale}</p>}
                {item.impact && <p className="mt-3 border-l-2 border-amber-300/50 pl-3 text-xs leading-relaxed text-amber-100/60">{item.impact}</p>}
                {item.training && (
                  <div className="mt-5 rounded-2xl border border-[var(--brand-400,#22d3ee)]/15 bg-[var(--brand-400,#22d3ee)]/[0.05] p-4">
                    <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--brand-300,#67e8f9)]"><Lightbulb size={13} /> {t('dashboard.priorities.training')}</p>
                    <p className="mt-2 text-sm font-semibold text-white/80">{item.training.title}</p>
                    <p className="mt-1 text-[10px] text-white/38">{[item.training.audience, item.training.format, item.training.workload].filter(Boolean).join(' · ')}</p>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>

        <div className="space-y-3">
          <Panel className="p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-violet-300">{t('dashboard.priorities.plan')}</p>
            <div className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-white/[0.08]">
              {plan.map(({ key, items, color }) => (
                <div key={key} className="relative pl-7">
                  <span className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-4 border-[#102c4a]" style={{ background: color }} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color }}>{t(`dashboard.priorities.horizons.${key}`)}</p>
                  <ul className="mt-2 space-y-2 text-xs leading-relaxed text-white/55">{(items.length ? items : ['—']).map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ))}
            </div>
          </Panel>

          {insight.talents.length > 0 && (
            <Panel className="p-5">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-300"><Sparkles size={13} /> {t('dashboard.priorities.talents')}</p>
              <div className="mt-4 space-y-4">
                {insight.talents.map((talent) => (
                  <div key={talent.person} className="border-t border-white/[0.07] pt-4 first:border-0 first:pt-0">
                    <p className="text-sm font-bold text-white">{talent.person}</p>
                    {talent.situation && <p className="mt-1 text-xs leading-relaxed text-white/48">{talent.situation}</p>}
                    {talent.action && <p className="mt-2 flex gap-2 text-xs leading-relaxed text-emerald-100/65"><ArrowRight size={13} className="mt-0.5 shrink-0" /> {talent.action}</p>}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentCard({ document, t, locale, onOpen }: { document: RhReportDocument; t: any; locale: string; onOpen: () => void }) {
  const Icon = DOCUMENT_ICONS[document.kind] || FileText;
  const date = formatDate(document.generatedAt, locale);
  return (
    <button type="button" onClick={onOpen} className="group relative flex min-h-[168px] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-400,#22d3ee)]/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)]" style={{ background: 'linear-gradient(145deg, rgba(15,42,74,.94), rgba(7,22,39,.96))' }}>
      <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[var(--brand-400,#22d3ee)]/[0.08] blur-2xl transition group-hover:bg-[var(--brand-400,#22d3ee)]/[0.13]" />
      <div className="relative flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--brand-400,#22d3ee)]/20 bg-[var(--brand-400,#22d3ee)]/10 text-[var(--brand-300,#67e8f9)]"><Icon size={19} /></span>{date && <span className="flex items-center gap-1.5 text-[10px] text-white/40"><CalendarDays size={12} /> {date}</span>}</div>
      <div className="relative mt-4 flex-1"><h3 className="text-[17px] leading-tight text-white" style={serifStyle}>{t(`kinds.${document.kind}`)}</h3>{document.recipient && <p className="mt-1 truncate text-xs font-semibold text-white/65">{document.recipient}</p>}{document.role && <p className="mt-0.5 truncate text-[11px] text-white/35">{document.role}</p>}</div>
      <span className="relative mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-300,#67e8f9)]"><Eye size={13} /> {t('open')}</span>
    </button>
  );
}

function DocumentsTab({ reports, t, locale, onOpen }: { reports: RhReportsCenter; t: any; locale: string; onOpen: (document: RhReportDocument) => void }) {
  const [active, setActive] = useState<DocumentSection>('organization');
  const [query, setQuery] = useState('');
  const sections: Record<DocumentSection, RhReportDocument[]> = { organization: reports.organization, managers: reports.managers, people: reports.people };
  const needle = normalize(query.trim());
  const visible = needle
    ? sections[active].filter((document) => normalize(`${document.recipient} ${document.role} ${t(`kinds.${document.kind}`)}`).includes(needle))
    : sections[active];

  return (
    <div>
      <SectionTitle eyebrow={t('dashboard.documents.eyebrow')} title={t('dashboard.documents.title')} subtitle={t('dashboard.documents.subtitle')} />
      <div className="mb-6 grid grid-cols-3 gap-2 md:gap-3">
        {(Object.keys(sections) as DocumentSection[]).map((key) => {
          const Icon = SECTION_ICONS[key];
          const selected = active === key;
          return (
            <button key={key} type="button" onClick={() => { setActive(key); setQuery(''); }} className="rounded-[18px] border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-400,#22d3ee)] md:px-4 md:py-4" style={{ background: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 13%, rgba(8,26,46,.95))' : 'rgba(8,26,46,.8)', borderColor: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 38%, transparent)' : 'rgba(255,255,255,.07)' }}>
              <div className="flex items-center justify-between gap-2"><Icon size={16} className={selected ? 'text-[var(--brand-300,#67e8f9)]' : 'text-white/35'} /><span className="text-xl text-white tabular-nums md:text-2xl" style={serifStyle}>{sections[key].length}</span></div>
              <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50 md:text-xs">{t(`sections.${key}`)}</p>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-300,#67e8f9)]">{t(`sections.${active}`)}</p><p className="mt-1 text-sm text-white/45">{t(`descriptions.${active}`)}</p></div>
        {(active === 'managers' || active === 'people') && sections[active].length > 0 && (
          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-white/55 sm:w-64"><Search size={15} className="shrink-0" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30" /></label>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.map((document) => <DocumentCard key={document.id} document={document} t={t} locale={locale} onOpen={() => onOpen(document)} />)}</div>
      ) : (
        <Panel className="border-dashed px-6 py-12 text-center"><FileText size={28} className="mx-auto text-white/20" /><h3 className="mt-3 text-lg text-white" style={serifStyle}>{query ? t('emptySearchTitle') : t('emptyTitle')}</h3><p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-white/40">{query ? t('emptySearchDescription') : t(`empty.${active}`)}</p></Panel>
      )}
    </div>
  );
}

function ReportReader({ document: report, t, onBack }: { document: RhReportDocument; t: any; onBack: () => void }) {
  const title = t(`kinds.${report.kind}`);
  return (
    <section aria-label={title}>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-white/45 transition hover:text-[var(--brand-300,#67e8f9)]"><ArrowLeft size={14} /> {t('viewer.back')}</button>
      <div className="overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#071829] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-6">
          <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--brand-300,#67e8f9)]">{t('viewer.eyebrow')}</p><h2 className="mt-0.5 truncate text-lg text-white sm:text-xl" style={serifStyle}>{title}{report.recipient ? ` · ${report.recipient}` : ''}</h2></div>
          <a href={report.url} download className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-[var(--brand-400,#22d3ee)]/25 bg-[var(--brand-400,#22d3ee)]/10 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--brand-300,#67e8f9)] transition hover:bg-[var(--brand-400,#22d3ee)]/15"><Download size={14} /> <span className="hidden sm:inline">{t('viewer.download')}</span></a>
        </header>
        <div className="p-2 sm:p-4"><InAppPdfDocument src={report.url} title={`${title}${report.recipient ? ` — ${report.recipient}` : ''}`} loadingLabel={t('viewer.loading')} errorLabel={t('viewer.error')} retryLabel={t('viewer.retry')} /></div>
      </div>
    </section>
  );
}

export default function RelatoriosRhView({ reports }: { reports: RhReportsCenter }) {
  const t = useTranslations('RhReports');
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [selectedDocument, setSelectedDocument] = useState<RhReportDocument | null>(null);
  const allDocuments = useMemo(() => [...reports.organization, ...reports.managers, ...reports.people], [reports]);
  const generatedAt = formatDate(reports.dashboard.generatedAt, locale);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('document');
    if (!requestedId) return;
    const requestedDocument = allDocuments.find((document) => document.id === requestedId);
    if (!requestedDocument) return;
    setSelectedDocument(requestedDocument);
    setActiveTab('documents');
  }, [allDocuments]);

  function openDocument(document: RhReportDocument) {
    setSelectedDocument(document);
    const url = new URL(window.location.href);
    url.searchParams.set('document', document.id);
    window.history.replaceState(null, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDocument() {
    setSelectedDocument(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('document');
    window.history.replaceState(null, '', url);
  }

  return (
    <PageContainer className="pb-28">
      <PageHero eyebrow={t('dashboard.eyebrow')} title={t('dashboard.title')} titleAccent={reports.companyName || t('fallbackCompany')} subtitle={t('dashboard.subtitle')} actions={generatedAt ? <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/40"><CalendarDays size={12} className="text-[var(--brand-300,#67e8f9)]" /> {t('dashboard.updated', { date: generatedAt })}</span> : undefined} />
      {selectedDocument ? (
        <ReportReader document={selectedDocument} t={t} onBack={closeDocument} />
      ) : (
        <>
          <ScopeFilter scope={reports.scope} t={t} />
          <DashboardNavigation active={activeTab} onChange={setActiveTab} t={t} />
          {activeTab === 'overview' && <OverviewTab reports={reports} t={t} />}
          {activeTab === 'roles' && <RolesTab reports={reports} t={t} />}
          {activeTab === 'priorities' && <PrioritiesTab reports={reports} t={t} />}
          {activeTab === 'documents' && <DocumentsTab reports={reports} t={t} locale={locale} onOpen={openDocument} />}
        </>
      )}
    </PageContainer>
  );
}
