'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Building2,
  CalendarDays,
  Download,
  FileChartColumn,
  FileText,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { PageContainer, PageHero } from '@/components/page-shell';
import type { RhReportDocument, RhReportKind, RhReportsCenter } from '@/lib/relatorios/rh-center';

type SectionKey = 'organization' | 'managers' | 'people';

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

function normalize(value: unknown): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function DocumentCard({ document, t, locale }: { document: RhReportDocument; t: any; locale: string }) {
  const Icon = DOCUMENT_ICONS[document.kind] || FileText;
  const date = document.generatedAt
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(document.generatedAt))
    : null;

  return (
    <a
      href={document.url}
      target="_blank"
      rel="noreferrer"
      className="group relative flex min-h-[168px] flex-col overflow-hidden rounded-[22px] border border-white/[0.08] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-400,#22d3ee)]/35 hover:bg-white/[0.055]"
      style={{ background: 'linear-gradient(145deg, rgba(15,42,74,.94), rgba(7,22,39,.96))' }}
    >
      <div className="pointer-events-none absolute -right-10 -top-14 h-32 w-32 rounded-full bg-[var(--brand-400,#22d3ee)]/[0.08] blur-2xl transition group-hover:bg-[var(--brand-400,#22d3ee)]/[0.13]" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--brand-400,#22d3ee)]/20 bg-[var(--brand-400,#22d3ee)]/10 text-[var(--brand-300,#67e8f9)]">
          <Icon size={19} />
        </span>
        {date && (
          <span className="flex items-center gap-1.5 text-[10px] text-white/40">
            <CalendarDays size={12} /> {date}
          </span>
        )}
      </div>

      <div className="relative mt-4 flex-1">
        <h3 className="text-[17px] leading-tight text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>
          {t(`kinds.${document.kind}`)}
        </h3>
        {document.recipient && <p className="mt-1 truncate text-xs font-semibold text-white/65">{document.recipient}</p>}
        {document.role && <p className="mt-0.5 truncate text-[11px] text-white/35">{document.role}</p>}
      </div>

      <span className="relative mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--brand-300,#67e8f9)]">
        <Download size={13} /> {t('download')}
      </span>
    </a>
  );
}

export default function RelatoriosRhView({ reports }: { reports: RhReportsCenter }) {
  const t = useTranslations('RhReports');
  const locale = useLocale();
  const [active, setActive] = useState<SectionKey>('organization');
  const [query, setQuery] = useState('');
  const sections: Record<SectionKey, RhReportDocument[]> = {
    organization: reports.organization,
    managers: reports.managers,
    people: reports.people,
  };
  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return sections[active];
    return sections[active].filter((document) =>
      normalize(`${document.recipient} ${document.role} ${t(`kinds.${document.kind}`)}`).includes(needle),
    );
  }, [active, query, reports, t]);
  const total = reports.organization.length + reports.managers.length + reports.people.length;

  return (
    <PageContainer className="pb-28">
      <PageHero
        eyebrow={t('eyebrow')}
        title={t('title')}
        titleAccent={reports.companyName || t('fallbackCompany')}
        subtitle={t('subtitle')}
      />

      <div className="mb-6 grid grid-cols-3 gap-2 md:gap-3">
        {(Object.keys(sections) as SectionKey[]).map((key) => {
          const Icon = SECTION_ICONS[key];
          const selected = active === key;
          return (
            <button
              key={key}
              onClick={() => { setActive(key); setQuery(''); }}
              className="rounded-[18px] border px-3 py-3 text-left transition md:px-4 md:py-4"
              style={{
                background: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 13%, rgba(8,26,46,.95))' : 'rgba(8,26,46,.8)',
                borderColor: selected ? 'color-mix(in oklab, var(--brand-400, #22d3ee) 38%, transparent)' : 'rgba(255,255,255,.07)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <Icon size={16} className={selected ? 'text-[var(--brand-300,#67e8f9)]' : 'text-white/35'} />
                <span className="text-xl tabular-nums text-white md:text-2xl" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>
                  {sections[key].length}
                </span>
              </div>
              <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white/50 md:text-xs">
                {t(`sections.${key}`)}
              </p>
            </button>
          );
        })}
      </div>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--brand-300,#67e8f9)]">
              {t(`sections.${active}`)}
            </p>
            <p className="mt-1 text-sm text-white/45">{t(`descriptions.${active}`)}</p>
          </div>
          {(active === 'managers' || active === 'people') && sections[active].length > 0 && (
            <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-white/55 sm:w-64">
              <Search size={15} className="shrink-0" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search')}
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>
          )}
        </div>

        {visible.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((document) => <DocumentCard key={document.id} document={document} t={t} locale={locale} />)}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] px-6 py-12 text-center">
            <FileText size={28} className="mx-auto text-white/20" />
            <h3 className="mt-3 text-lg text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>
              {query ? t('emptySearchTitle') : t('emptyTitle')}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-white/40">
              {query ? t('emptySearchDescription') : t(`empty.${active}`)}
            </p>
          </div>
        )}
      </section>

      <p className="mt-6 text-[11px] leading-relaxed text-white/30">
        {t('footer', { count: total })}
      </p>
    </PageContainer>
  );
}
