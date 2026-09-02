'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Users, AlertTriangle, ChevronRight, Loader2, ArrowRight,
  Calendar, TrendingUp, Activity, ClipboardCheck, FileText,
  Brain, CalendarClock, Rocket, Target, Sparkles, X, BarChart3,
} from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import InAppPdfDocument from '@/components/pdf/in-app-pdf-document';
import { getGestorHomeData, type GestorHomeData, type CheckpointPendenteDetalhado } from './actions';
import { salvarCheckpointGestor } from './equipe-evolucao/actions';

export default function GestorHomePage() {
  const t = useTranslations('ManagerDashboard');
  const locale = useLocale();
  const router = useRouter();
  const [data, setData] = useState<GestorHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avaliando, setAvaliando] = useState<string | null>(null);
  const [modal, setModal] = useState<{ cp: CheckpointPendenteDetalhado; avaliacao: 'evoluindo' | 'estagnado' | 'regredindo' } | null>(null);
  const [observacao, setObservacao] = useState('');
  const [reportReaderOpen, setReportReaderOpen] = useState(false);
  // O filtro da tabela vive AQUI porque os cards de ação o comandam: clicar em
  // "30 atrasados" tem que virar a lista dos 30, senão o número não vira nome.
  const [filtroEquipe, setFiltroEquipe] = useState<FiltroEquipe>('todos');

  async function carregar() {
    setLoading(true);
    const r = await getGestorHomeData();
    setData(r);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

  async function aplicarAvaliacao() {
    if (!modal) return;
    const key = `${modal.cp.trilhaId}-${modal.cp.semana}`;
    setAvaliando(key);
    const r = await salvarCheckpointGestor({
      trilhaId: modal.cp.trilhaId,
      semana: modal.cp.semana,
      avaliacao: modal.avaliacao,
      observacao: observacao.trim() || null,
    });
    setAvaliando(null);
    if (r.error) { alert(r.error); return; }
    setModal(null);
    setObservacao('');
    await carregar();
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-brand-400" />
        </div>
      </PageContainer>
    );
  }

  if (!data?.ok) {
    return (
      <PageContainer>
        <GlassCard>
          <p className="text-red-400">{data?.error || t('loadError')}</p>
        </GlassCard>
      </PageContainer>
    );
  }

  const k = data.kpis!;
  const alertas = data.alertas || [];
  const cps = data.checkpointsPendentes || [];
  const semLiderados = data.scope === 'gestor' && k.liderados.total === 0;

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 mb-5 flex-wrap">
        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-brand-300/80 mb-1">
            {data.scope === 'rh' ? t('scopes.rh') : data.scope === 'tutor' ? t('scopes.tutor') : t('scopes.manager')}
          </p>
          <h1 className="text-white text-2xl font-bold flex items-center gap-2">
            <Users size={22} className="text-brand-400" />{' '}
            {data.scope === 'rh' ? t('titles.company') : data.scope === 'tutor' ? t('titles.tutor') : t('titles.team')}
          </h1>
        </div>
        {/* Para o RH este link levava, na maior parte do tempo, a uma tela
            sem nada: a evolucao so existe depois do fechamento. O caminho dele
            para la e o atalho da home, que aparece quando ha jornada encerrada.
            O gestor mantem o link — a tela dele tem os checkpoints tambem. */}
        <div className="flex items-center gap-4">
          {/* Engajamento vale para os TRES papeis: a pergunta "quem sumiu esta
              semana" e a mesma para gestor, tutor e RH. A evolucao continua
              restrita, porque so existe depois do fechamento da jornada. */}
          <button onClick={() => router.push('/dashboard/gestor/engajamento')}
            className="text-[11px] font-bold text-brand-300 hover:text-brand-200 flex items-center gap-1">
            Engajamento do time <ArrowRight size={11} />
          </button>
          {data.scope !== 'rh' && (
            <button onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
              className="text-[11px] font-bold text-brand-300 hover:text-brand-200 flex items-center gap-1">
              {t('titles.fullEvolution')} <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Aviso: gestor sem liderados vinculados */}
      {semLiderados && (
        <div className="mb-5 rounded-2xl p-4 border border-amber-400/25"
          style={{ background: 'rgba(251,191,36,0.05)' }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] font-bold text-amber-200 mb-1">
                {t('noReports.title')}
              </p>
              <p className="text-[11px] text-amber-100/75 leading-relaxed">
                {t.rich('noReports.body', {
                  code: (chunks) => <code className="text-amber-200">{chunks}</code>,
                  em: (chunks) => <em>{chunks}</em>,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hero — 4 KPIs */}
      <div className={`grid grid-cols-2 ${data.scope === 'rh' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3 mb-4`}>
        <KpiCard
          icon={Users}
          label={data.scope === 'rh' ? t('kpis.people') : t('kpis.led')}
          valor={k.liderados.total}
          subtitulo={t('kpis.inTrack', { count: k.liderados.em_trilha, without: k.liderados.sem_trilha })}
        />
        <KpiCard
          icon={TrendingUp}
          label={t('kpis.inProgress')}
          valor={k.em_andamento.count}
          subtitulo={k.em_andamento.distribuicao_semanas.length > 0
            ? k.em_andamento.distribuicao_semanas
                .map((d) => t('kpis.weekCount', { count: d.pessoas, week: d.semana }))
                .join(' · ')
            : t('kpis.noActiveTrack')}
        />
        {/* Checkpoint e a leitura que o GESTOR faz do liderado nas semanas 5 e
            10 — o RH nao responde nenhum, entao o card ficava em 0 quase o ano
            inteiro. Numero que nao se move nao e indicador, e ocupa o lugar de
            um que se move. O sinal de engajamento do RH esta logo abaixo, nos
            cards de acao. */}
        {data.scope !== 'rh' && (
        <KpiCard
          icon={ClipboardCheck}
          label={t('kpis.checkpoints')}
          valor={k.checkpoints.pendentes}
          subtitulo={t('kpis.answered', { count: k.checkpoints.respondidos, plural: k.checkpoints.respondidos === 1 ? '' : 's' })}
          acento={k.checkpoints.pendentes > 0 ? 'amber' : 'gray'}
          sufixo={k.checkpoints.pendentes > 0 ? t('kpis.pending') : ''}
        />
        )}
        <KpiCard
          icon={Activity}
          label={t('kpis.weeklyActivity')}
          valor={k.atividade_semana.ativos}
          subtitulo={t('kpis.activeLastDays', { total: k.atividade_semana.total })}
          acento={k.atividade_semana.ativos > 0 ? 'cyan' : 'gray'}
          sufixo={t('kpis.ofTotal', { total: k.atividade_semana.total })}
        />
      </div>

      {/* O relatório do gestor deixa de ser uma peça estática: a leitura
          executiva entra no fluxo onde ele já acompanha a equipe. O PDF segue
          disponível como evidência, aberto dentro da própria tela. */}
      {data.scope === 'gestor' && data.reportDashboard && (
        <ManagerReportDashboard
          report={data.reportDashboard}
          locale={locale}
          t={t}
          onOpenPdf={() => setReportReaderOpen(true)}
        />
      )}

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-400/25 overflow-hidden"
          style={{ background: 'rgba(251,191,36,0.05)' }}>
          <div className="px-4 py-2.5 border-b border-amber-400/15 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-amber-300">
              {t('titles.attentionSignals', { count: alertas.length })}
            </p>
          </div>
          <ul className="px-4 py-2 space-y-1.5">
            {alertas.map((a) => (
              <li key={a.tipo} className="flex items-start gap-2 text-[12px] text-amber-100/85">
                <span className="text-amber-400 mt-0.5">·</span>
                <span>{a.mensagem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seção 1 — Ação esta semana (checkpoints pendentes).
          O RH não avalia ninguém: checkpoint é a leitura que o GESTOR faz do
          liderado nas semanas 5 e 10, então para ele o card nascia vazio e
          ficava vazio. No lugar, as ações que movem engajamento. */}
      {data.scope === 'rh' ? (
        <AcoesRH equipe={data.equipe || []} onFocar={setFiltroEquipe} />
      ) : (
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-white text-base font-bold flex items-center gap-2">
            <ClipboardCheck size={16} className="text-brand-400" /> {t('titles.weeklyAction')}
          </h2>
          {cps.length > 0 && <span className="text-[11px] text-white/50">{t('pendingCount', { count: cps.length, plural: cps.length === 1 ? '' : 's' })}</span>}
        </div>

        {cps.length === 0 ? (
          <GlassCard>
            <p className="text-[12px] text-white/55 leading-relaxed text-center py-3">
              {t('emptyAction')}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {cps.map((cp) => (
              <CheckpointCard key={`${cp.trilhaId}-${cp.semana}`} cp={cp}
                onAvaliar={(av) => setModal({ cp, avaliacao: av })}
                avaliando={avaliando === `${cp.trilhaId}-${cp.semana}`} />
            ))}
          </div>
        )}
      </section>
      )}

      {/* Seção 2 — Equipe em trilha (tabela com filtros) */}
      <EquipeSection
        equipe={data.equipe || []}
        fonteExterna={data.empresaPerfilExternoFonte}
        filtro={filtroEquipe}
        setFiltro={setFiltroEquipe}
      />

      {/* Seção 3 — Mapa de perfis comportamentais (DISC ou OPQ32) */}
      <PerfisSection perfis={data.perfis || []} fonteExterna={data.empresaPerfilExternoFonte} />

      {/* Seção 4 — Timeline próximos eventos */}
      <TimelineSection timeline={data.timeline || []} />

      {/* Modal de avaliação */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setModal(null)}>
          <div className="w-full max-w-[480px] rounded-2xl border border-white/[0.08] p-5"
            style={{ background: '#0A1D35' }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <p className="text-[10px] tracking-[0.2em] uppercase font-mono text-brand-300 mb-1">
                {t('modal.eyebrow', { week: modal.cp.semana })}
              </p>
              <h3 className="text-white text-base font-bold">{modal.cp.colab}</h3>
              <p className="text-[11px] text-white/55 mt-0.5">
                {modal.cp.competenciaFoco || t('modal.noFocus')}
              </p>
              <p className="text-[11px] mt-3" style={{
                color: modal.avaliacao === 'evoluindo' ? '#34D399'
                  : modal.avaliacao === 'estagnado' ? '#FCD34D' : '#F87171',
              }}>
                {t('modal.evaluation')} <strong>{t(`evaluation.${modal.avaliacao}`)}</strong>
              </p>
            </div>

            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={modal.avaliacao === 'evoluindo' ? t('modal.observation') : t('modal.observationHelp')}
              rows={3}
              className="w-full rounded-lg border border-white/[0.08] px-3 py-2 text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-brand-400/40"
              style={{ background: '#091D35' }}
            />

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setModal(null); setObservacao(''); }}
                className="px-3 py-1.5 rounded-lg text-[11px] text-white/60 hover:text-white">
                {t('modal.cancel')}
              </button>
              <button onClick={aplicarAvaliacao} disabled={!!avaliando}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-brand-400/15 text-brand-300 border border-brand-400/30 hover:bg-brand-400/25 disabled:opacity-50">
                {avaliando ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                {t('modal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportReaderOpen && data.reportDashboard && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t('reportDashboard.pdfTitle')}
          onClick={() => setReportReaderOpen(false)}
        >
          <div
            className="flex h-[min(92dvh,980px)] w-full max-w-[1100px] flex-col overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#071829] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-3 md:px-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-300">{t('reportDashboard.pdfEyebrow')}</p>
                <h2 className="mt-0.5 text-xl text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>{t('reportDashboard.pdfTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setReportReaderOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] text-white/50 transition hover:bg-white/[0.06] hover:text-white"
                aria-label={t('reportDashboard.closePdf')}
              >
                <X size={17} />
              </button>
            </header>
            <div className="min-h-0 flex-1 p-2 md:p-4">
              <InAppPdfDocument
                src={data.reportDashboard.pdfUrl}
                title={t('reportDashboard.pdfTitle')}
                loadingLabel={t('reportDashboard.pdfLoading')}
                errorLabel={t('reportDashboard.pdfError')}
                retryLabel={t('reportDashboard.pdfRetry')}
              />
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

// ── Componentes auxiliares ──

type ManagerDashboardReport = NonNullable<GestorHomeData['reportDashboard']>;

function ManagerReportDashboard({
  report,
  locale,
  t,
  onOpenPdf,
}: {
  report: ManagerDashboardReport;
  locale: string;
  t: any;
  onOpenPdf: () => void;
}) {
  const insight = report.insight;
  const generatedAt = report.generatedAt
    ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(report.generatedAt))
    : null;

  return (
    <section className="mb-6 overflow-hidden rounded-[24px] border border-violet-400/20" style={{ background: 'linear-gradient(145deg, rgba(32,40,78,.78), rgba(9,29,51,.96) 58%)' }}>
      <header className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.22em] text-violet-300"><Sparkles size={12} /> {t('reportDashboard.eyebrow')}</p>
          <h2 className="mt-1 text-[25px] leading-none text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>{t('reportDashboard.title')}</h2>
          {generatedAt && <p className="mt-1 font-mono text-[9px] text-white/30">{t('reportDashboard.updated', { date: generatedAt })}</p>}
        </div>
        <button type="button" onClick={onOpenPdf} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-xl border border-violet-300/20 bg-violet-300/[0.07] px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-200 transition hover:bg-violet-300/[0.12] sm:self-auto">
          <FileText size={13} /> {t('reportDashboard.openPdf')}
        </button>
      </header>

      <div className="p-4 md:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
          <div className="rounded-[20px] border border-white/[0.07] bg-black/10 p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-300">{t('reportDashboard.reading')}</p>
            <p className="mt-2 text-[21px] leading-[1.28] text-white" style={{ fontFamily: 'var(--font-serif, "Instrument Serif", serif)', fontStyle: 'italic' }}>{insight.executive.reading || '—'}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-300">{t('reportDashboard.strength')}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/58">{insight.executive.strength || '—'}</p>
              </div>
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-amber-300">{t('reportDashboard.attention')}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/58">{insight.executive.risk || '—'}</p>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[20px] border border-violet-400/20 bg-violet-400/[0.07] p-5">
            <Target size={52} className="absolute -right-2 -top-2 text-violet-300/[0.08]" />
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-violet-300">{t('reportDashboard.nextDecision')}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">{insight.actions.primary || t('reportDashboard.noPrimaryAction')}</p>
            {insight.actions.thisWeek.length > 0 && (
              <div className="mt-5 border-t border-violet-300/15 pt-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-white/35">{t('reportDashboard.thisWeek')}</p>
                <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-white/55">
                  {insight.actions.thisWeek.map((item) => <li key={item} className="flex gap-2"><ArrowRight size={12} className="mt-0.5 shrink-0 text-violet-300" />{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        {insight.competencies.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2"><BarChart3 size={14} className="text-brand-400" /><h3 className="text-xs font-bold text-white">{t('reportDashboard.competencies')}</h3></div>
            <div className="grid gap-2 md:grid-cols-2">
              {insight.competencies.slice(0, 2).map((competency) => {
                const total = competency.distribution.reduce((sum, item) => sum + item.people, 0);
                return (
                  <div key={competency.competency} className="rounded-[18px] border border-white/[0.07] bg-black/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12px] font-bold leading-snug text-white/80">{competency.competency}</p>
                      <span className="shrink-0 font-mono text-[10px] text-brand-300">{competency.average != null ? competency.average.toFixed(1) : '—'} / 4</span>
                    </div>
                    <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                      {competency.distribution.map((item, index) => (
                        <div key={item.level} title={`N${item.level}: ${item.people}`} style={{ width: `${total > 0 ? (item.people / total) * 100 : 0}%`, background: ['#FB7185', '#FBBF24', '#22D3EE', '#34D399'][index] }} />
                      ))}
                    </div>
                    {competency.pattern && <p className="mt-3 text-[11px] leading-relaxed text-white/45">{competency.pattern}</p>}
                    {competency.managerAction && <p className="mt-2 flex gap-2 text-[11px] leading-relaxed text-brand-200/65"><ArrowRight size={12} className="mt-0.5 shrink-0" />{competency.managerAction}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(insight.highlights.length > 0 || insight.attention.length > 0) && (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <div className="rounded-[18px] border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-300"><TrendingUp size={12} /> {t('reportDashboard.highlights')}</p>
              <div className="mt-3 space-y-3">
                {insight.highlights.map((person) => <div key={`${person.person}-${person.competency}`}><p className="text-xs font-bold text-white/80">{person.person}</p><p className="mt-0.5 text-[10px] text-emerald-100/45">{person.competency}{person.level ? ` · N${person.level}` : ''}</p>{person.reason && <p className="mt-1 text-[11px] leading-relaxed text-white/45">{person.reason}</p>}</div>)}
                {insight.highlights.length === 0 && <p className="text-[11px] text-white/35">—</p>}
              </div>
            </div>
            <div className="rounded-[18px] border border-amber-300/15 bg-amber-300/[0.04] p-4">
              <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-amber-300"><AlertTriangle size={12} /> {t('reportDashboard.attentionPeople')}</p>
              <div className="mt-3 space-y-3">
                {insight.attention.map((person) => <div key={`${person.person}-${person.competency}`}><p className="text-xs font-bold text-white/80">{person.person}</p><p className="mt-0.5 text-[10px] text-amber-100/45">{person.competency}{person.level ? ` · N${person.level}` : ''}</p>{person.reason && <p className="mt-1 text-[11px] leading-relaxed text-white/45">{person.reason}</p>}</div>)}
                {insight.attention.length === 0 && <p className="text-[11px] text-white/35">—</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function KpiCard({
  icon: Icon, label, valor, subtitulo, acento = 'gray', sufixo,
}: {
  icon: any;
  label: string;
  valor: number;
  subtitulo: string;
  acento?: 'gray' | 'cyan' | 'amber' | 'green';
  sufixo?: string;
}) {
  const cor = acento === 'cyan' ? '#34c5cc'
    : acento === 'amber' ? '#FCD34D'
    : acento === 'green' ? '#34D399'
    : '#cbd5e1';
  return (
    <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={12} style={{ color: cor }} />
        <p className="text-[10px] tracking-[0.18em] uppercase font-mono text-white/45">{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: cor }}>
        {valor}
        {sufixo && <span className="text-[10px] text-white/40 font-mono ml-1.5">{sufixo}</span>}
      </p>
      <p className="text-[10px] text-white/45 leading-snug mt-1">{subtitulo}</p>
    </div>
  );
}

function CheckpointCard({
  cp, onAvaliar, avaliando,
}: {
  cp: CheckpointPendenteDetalhado;
  onAvaliar: (av: 'evoluindo' | 'estagnado' | 'regredindo') => void;
  avaliando: boolean;
}) {
  const t = useTranslations('ManagerDashboard');
  const inicial = cp.colab.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');
  const corDias = cp.diasPendente >= 7 ? 'rgba(248,113,113,0.18)'
    : cp.diasPendente >= 3 ? 'rgba(252,211,77,0.18)'
    : 'rgba(255,255,255,0.06)';
  const textoDias = cp.diasPendente >= 7 ? 'text-red-300'
    : cp.diasPendente >= 3 ? 'text-amber-300'
    : 'text-white/60';

  return (
    <div className="rounded-xl border border-white/[0.06] p-3 flex items-center gap-3"
      style={{ background: '#0F2A4A' }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
        style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)' }}>
        {inicial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-white truncate">{cp.colab}</p>
          <span className="text-[9px] font-mono text-brand-400/70 bg-brand-400/10 px-1.5 py-0.5 rounded">
            {t('checkpoint.weekShort', { week: cp.semana })}
          </span>
        </div>
        <p className="text-[11px] text-white/55 truncate">
          {cp.cargo || t('checkpoint.noRole')} {cp.competenciaFoco && <>· <span className="text-brand-300/70">{cp.competenciaFoco}</span></>}
        </p>
      </div>
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${textoDias}`}
        style={{ background: corDias }}>
        {cp.diasPendente === 0 ? t('checkpoint.today') : `${cp.diasPendente}d`}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <AvaliarBtn av="evoluindo" onClick={() => onAvaliar('evoluindo')} disabled={avaliando} />
        <AvaliarBtn av="estagnado" onClick={() => onAvaliar('estagnado')} disabled={avaliando} />
        <AvaliarBtn av="regredindo" onClick={() => onAvaliar('regredindo')} disabled={avaliando} />
      </div>
    </div>
  );
}

function AvaliarBtn({
  av, onClick, disabled,
}: {
  av: 'evoluindo' | 'estagnado' | 'regredindo';
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations('ManagerDashboard');
  const cfg = av === 'evoluindo'
    ? { color: '#34D399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.3)', label: '↑' }
    : av === 'estagnado'
    ? { color: '#FCD34D', bg: 'rgba(252,211,77,0.1)', border: 'rgba(252,211,77,0.3)', label: '→' }
    : { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', label: '↓' };
  return (
    <button onClick={onClick} disabled={disabled}
      title={t(`evaluation.${av}`)}
      className="w-7 h-7 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40"
      style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </button>
  );
}

// ════════════════ Etapa 2 — Equipe em trilha ════════════════

/**
 * As ações do RH, no lugar do card de checkpoints.
 *
 * "Ação esta semana" é do GESTOR: checkpoint é a avaliação que ele faz do
 * liderado nas semanas 5 e 10. Para o RH esse card nasce vazio e fica vazio —
 * ele não avalia ninguém. O que ele pode fazer para mover engajamento é
 * destravar quem parou, e cada degrau do funil tem uma ação diferente.
 *
 * Sai da MESMA lista que a tabela abaixo (`equipe`), não de uma contagem
 * paralela — e clicar filtra a tabela, para o número virar nomes. Ordena por
 * tamanho: o maior lote é onde uma cobrança rende mais.
 */
function AcoesRH({ equipe, onFocar }: { equipe: any[]; onFocar: (f: FiltroEquipe) => void }) {
  const t = useTranslations('ManagerDashboard');
  const candidatos: { chave: FiltroEquipe; count: number; icon: any }[] = [
    { chave: 'sem_perfil', count: equipe.filter((e) => e.motivoSemTrilha === 'sem_perfil').length, icon: Brain },
    { chave: 'sem_mapeamento', count: equipe.filter((e) => e.motivoSemTrilha === 'sem_mapeamento').length, icon: ClipboardCheck },
    { chave: 'atrasada', count: equipe.filter((e) => e.atrasada === true).length, icon: CalendarClock },
    { chave: 'aguardando_geracao', count: equipe.filter((e) => e.motivoSemTrilha === 'aguardando_geracao').length, icon: Rocket },
  ];
  const acoes = candidatos.filter((a) => a.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);

  return (
    <section className="mb-6">
      <h2 className="text-white text-base font-bold flex items-center gap-2 mb-2">
        <Target size={16} className="text-brand-400" /> {t('titles.rhActions')}
      </h2>
      {acoes.length === 0 ? (
        <GlassCard>
          <p className="text-[12px] text-white/55 leading-relaxed text-center py-3">{t('actions.empty')}</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {acoes.map(({ chave, count, icon: Icon }) => (
            <button key={chave}
              onClick={() => {
                onFocar(chave);
                document.getElementById('equipe')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="w-full text-left rounded-xl border border-white/[0.07] px-4 py-3 flex items-start gap-3 hover:bg-white/[0.03] transition-colors"
              style={{ background: '#0F2A4A' }}>
              <div className="w-9 h-9 rounded-lg bg-brand-400/10 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-brand-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white">{t(`actions.${chave}.title`)}</p>
                <p className="text-[11px] text-white/55 leading-relaxed mt-0.5">{t(`actions.${chave}.body`, { count })}</p>
              </div>
              <span className="text-[15px] font-bold text-brand-300 tabular-nums shrink-0">{count}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Filtros por STATUS (os chips) + os por MOTIVO, que só chegam pelos cards de
 * ação. As duas listas são a fonte do TIPO e das checagens — repetir os
 * literais aqui foi o que o `status-literal-guard` recusou, com razão: eram
 * quatro cópias da mesma enumeração num arquivo só.
 */
const FILTROS_STATUS = ['todos', 'em_andamento', 'sem_trilha', 'concluida'] as const;
const FILTROS_ACAO = ['sem_perfil', 'sem_mapeamento', 'aguardando_geracao', 'atrasada'] as const;
export type FiltroEquipe = (typeof FILTROS_STATUS)[number] | (typeof FILTROS_ACAO)[number];

function aplicarFiltro(equipe: any[], filtro: FiltroEquipe) {
  if (filtro === 'todos') return equipe;
  if (filtro === 'atrasada') return equipe.filter((e) => e.atrasada === true);
  if (filtro === 'sem_perfil' || filtro === 'sem_mapeamento' || filtro === 'aguardando_geracao') {
    return equipe.filter((e) => e.motivoSemTrilha === filtro);
  }
  return equipe.filter((e) => e.status === filtro);
}

function EquipeSection({ equipe, fonteExterna, filtro, setFiltro }: {
  equipe: any[]; fonteExterna?: string | null;
  filtro: FiltroEquipe; setFiltro: (f: FiltroEquipe) => void;
}) {
  const t = useTranslations('ManagerDashboard');
  const router = useRouter();
  const filtrados = aplicarFiltro(equipe, filtro);
  // Filtro vindo de um card de ação não tem chip próprio — sem este, a lista
  // aparece recortada e nada na tela diz por quê (nem como voltar).
  const filtroDeAcao = (FILTROS_ACAO as readonly string[]).includes(filtro);
  if (equipe.length === 0) return null;
  return (
    <section className="mb-6" id="equipe">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-white text-base font-bold">{t('titles.teamTrack')}</h2>
        <div className="flex gap-1 p-1 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
          {filtroDeAcao && (
            <button onClick={() => setFiltro('todos')}
              className="px-2.5 py-1 rounded text-[10px] font-bold bg-amber-400/15 text-amber-300">
              {t(`actions.${filtro}.chip`)} ✕
            </button>
          )}
          {FILTROS_STATUS.map((f) => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                filtro === f ? 'bg-brand-400/15 text-brand-300' : 'text-white/55 hover:text-white'
              }`}>
              {f === 'todos' ? t('filters.all') : f === 'em_andamento' ? t('filters.inProgress') : f === 'sem_trilha' ? t('filters.noTrack') : t('filters.completed')}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        {filtrados.map((e, i) => (
          <button key={e.colabId}
            type="button"
            disabled={e.status === 'sem_trilha'}
            onClick={() => router.push(`/dashboard/temporada?colaborador=${encodeURIComponent(e.colabId)}&origem=gestor`)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors enabled:hover:bg-white/[0.04] disabled:cursor-default ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #34c5cc, #2aa8ae)' }}>
              {e.colab.split(/\s+/).slice(0, 2).map((s: string) => s[0]?.toUpperCase()).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-white font-bold truncate">{e.colab}</div>
              <div className="text-[10px] text-white/45 truncate">
                {e.cargo || '—'}
                {/* Turma como COLUNA, não filtro: o gestor pensa em pessoas, e
                    liderados de safras diferentes convivem na mesma lista. Sem
                    isto, duas jornadas distintas parecem uma só. */}
                {e.turma && <> · <span className="text-white/60">{e.turma}</span></>}
                {e.competenciaFoco && <> · <span className="text-brand-300/70">{e.competenciaFoco}</span></>}
                {/* "SEM TRILHA" sozinho não diz o que fazer — e as causas pedem
                    ações opostas (fazer o mapeamento comportamental × rodar a
                    avaliação). Quando a pendência é nossa, o texto diz isso em
                    vez de cobrar a pessoa. */}
                {e.motivoSemTrilha && (
                  <> · <span style={{ color: e.motivoSemTrilha === 'aguardando_geracao' ? 'rgba(154,226,230,0.75)' : 'rgba(252,211,77,0.85)' }}>
                    {e.motivoSemTrilha === 'sem_perfil' && fonteExterna
                      ? t('team.reason.sem_perfil_externo', { fonte: fonteExterna === 'opq32' ? 'OPQ32' : fonteExterna })
                      : t(`team.reason.${e.motivoSemTrilha}`)}
                  </span></>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill status={e.status} />
              {e.semana != null && (
                <div className="hidden sm:block w-20">
                  <div className="text-[9px] text-white/45 mb-0.5 text-right">{t('team.weekProgress', { week: e.semana })}</div>
                  <div className="h-1 rounded-full overflow-hidden bg-white/[0.06]">
                    {/* D1: o TETO da barra é o programa da pessoa. Com 14 fixo,
                        uma jornada de 7 semanas nunca passa de 50% — a barra diz
                        "metade" para quem terminou. */}
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (e.semana / (e.totalSemanas || 14)) * 100)}%`, background: '#34c5cc' }} />
                  </div>
                </div>
              )}
              {e.delta != null && (
                <span className="text-[10px] font-mono font-bold tabular-nums"
                  style={{ color: e.delta > 0 ? '#34D399' : e.delta < 0 ? '#F87171' : '#9ae2e6' }}>
                  {e.delta > 0 ? '+' : ''}{e.delta}
                </span>
              )}
              {e.status !== 'sem_trilha' && <ChevronRight size={15} className="text-brand-300/55" />}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const t = useTranslations('ManagerDashboard');
  const cfg = {
    em_andamento: { label: t('status.em_andamento'), color: '#34c5cc', bg: 'rgba(52,197,204,0.12)' },
    pausada:      { label: t('status.pausada'),      color: '#FCD34D', bg: 'rgba(252,211,77,0.12)' },
    concluida:    { label: t('status.concluida'),    color: '#34D399', bg: 'rgba(52,211,153,0.12)' },
    sem_trilha:   { label: t('status.sem_trilha'),   color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' },
    arquivada:    { label: t('status.arquivada'),    color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' },
  }[status] || { label: status, color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-[0.05em]"
      style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ════════════════ Etapa 3 — Mapa de perfis ════════════════

function PerfisSection({ perfis, fonteExterna }: { perfis: any[]; fonteExterna?: string | null }) {
  const t = useTranslations('ManagerDashboard');
  const router = useRouter();

  if (perfis.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-white text-base font-bold mb-3">
        {t('titles.profileMap', { type: fonteExterna === 'opq32' ? 'OPQ32' : t('profiles.behavioral') })}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {perfis.map((p) => (
          <button
            key={p.colabId}
            type="button"
            onClick={() => router.push(`/dashboard/perfil-comportamental?colaborador=${encodeURIComponent(p.colabId)}&origem=gestor`)}
            aria-label={t('profiles.openProfileFor', { name: p.colab })}
            title={t('profiles.openProfile')}
            className="w-full cursor-pointer rounded-xl border border-white/[0.06] p-3 text-left transition-colors hover:border-brand-400/40 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] text-white font-bold truncate">{p.colab}</p>
                <p className="text-[10px] text-white/45 truncate mb-2">{p.cargo || '—'}</p>
              </div>
              <ChevronRight size={14} className="mt-0.5 shrink-0 text-brand-300/65" />
            </div>
            {p.fonte === 'sem_perfil' && (
              <p className="text-[10px] text-white/35 italic">{t('profiles.noProfile')}</p>
            )}
            {p.fonte === 'disc' && (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold tabular-nums" style={{ color: '#34c5cc', fontFamily: 'var(--font-serif, "Instrument Serif", serif)' }}>
                  {p.letraDom || '—'}
                </span>
                <span className="text-[10px] text-white/45">{t('profiles.discDominant')}</span>
              </div>
            )}
            {p.fonte === 'opq32' && (
              <div className="space-y-1">
                {(p.altas || []).slice(0, 2).map((a: any) => (
                  <div key={a.codigo} className="flex items-center gap-1 text-[10px]">
                    <span className="text-emerald-300 font-mono w-7">{a.sten}</span>
                    <span className="text-white/75 truncate">{a.nome}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// ════════════════ Etapa 4 — Timeline ════════════════

function TimelineSection({ timeline }: { timeline: any[] }) {
  const t = useTranslations('ManagerDashboard');
  const locale = useLocale();
  if (timeline.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="text-white text-base font-bold mb-3">{t('titles.nextWeeks')}</h2>
      <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
        {timeline.map((ev, i) => {
          const dt = new Date(ev.data);
          const dias = Math.ceil((dt.getTime() - Date.now()) / (24 * 3600 * 1000));
          return (
            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
              <div className="text-center shrink-0 w-12">
                <div className="text-[10px] text-white/45 uppercase">
                  {dt.toLocaleDateString(locale, { month: 'short' })}
                </div>
                <div className="text-base font-bold text-white tabular-nums">
                  {dt.getDate()}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-white font-bold truncate">{ev.colab}</div>
                <div className="text-[10px] text-white/55 truncate">{ev.detalhe}</div>
              </div>
              <span className="text-[10px] text-white/55 font-mono shrink-0">
                {t('timeline.inDays', { value: dias === 0 ? t('timeline.today') : dias === 1 ? t('timeline.oneDay') : `${dias}d` })}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
