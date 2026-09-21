'use client';

import { use, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, CalendarCheck, Check, FileChartColumn, Loader2, Target } from 'lucide-react';
import BackButton from '@/components/back-button';
import { PageContainer } from '@/components/page-shell';
import { loadJornadaHistorica } from '../historico-actions';

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

function formatarData(valor: string | null, locale: string): string {
  if (!valor) return '—';
  const data = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(data);
}

export default function JornadaHistoricaPage({ params }: { params: Promise<{ trilhaId: string }> }) {
  const { trilhaId } = use(params);
  const t = useTranslations('JourneyHistory');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    loadJornadaHistorica(trilhaId).then((resultado) => {
      if (ativo) {
        setData(resultado);
        setLoading(false);
      }
    });
    return () => { ativo = false; };
  }, [trilhaId]);

  if (loading) return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  if (data?.error || !data?.jornada) return <Center><p className="text-sm text-white/55">{data?.error || t('notFound')}</p></Center>;

  const jornada = data.jornada;
  const semanasConsultaveis = jornada.semanas.filter((semana: any) => semana.tipo !== 'avaliacao');

  return (
    <PageContainer>
      <BackButton href="/dashboard/jornada/historico" />

      <header className="mt-5 overflow-hidden rounded-[30px] border border-violet-300/20 bg-[radial-gradient(circle_at_top_right,rgba(184,136,232,0.20),transparent_38%),linear-gradient(135deg,#101f3c,#1a1235)] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.2)] sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-300">{t('seasonCompleted', { number: jornada.numero })}</p>
        <h1 style={{ ...serifStyle, fontSize: 'clamp(30px, 6vw, 48px)', lineHeight: 1.04, color: '#fff', marginTop: 8 }}>
          {jornada.competencias.join(' + ') || t('developmentJourney')}
        </h1>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
          <span>{t('period', { start: formatarData(jornada.dataInicio, locale), end: formatarData(jornada.dataConclusao, locale) })}</span>
          <span>{t('weeks', { count: jornada.totalSemanas })}</span>
        </div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => router.push(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(jornada.id)}`)}
          disabled={!jornada.relatorioDisponivel}
          className="group flex items-center gap-4 rounded-[24px] border border-amber-300/20 bg-amber-300/[0.055] p-5 text-left transition hover:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-300/10 text-amber-300"><FileChartColumn size={21} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">{t('actions.report')}</span>
            <span className="mt-1 block text-xs leading-relaxed text-white/45">{t('actions.reportDescription')}</span>
          </span>
          <ArrowRight size={17} className="text-white/25 transition group-hover:translate-x-1 group-hover:text-amber-300" />
        </button>

        <div className="flex items-center gap-4 rounded-[24px] border border-brand-300/15 bg-brand-300/[0.045] p-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-300/10 text-brand-300"><CalendarCheck size={21} /></span>
          <span>
            <span className="block text-sm font-bold text-white">{t('actions.preserved')}</span>
            <span className="mt-1 block text-xs leading-relaxed text-white/45">{t('actions.preservedDescription')}</span>
          </span>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">{t('contentsEyebrow')}</p>
            <h2 style={{ ...serifStyle, fontSize: 27, color: '#fff', marginTop: 2 }}>{t('contentsTitle')}</h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">{t('items', { count: semanasConsultaveis.length })}</span>
        </div>

        <div className="space-y-2.5">
          {semanasConsultaveis.map((semana: any) => {
            const pratica = semana.tipo === 'aplicacao';
            const Icon = pratica ? Target : BookOpen;
            return (
              <button
                key={semana.semana}
                onClick={() => router.push(`/dashboard/temporada/semana/${semana.semana}?trilha=${encodeURIComponent(jornada.id)}`)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.075] bg-white/[0.032] p-4 text-left transition hover:border-brand-300/25 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/60"
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${pratica ? 'bg-amber-300/10 text-amber-300' : 'bg-brand-300/10 text-brand-300'}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
                    {t('week', { number: semana.semana })} · {pratica ? t('practice') : t('content')}
                    {semana.concluida && <Check size={11} className="text-emerald-300" />}
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-white/85">{semana.titulo}</span>
                  {semana.competencia && <span className="mt-0.5 block truncate text-[11px] text-white/35">{semana.competencia}</span>}
                </span>
                <ArrowRight size={16} className="shrink-0 text-white/20 transition group-hover:translate-x-1 group-hover:text-brand-300" />
              </button>
            );
          })}
        </div>
      </section>
    </PageContainer>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center px-5 text-center text-white">{children}</div>;
}
