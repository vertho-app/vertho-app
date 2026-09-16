'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Trophy, Target, Download, Award } from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import BackButton from '@/components/back-button';
import ReactMarkdown from 'react-markdown';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { descritorParaHumano } from '@/lib/descritor-humano';
import RelatorioTemporadaConcluida from '@/components/temporada/relatorio-temporada-concluida';

export default function TemporadaConcluidaPage() {
  const t = useTranslations('SeasonDone');
  const router = useRouter();
  const sb = getSupabase();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaConcluida(user.email);
      if (r.error) setError(r.error);
      else setData(r);
      setLoading(false);
    })();
  }, [router, sb]);

  if (loading) return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  if (error) return <Center><div className="text-center"><p className="text-gray-400">{error}</p><button onClick={() => router.push('/dashboard/temporada')} className="text-brand-400 text-xs mt-3">{t('back')}</button></div></Center>;

  const { colab, trilha, evolutionReport, momentos, missoes, sem14 } = data;
  const firstName = (colab.nome || '').split(' ')[0];
  const descritores = evolutionReport?.descritores || [];

  // Piloto: SEM bloco de evolução/delta — baseline como ponto de partida,
  // fechamento como demonstração da avaliação (2 semanas não medem evolução).
  if (evolutionReport?.modo === 'piloto') {
    return (
      <PageContainer>
        <BackButton href="/dashboard/temporada" />
        {/* Degustação SEM fechamento: não há avaliação → PDF do piloto não se aplica */}
        {!evolutionReport?.sem_fechamento && (
          <div className="flex items-center justify-end mb-4">
            <PdfButton sb={sb} numeroTemporada={trilha.numeroTemporada} label={t('downloadPdf')} errorLabel={t('pdfError')} />
          </div>
        )}

        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Trophy size={18} className="text-amber-400" />
            <span className="text-xs uppercase text-amber-400 tracking-widest font-bold">{t('pilot.eyebrow')}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-2">
            {t('pilot.title', { name: firstName })}
          </h1>
          <p className="text-sm text-gray-400">
            {t.rich('pilot.subtitle', { competency: trilha.competencia, strong: (chunks) => <span className="text-brand-400">{chunks}</span> })}
          </p>
        </div>

        {/* Ponto de partida (baseline do diagnóstico) */}
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-1">{t('pilot.baselineSection')}</h2>
          <p className="text-xs text-gray-500 mb-3">{t('pilot.baselineNote')}</p>
          <div className="space-y-2">
            {descritores.map((d, i) => (
              <GlassCard key={i} className="border-brand-500/15">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{descritorParaHumano(d.descritor)}</p>
                  {d.baseline != null && (
                    <span className="text-xs text-brand-300 font-bold shrink-0">{Number(d.baseline).toFixed(1)}/4.0</span>
                  )}
                </div>
              </GlassCard>
            ))}
          </div>
        </section>

        {/* Momentos de insight (engajamento) */}
        {momentos.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.insights')}</h2>
            <div className="space-y-2">
              {momentos.map((m, i) => (
                <GlassCard key={i} className="border-brand-500/15">
                  <div className="flex items-start gap-3">
                    <div className="w-12 shrink-0 text-center">
                      <p className="text-[9px] uppercase text-gray-500">{t('weekShort')}</p>
                      <p className="text-lg font-extrabold text-brand-300">{m.semana}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">{descritorParaHumano(m.descritor)}</p>
                      <p className="text-sm text-gray-200 italic">💡 {m.insight}</p>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </section>
        )}

        {/* Fechamento = demonstração da avaliação */}
        {sem14 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-1">{t('pilot.assessmentSection')}</h2>
            <p className="text-xs text-gray-500 mb-3">{t('pilot.assessmentNote')}</p>
            <GlassCard className="border-purple-500/20 bg-purple-500/[0.03]">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-purple-400" />
                <span className="text-xs uppercase text-purple-400 font-bold tracking-widest">{t('final.cardTitle')}</span>
              </div>
              {sem14.cenario && (
                <details className="mb-3">
                  <summary className="text-xs text-brand-400 cursor-pointer">{t('final.viewScenario')}</summary>
                  <div className="prose prose-invert prose-sm max-w-none mt-2 text-xs text-gray-300">
                    <ReactMarkdown>{sem14.cenario}</ReactMarkdown>
                  </div>
                </details>
              )}
              {sem14.resposta && (
                <details className="mb-3">
                  <summary className="text-xs text-brand-400 cursor-pointer">{t('final.viewAnswer')}</summary>
                  <p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap border-l-2 border-brand-500/30 pl-3">{sem14.resposta}</p>
                </details>
              )}
              {sem14.resumo_avaliacao?.mensagem_geral && (
                <div className="rounded-lg bg-white/[0.03] p-3 mt-3">
                  <p className="text-[10px] uppercase text-purple-400 font-bold tracking-widest mb-1">{t('final.feedback')}</p>
                  <p className="text-sm text-gray-200">{sem14.resumo_avaliacao.mensagem_geral}</p>
                </div>
              )}
              {sem14.nota_media_pos != null && (
                <p className="text-xs text-gray-400 mt-3">
                  {t('pilot.demoScore')} <span className="text-purple-300 font-bold">{Number(sem14.nota_media_pos).toFixed(1)}/4.0</span>
                </p>
              )}
            </GlassCard>
          </section>
        )}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <BackButton href="/dashboard/temporada" />
      <div className="flex items-center justify-end mb-4 gap-2">
        <CertificadoButton
          sb={sb}
          numeroTemporada={trilha.numeroTemporada}
          certificado={data.certificado}
          label={t('downloadCertificate')}
          errorLabel={t('certificateError')}
          notEligibleLabel={(pct) => t('certificateNotEligible', { pct })}
        />
        <button onClick={async () => {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch('/api/temporada/concluida/pdf', {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (!res.ok) { alert(t('pdfError')); return; }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `temporada-${data.trilha.numeroTemporada}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }} className="flex items-center gap-2 text-xs text-brand-400 border border-brand-400/30 hover:bg-brand-400/10 rounded-full px-3 py-1.5">
          <Download size={12} /> {t('downloadPdf')}
        </button>
      </div>

      <RelatorioTemporadaConcluida data={data} />
    </PageContainer>
  );
}

function CertificadoButton({ sb, numeroTemporada, certificado, label, errorLabel, notEligibleLabel }) {
  const inelegivel = certificado && !certificado.elegivel;
  return (
    <div className="flex flex-col items-end">
      <button
        disabled={inelegivel}
        title={inelegivel ? notEligibleLabel(certificado.pct) : undefined}
        onClick={async () => {
          const { data: { session } } = await sb.auth.getSession();
          const res = await fetch('/api/temporada/certificado/pdf', {
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (!res.ok) {
            let msg = errorLabel;
            try {
              const j = await res.json();
              if (j?.motivo === 'participacao' && j?.participacao) {
                msg = notEligibleLabel(Math.round(j.participacao.pct * 100));
              }
            } catch { /* resposta não-JSON → erro genérico */ }
            alert(msg);
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `certificado-temporada-${numeroTemporada}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        className={`flex items-center gap-2 text-xs rounded-full px-3 py-1.5 border ${inelegivel
          ? 'text-gray-500 border-gray-600/30 cursor-not-allowed'
          : 'text-amber-400 border-amber-400/30 hover:bg-amber-400/10'}`}
      >
        <Award size={12} /> {label}
      </button>
      {inelegivel && <p className="text-[10px] text-gray-500 mt-1">{notEligibleLabel(certificado.pct)}</p>}
    </div>
  );
}

function PdfButton({ sb, numeroTemporada, label, errorLabel }) {
  return (
    <button onClick={async () => {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch('/api/temporada/concluida/pdf', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) { alert(errorLabel); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `temporada-${numeroTemporada}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }} className="flex items-center gap-2 text-xs text-brand-400 border border-brand-400/30 hover:bg-brand-400/10 rounded-full px-3 py-1.5">
      <Download size={12} /> {label}
    </button>
  );
}

function Center({ children }) {
  // Sem fundo próprio — ver o comentário em `temporada/page.tsx`: o shell já
  // pinta o gradiente do tenant e a cor fixa o cobria.
  return <div className="min-h-[60vh] flex items-center justify-center text-white">{children}</div>;
}
