'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Archive, ArrowRight, BookOpen, CalendarDays, FileChartColumn, Loader2 } from 'lucide-react';
import BackButton from '@/components/back-button';
import { PageContainer } from '@/components/page-shell';
import { loadHistoricoJornadas } from './historico-actions';

const serifStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
  fontStyle: 'italic',
  fontWeight: 400,
};

function formatarData(valor: string | null, locale: string): string {
  if (!valor) return '—';
  const data = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  if (Number.isNaN(data.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(data);
}

export default function HistoricoJornadasPage() {
  const t = useTranslations('JourneyHistory');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ativo = true;
    loadHistoricoJornadas().then((resultado) => {
      if (ativo) {
        setData(resultado);
        setLoading(false);
      }
    });
    return () => { ativo = false; };
  }, []);

  if (loading) return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  if (data?.error) return <Center><p className="text-sm text-white/55">{data.error}</p></Center>;

  const jornadas = data?.jornadas || [];
  const primeiroNome = String(data?.colaborador?.nome || '').split(' ')[0];

  return (
    <PageContainer>
      <BackButton href="/dashboard/jornada" />

      <header className="mb-8 mt-5">
        <div className="mb-3 flex items-center gap-2 text-brand-300">
          <Archive size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.22em]">{t('eyebrow')}</span>
        </div>
        <h1 style={{ ...serifStyle, fontSize: 'clamp(32px, 6vw, 52px)', lineHeight: 1, color: '#fff' }}>
          {t('title', { name: primeiroNome })}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">{t('subtitle')}</p>
      </header>

      {jornadas.length === 0 ? (
        <section className="rounded-[28px] border border-white/[0.08] bg-white/[0.035] p-7 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-brand-300/20 bg-brand-300/[0.07] text-brand-300">
            <Archive size={24} />
          </div>
          <h2 className="text-base font-bold text-white">{t('empty.title')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/45">{t('empty.description')}</p>
        </section>
      ) : (
        <section className="relative space-y-4 before:absolute before:bottom-10 before:left-[27px] before:top-9 before:w-px before:bg-gradient-to-b before:from-brand-300/60 before:via-violet-300/35 before:to-transparent sm:before:left-[35px]">
          {jornadas.map((jornada: any, indice: number) => (
            <button
              key={jornada.id}
              onClick={() => router.push(`/dashboard/jornada/historico/${encodeURIComponent(jornada.id)}`)}
              className="group relative w-full rounded-[26px] border border-white/[0.08] bg-[linear-gradient(135deg,rgba(16,42,70,0.96),rgba(23,20,58,0.92))] p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-brand-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300/70 sm:p-6"
            >
              <div className="flex items-start gap-4 sm:gap-5">
                <div className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-brand-300/30 bg-[#0b2038] text-brand-200 shadow-[0_0_24px_rgba(52,197,204,0.12)] sm:h-[70px] sm:w-[70px]">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/35">{t('season')}</span>
                  <span style={{ ...serifStyle, fontSize: 28, lineHeight: .7 }}>{jornada.numero}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">{indice === 0 ? t('latest') : t('completed')}</p>
                      <h2 className="mt-1 text-lg font-bold leading-tight text-white">
                        {jornada.competencias.join(' + ') || t('developmentJourney')}
                      </h2>
                    </div>
                    <ArrowRight size={18} className="mt-1 shrink-0 text-white/30 transition group-hover:translate-x-1 group-hover:text-brand-300" />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45">
                    <span className="flex items-center gap-1.5"><CalendarDays size={13} /> {formatarData(jornada.dataConclusao, locale)}</span>
                    <span className="flex items-center gap-1.5"><BookOpen size={13} /> {t('contents', { count: jornada.totalConteudos })}</span>
                    <span className="flex items-center gap-1.5"><FileChartColumn size={13} /> {jornada.relatorioDisponivel ? t('reportReady') : t('reportUnavailable')}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      <p className="mt-7 text-center text-[11px] leading-relaxed text-white/30">{t('accessNote')}</p>
    </PageContainer>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[60dvh] items-center justify-center px-5 text-center text-white">{children}</div>;
}
