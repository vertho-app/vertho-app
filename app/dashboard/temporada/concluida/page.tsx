'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Sparkles, Trophy, Target, MessageSquare, CheckCircle2, TrendingUp, Minus, Download, Award, PartyPopper } from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import BackButton from '@/components/back-button';
import ReactMarkdown from 'react-markdown';
import { loadTemporadaConcluida } from '@/actions/temporada-concluida';
import { descritorParaHumano } from '@/lib/descritor-humano';
import { formatarAvanco, formatarValorAvanco, CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { COR_VEREDITO_TELA, corTela } from '@/lib/season-engine/convergencia-cores';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';

// Sem veredito de regressão (a régua não tem desde 01/09) e sem nota absoluta:
// cada descritor mostra só o AVANÇO, com piso em zero, e o veredito. Decisão do
// dono aplicada às telas de admin e do gestor em 14/09; esta tela, que é a da
// própria pessoa e a que baixa o PDF, ficou para trás até 16/09.
// Cores pela paleta única do veredito (`convergencia-cores`).
const VEREDITO = {
  evolucao_confirmada: { icon: TrendingUp, labelKey: 'confirmed' },
  evolucao_parcial:    { icon: TrendingUp, labelKey: 'partial' },
  estagnacao:          { icon: Minus,      labelKey: 'stagnation' },
};

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
  const resumo = evolutionReport?.resumo || {};

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

      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={18} className="text-amber-400" />
          <span className="text-xs uppercase text-amber-400 tracking-widest font-bold">{t('hero.eyebrow', { number: trilha.numeroTemporada })}</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight mb-2">
          {t('hero.title', { name: firstName })}
        </h1>
        <p className="text-sm text-gray-400">
          {t.rich('hero.subtitle', { competency: trilha.competencia, strong: (chunks) => <span className="text-brand-400">{chunks}</span> })}
        </p>
      </div>

      {/* Resumo numérico */}
      <GlassCard className="mb-6 border-brand-500/20 bg-brand-500/[0.03]">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat label={t('stats.confirmed')} valor={resumo.confirmadas || 0} cor={COR_VEREDITO_TELA[CONVERGENCIA.CONFIRMADA].tinta} />
          <Stat label={t('stats.partial')} valor={resumo.parciais || 0} cor={COR_VEREDITO_TELA[CONVERGENCIA.PARCIAL].tinta} />
          {/* Relatório anterior a 01/09 ainda pode ter `regressoes`: manteve o patamar, conta como estável. */}
          <Stat label={t('stats.stagnated')} valor={(resumo.estagnacoes || 0) + (resumo.regressoes || 0)} cor="text-gray-400" />
        </div>
        {evolutionReport?.insight_geral && (
          <p className="text-sm text-gray-200 italic border-l-2 border-brand-500/50 pl-3">
            "{evolutionReport.insight_geral}"
          </p>
        )}
      </GlassCard>

      {/* Bloco 1 — Comparativo por descritor */}
      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.descriptor')}</h2>
        {/* Agrupado por competência: na trilha DUO são duas, e a lista corrida
            não dizia a qual cada comportamento pertence (mesma função do PDF). */}
        {agruparPorCompetencia(descritores).map((grupo, g) => (
          <div key={g} className="mb-4">
            {grupo.competencia && (
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-sm font-bold text-brand-300">{grupo.competencia}</p>
                  {/* Nível da MÉDIA da competência (nunca a nota) e parabéns quando subiu. */}
                  {grupo.nivelFinal != null && (
                    <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {t('finalLevel')} <b className="text-white">N{grupo.nivelFinal}</b>
                      {grupo.subiuDeNivel && (
                        <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                          <PartyPopper size={13} /> {t('levelUp')}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                {/* Resultado da competência = média dos avanços exibidos, nunca a nota. */}
                {formatarValorAvanco(grupo.avancoMedio) && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {t('competencyProgress')} <b className="text-brand-300">{formatarValorAvanco(grupo.avancoMedio)}</b>
                  </span>
                )}
              </div>
            )}
            <div className="space-y-2">
              {grupo.descritores.map((d, i) => {
                const conv = VEREDITO[d.convergencia] || VEREDITO.estagnacao;
                const cor = corTela(d.convergencia);
                const Icon = conv.icon;
                const avanco = formatarAvanco(d.nota_pre, d.nota_pos);
                return (
                  <GlassCard key={i} className={`${cor.borda} ${cor.fundo}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cor.icone}`}>
                        <Icon size={18} className={cor.tinta} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <p className="text-sm font-bold text-white">{descritorParaHumano(d.descritor)}</p>
                          {avanco && (
                            <span className={`text-xs font-bold shrink-0 ${cor.tinta}`}>{avanco}</span>
                          )}
                        </div>
                        <p className={`text-[10px] uppercase mt-1 ${cor.tinta}`}>{t(`classification.${conv.labelKey}`)}</p>
                        {d.antes && d.depois && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <p className="text-gray-500"><span className="text-gray-400">{t('before')}</span> {d.antes}</p>
                            <p className="text-gray-200"><span className="text-brand-400">{t('after')}</span> {d.depois}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Bloco 2 — Momentos da temporada */}
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

      {/* Bloco 3 — Missões práticas */}
      {missoes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.missions')}</h2>
          <div className="space-y-2">
            {missoes.map((m, i) => (
              <GlassCard key={i} className="border-amber-500/15">
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0 text-center">
                    <p className="text-[9px] uppercase text-gray-500">{t('weekShort')}</p>
                    <p className="text-lg font-extrabold text-amber-400">{m.semana}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-gray-500 uppercase mb-1 tracking-widest">
                      {m.modo === 'pratica' ? t('mission.real') : t('mission.written')}
                    </p>
                    {m.compromisso && (
                      <p className="text-xs text-gray-200 mb-1"><span className="text-amber-400">{t('mission.commitment')}</span> {m.compromisso}</p>
                    )}
                    {m.sintese && (
                      <p className="text-xs text-gray-400"><span className="text-gray-500">{t('mission.synthesis')}</span> {m.sintese}</p>
                    )}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </section>
      )}

      {/* Bloco 4 — Avaliação final (sem 14) */}
      {sem14 && (
        <section className="mb-8">
          <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-3">{t('sections.finalAssessment')}</h2>
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
          </GlassCard>
        </section>
      )}

      {/* Bloco 5 — Próximos passos */}
      {evolutionReport?.proximo_passo && (
        <GlassCard className="border-emerald-500/20 bg-emerald-500/[0.03] mb-8">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs uppercase text-emerald-400 font-bold tracking-widest">{t('sections.nextSteps')}</span>
          </div>
          <p className="text-sm text-gray-200">{evolutionReport.proximo_passo}</p>
        </GlassCard>
      )}
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

function Stat({ label, valor, cor }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}
