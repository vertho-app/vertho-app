'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Users, AlertTriangle, ChevronRight, Loader2, ArrowRight,
  Calendar, TrendingUp, Activity, ClipboardCheck, FileText,
} from 'lucide-react';
import { PageContainer, GlassCard } from '@/components/page-shell';
import { getGestorHomeData, getPerfilExternoPdfUrl, type GestorHomeData, type CheckpointPendenteDetalhado } from './actions';
import { salvarCheckpointGestor } from './equipe-evolucao/actions';

export default function GestorHomePage() {
  const t = useTranslations('ManagerDashboard');
  const router = useRouter();
  const [data, setData] = useState<GestorHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [avaliando, setAvaliando] = useState<string | null>(null);
  const [modal, setModal] = useState<{ cp: CheckpointPendenteDetalhado; avaliacao: 'evoluindo' | 'estagnado' | 'regredindo' } | null>(null);
  const [observacao, setObservacao] = useState('');

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
            <Users size={22} className="text-brand-400" /> {data.scope === 'tutor' ? t('titles.tutor') : t('titles.team')}
          </h1>
        </div>
        <button onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
          className="text-[11px] font-bold text-brand-300 hover:text-brand-200 flex items-center gap-1">
          {t('titles.fullEvolution')} <ArrowRight size={11} />
        </button>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          icon={Users}
          label={t('kpis.led')}
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
        <KpiCard
          icon={ClipboardCheck}
          label={t('kpis.checkpoints')}
          valor={k.checkpoints.pendentes}
          subtitulo={t('kpis.answered', { count: k.checkpoints.respondidos, plural: k.checkpoints.respondidos === 1 ? '' : 's' })}
          acento={k.checkpoints.pendentes > 0 ? 'amber' : 'gray'}
          sufixo={k.checkpoints.pendentes > 0 ? t('kpis.pending') : ''}
        />
        <KpiCard
          icon={Activity}
          label={t('kpis.weeklyActivity')}
          valor={k.atividade_semana.ativos}
          subtitulo={t('kpis.activeLastDays', { total: k.atividade_semana.total })}
          acento={k.atividade_semana.ativos > 0 ? 'cyan' : 'gray'}
          sufixo={t('kpis.ofTotal', { total: k.atividade_semana.total })}
        />
      </div>

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

      {/* Seção 1 — Ação esta semana (checkpoints pendentes) */}
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

      {/* Seção 2 — Equipe em trilha (tabela com filtros) */}
      <EquipeSection equipe={data.equipe || []} fonteExterna={data.empresaPerfilExternoFonte} />

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
    </PageContainer>
  );
}

// ── Componentes auxiliares ──

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

function EquipeSection({ equipe, fonteExterna }: { equipe: any[]; fonteExterna?: string | null }) {
  const t = useTranslations('ManagerDashboard');
  const router = useRouter();
  const [filtro, setFiltro] = useState<'todos' | 'em_andamento' | 'sem_trilha' | 'concluida'>('todos');
  const filtrados = filtro === 'todos' ? equipe : equipe.filter((e) => e.status === filtro);
  if (equipe.length === 0) return null;
  return (
    <section className="mb-6">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-white text-base font-bold">{t('titles.teamTrack')}</h2>
        <div className="flex gap-1 p-1 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
          {(['todos', 'em_andamento', 'sem_trilha', 'concluida'] as const).map((f) => (
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
            onClick={() => router.push('/dashboard/gestor/equipe-evolucao')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
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
  const [abrindo, setAbrindo] = useState<string | null>(null);
  if (perfis.length === 0) return null;

  async function abrirPdf(colabId: string) {
    setAbrindo(colabId);
    // Abre a aba ANTES do await: popup aberto depois da resposta assíncrona é
    // bloqueado pelo navegador (perde o gesto do usuário).
    const aba = window.open('', '_blank');
    const r = await getPerfilExternoPdfUrl(colabId);
    setAbrindo(null);
    if (r.error || !r.url) {
      aba?.close();
      toast.error(r.error || t('profiles.pdfError'));
      return;
    }
    if (aba) aba.location.href = r.url;
    else window.open(r.url, '_blank');
  }

  return (
    <section className="mb-6">
      <h2 className="text-white text-base font-bold mb-3">
        {t('titles.profileMap', { type: fonteExterna === 'opq32' ? 'OPQ32' : t('profiles.behavioral') })}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {perfis.map((p) => {
          const Card = p.temPdf ? 'button' : 'div';
          return (
          <Card key={p.colabId}
            {...(p.temPdf ? {
              type: 'button' as const,
              onClick: () => abrirPdf(p.colabId),
              disabled: abrindo === p.colabId,
              'aria-label': t('profiles.openPdfFor', { name: p.colab }),
              title: t('profiles.openPdf'),
            } : {})}
            className={`rounded-xl border border-white/[0.06] p-3 text-left w-full ${
              p.temPdf ? 'cursor-pointer transition-colors hover:border-brand-400/40 hover:bg-white/[0.05] disabled:opacity-60' : ''
            }`}
            style={{ background: 'rgba(255,255,255,0.025)' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] text-white font-bold truncate">{p.colab}</p>
                <p className="text-[10px] text-white/45 truncate mb-2">{p.cargo || '—'}</p>
              </div>
              {p.temPdf && (
                abrindo === p.colabId
                  ? <Loader2 size={13} className="animate-spin text-brand-300 shrink-0 mt-0.5" />
                  : <FileText size={13} className="text-brand-300/70 shrink-0 mt-0.5" />
              )}
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
                {(p.baixas || []).slice(0, 1).map((b: any) => (
                  <div key={b.codigo} className="flex items-center gap-1 text-[10px]">
                    <span className="text-red-300 font-mono w-7">{b.sten}</span>
                    <span className="text-white/55 truncate">{b.nome}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
          );
        })}
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
