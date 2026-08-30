'use client';
import { toast } from 'sonner';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, AlertCircle, Download, Zap, Users, Anchor, ListChecks, Sparkles, Volume2, Send, FileText, ArrowLeft } from 'lucide-react';
import { loadPerfilCIS, loadPerfilCISGestor, gerarInsightsExecutivos, getMeuPerfilExternoPdfUrl } from './perfil-comportamental-actions';
import { getPerfilExternoPdfUrl as getPerfilExternoPdfUrlGestor } from '../gestor/actions';
import { ouvirDevolutivaComportamental, ouvirDevolutivaComportamentalGestor, enviarDevolutivaWhatsApp } from './relatorio/relatorio-actions';
import {
  loadBehavioralReport,
  loadBehavioralReportGestor,
  baixarRelatorioComportamentalPdf,
  baixarRelatorioComportamentalPdfGestor,
} from './relatorio/relatorio-actions';
import { PageContainer, PageHero } from '@/components/page-shell';
import { intensidadeQualitativa } from '@/lib/disc-arquetipos';

const COMP_GROUPS = {
  D: [
    { label: 'Ousadia', key: 'comp_ousadia' },
    { label: 'Comando', key: 'comp_comando' },
    { label: 'Objetividade', key: 'comp_objetividade' },
    { label: 'Assertividade', key: 'comp_assertividade' },
  ],
  I: [
    { label: 'Persuasão', key: 'comp_persuasao' },
    { label: 'Extroversão', key: 'comp_extroversao' },
    { label: 'Entusiasmo', key: 'comp_entusiasmo' },
    { label: 'Sociabilidade', key: 'comp_sociabilidade' },
  ],
  S: [
    { label: 'Empatia', key: 'comp_empatia' },
    { label: 'Paciência', key: 'comp_paciencia' },
    { label: 'Persistência', key: 'comp_persistencia' },
    { label: 'Planejamento', key: 'comp_planejamento' },
  ],
  C: [
    { label: 'Organização', key: 'comp_organizacao' },
    { label: 'Detalhismo', key: 'comp_detalhismo' },
    { label: 'Prudência', key: 'comp_prudencia' },
    { label: 'Concentração', key: 'comp_concentracao' },
  ],
};

// Paleta sem vermelho: D=amarelo, I=cinza, S=verde, C=azul
const DISC_COLORS = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function Bar({ label, value, max, color }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        <span className="text-sm font-extrabold" style={{ color }}>{Math.round(value || 0)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, (value || 0) / (max || 100) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function radarPoints(pct) {
  const r = pct, cx = 100, cy = 100;
  return [
    `${cx},${cy - r}`,
    `${cx + r},${cy}`,
    `${cx},${cy + r}`,
    `${cx - r},${cy}`,
  ].join(' ');
}

function discRadarPoints(disc) {
  const cx = 100, cy = 100;
  const scale = v => Math.min(100, Math.max(0, v || 0));
  return [
    `${cx},${cy - scale(disc.D)}`,
    `${cx + scale(disc.I)},${cy}`,
    `${cx},${cy + scale(disc.S)}`,
    `${cx - scale(disc.C)},${cy}`,
  ].join(' ');
}

// ── Análise Narrativa (ex-relatório) ─────────────────────────────────────
const DISC_QUAD = {
  D: { bar: '#EAB308', bg: 'rgba(234,179,8,0.10)', text: '#FDE68A' },
  I: { bar: '#94A3B8', bg: 'rgba(148,163,184,0.10)', text: '#CBD5E1' },
  S: { bar: '#10B981', bg: 'rgba(16,185,129,0.10)', text: '#6EE7B7' },
  C: { bar: '#3B82F6', bg: 'rgba(59,130,246,0.10)', text: '#93C5FD' },
};

function DiscBars({ scores }: { scores: any }) {
  return (
    <div className="space-y-2">
      {['D', 'I', 'S', 'C'].map(d => {
        const v = Math.max(0, Math.min(100, scores[d] || 0));
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-4 text-xs font-extrabold text-gray-400">{d}</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: DISC_QUAD[d].bar }} />
            </div>
            <span className="w-7 text-right text-[11px] font-bold text-gray-300">{Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuadrantCard({ letter, title, n, traco, descricao, t }) {
  const q = DISC_QUAD[letter];
  return (
    <div className="rounded-xl p-4 border" style={{ background: q.bg, borderColor: 'rgba(255,255,255,0.08)', borderLeft: `4px solid ${q.bar}` }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-base font-extrabold text-white mt-0.5">{traco || '—'}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-[9px] text-gray-500">{t('labels.natural')}</p>
          <p className="text-xl font-black" style={{ color: q.text }}>{Math.round(n)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{descricao}</p>
    </div>
  );
}

function AnaliseNarrativa({ data, t }) {
  if (!data) return null;
  const { raw, texts } = data;
  if (!raw || !texts) return null;

  return (
    <div className="space-y-5">
      {/* Síntese */}
      <div className="rounded-2xl p-5 border border-brand-400/20" style={{ background: 'rgba(13,148,136,0.08)' }}>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-400 mb-2">{t('narrative.profileSynthesis')}</p>
        <p className="text-sm text-gray-200 leading-relaxed">{texts.sintese_perfil}</p>
      </div>

      {/* Snapshot DISC natural */}
      <div className="rounded-2xl p-5 border border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-3 text-center">
            {t('narrative.naturalWhoYouAre')}
          </p>
          <DiscBars scores={raw.disc_natural} />
        </div>
      </div>

      {/* 4 quadrantes DISC */}
      <div>
        <h2 className="text-base font-extrabold text-white mb-3">{t('narrative.howYouWork')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <QuadrantCard letter="D" title={t('quadrants.challenges')}
            n={raw.disc_natural.D}
            traco={texts.quadrante_D?.titulo_traco} descricao={texts.quadrante_D?.descricao} t={t} />
          <QuadrantCard letter="I" title={t('quadrants.people')}
            n={raw.disc_natural.I}
            traco={texts.quadrante_I?.titulo_traco} descricao={texts.quadrante_I?.descricao} t={t} />
          <QuadrantCard letter="S" title={t('quadrants.pace')}
            n={raw.disc_natural.S}
            traco={texts.quadrante_S?.titulo_traco} descricao={texts.quadrante_S?.descricao} t={t} />
          <QuadrantCard letter="C" title={t('quadrants.rules')}
            n={raw.disc_natural.C}
            traco={texts.quadrante_C?.titulo_traco} descricao={texts.quadrante_C?.descricao} t={t} />
        </div>
      </div>

      {/* Top 5 forças/desenvolver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mb-3">{t('narrative.topStrengths')}</p>
          <div className="space-y-2">
            {(texts.top5_forcas || []).map((f, i) => {
              const comp = raw.competencias.find(c => c.nome === f.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-emerald-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{f.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{f.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-3">{t('narrative.topOpportunities')}</p>
          <div className="space-y-2">
            {(texts.top5_desenvolver || []).map((d, i) => {
              const comp = raw.competencias.find(c => c.nome === d.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-amber-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{d.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{d.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Liderança narrativa */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-extrabold text-white mb-3">{t('narrative.leadershipStyle')}</h2>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">{texts.lideranca_sintese}</p>
        <div className="rounded-lg p-3 border-l-2 border-amber-400" style={{ background: 'rgba(245,158,11,0.08)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-1">{t('narrative.opportunities')}</p>
          <p className="text-xs text-gray-300">{texts.lideranca_trabalhar}</p>
        </div>
      </div>

      {/* Pontos sob pressão */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <h2 className="text-sm font-extrabold text-white mb-1">{t('narrative.pressurePoints')}</h2>
        <p className="text-[10px] text-gray-500 mb-3">
          {t('narrative.pressureSubtitle', { profile: raw.perfil_dominante })}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(texts.pontos_desenvolver_pressao || []).map((p, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: 'rgba(15,42,74,0.6)' }}>
              <div className="w-3 h-3 rounded-sm border-2 border-amber-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-gray-200 leading-relaxed">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Resumo Executivo ─────────────────────────────────────────────────────
const DISC_ICONS = { D: Zap, I: Users, S: Anchor, C: ListChecks };
const DISC_LABELS_FULL = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function inferLetraDominante(perfil) {
  return String(perfil || '').trim().toUpperCase()[0] || 'D';
}

// Render dos insights com **negrito** transformado em <strong>
function InsightText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i} className="text-brand-400 font-bold">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

function ResumoExecutivo({ colaborador: c, arquetipo, tags, insights, insightsCached, canGenerateInsights = true, t }) {
  const router = useRouter();
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsLocal, setInsightsLocal] = useState(insights);
  const [generated, setGenerated] = useState(insightsCached);

  // Dispara geração via IA na primeira visita após o mapeamento
  useEffect(() => {
    if (!canGenerateInsights || insightsCached || generated) return;
    let cancelled = false;
    setInsightsLoading(true);
    gerarInsightsExecutivos()
      .then(r => {
        if (cancelled) return;
        if (r?.insights?.length) setInsightsLocal(r.insights);
        setGenerated(true);
      })
      .catch(() => { if (!cancelled) setGenerated(true); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [canGenerateInsights, generated, insightsCached]);

  const letraDominante = inferLetraDominante(c.perfil_dominante);
  const discScores = [
    { letra: 'D', valor: c.d_natural || 0 },
    { letra: 'I', valor: c.i_natural || 0 },
    { letra: 'S', valor: c.s_natural || 0 },
    { letra: 'C', valor: c.c_natural || 0 },
  ];

  return (
    <div className="space-y-5">
      {/* Card 1: Identificação executiva */}
      <div className="rounded-2xl p-5 md:p-6 border border-brand-400/15 relative overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        {/* glow decorativo */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-12 -mt-12"
          style={{ background: 'rgba(0,180,216,0.08)' }} />

        <div className="relative">
          <h2 className="font-extrabold text-xl md:text-2xl text-white">{c.nome_completo}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-brand-400 font-bold text-base">{arquetipo?.nome || t('fallbackProfessional')}</span>
            <span className="h-1 w-1 rounded-full bg-gray-600" />
            <span className="text-gray-400 font-bold text-xs tracking-widest uppercase">
              {t('dominantProfile', { profile: DISC_LABELS_FULL[letraDominante] || t('profileFallback') })}
            </span>
          </div>
          {arquetipo?.desc && (
            <p className="text-sm text-gray-400 mt-2">{arquetipo.desc}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {tags.map(t => (
              <span key={t} className="border border-white/10 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-gray-300"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Card 2: DISC sintético */}
      <div className="rounded-2xl p-5 border border-white/[0.06]"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-5 md:gap-6">
          {/* Letra dominante grande */}
          <div className="relative w-20 h-20 md:w-24 md:h-24 shrink-0 flex items-center justify-center rounded-full border border-brand-400/30"
            style={{ background: 'rgba(0,180,216,0.08)' }}>
            <div className="flex flex-col items-center">
              <span className="text-4xl md:text-5xl font-black text-brand-400" style={{ textShadow: '0 0 20px rgba(0,180,216,0.4)' }}>
                {letraDominante}
              </span>
              <span className="text-[8px] uppercase font-bold text-gray-400 tracking-[0.18em] -mt-1">
                {t('dominant')}
              </span>
            </div>
          </div>

          {/* 4 mini-itens DISC */}
          <div className="grid grid-cols-2 gap-y-3 gap-x-3 md:gap-x-4 flex-1 min-w-0">
            {discScores.map(({ letra, valor }) => {
              const Icon = DISC_ICONS[letra];
              return (
                <div key={letra} className="flex items-center gap-2 min-w-0">
                  <Icon size={18} className="text-brand-400 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter truncate">
                      {DISC_LABELS_FULL[letra]}
                    </span>
                    <span className="text-xs font-bold text-white">
                      {intensidadeQualitativa(valor)} {letra}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Card 3: Insights acionáveis */}
      <div className="rounded-2xl p-5 md:p-6 border border-white/[0.06] space-y-4"
        style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-lg text-white">{t('actionableInsights')}</h3>
          {!insightsCached && insightsLoading && (
            <Loader2 size={14} className="animate-spin text-brand-400" />
          )}
        </div>

        <ul className="space-y-3">
          {insightsLocal.slice(0, 3).map((insight, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="mt-1.5 h-2 w-2 rounded-full bg-brand-400 shrink-0"
                style={{ boxShadow: '0 0 8px rgba(0,180,216,0.6)' }} />
              <p className="text-gray-300 text-sm leading-relaxed">
                <InsightText text={insight} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PerfilComportamentalPage() {
  const t = useTranslations('BehavioralProfile');
  const searchParams = useSearchParams();
  const colaboradorAlvo = searchParams.get('colaborador');
  // A presença do ID já implica consulta de terceiro. O modo de segurança não
  // depende de `origem`, que é apenas um parâmetro manipulável da URL.
  const visaoGestor = !!colaboradorAlvo;
  const [data, setData] = useState(null);
  const [narrativa, setNarrativa] = useState(null); // { raw, texts } do loadBehavioralReport
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [abrindoPdfExterno, setAbrindoPdfExterno] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioAutoplay, setAudioAutoplay] = useState(false);
  const [gerandoAudio, setGerandoAudio] = useState(false);
  const [enviandoWhats, setEnviandoWhats] = useState(false);
  const router = useRouter();
  const supabase = getSupabase();

  function flash(msg) { toast(msg); }

  async function handleOuvirDevolutiva() {
    setGerandoAudio(true);
    const r = colaboradorAlvo
      ? await ouvirDevolutivaComportamentalGestor(colaboradorAlvo)
      : await ouvirDevolutivaComportamental();
    setGerandoAudio(false);
    if (r.error) { flash(r.error); return; }
    setAudioAutoplay(true);
    setAudioUrl(r.url);
  }

  async function handleEnviarWhats() {
    setEnviandoWhats(true);
    const r = await enviarDevolutivaWhatsApp();
    setEnviandoWhats(false);
    flash(r.success ? t('audio.sent') : (r.error || t('audio.sendError')));
  }

  useEffect(() => {
    let ativo = true;
    async function init() {
      setLoading(true);
      setError('');
      setData(null);
      setNarrativa(null);
      setAudioUrl(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      // Carrega perfil (barras, 16 competências etc) e análise narrativa em paralelo
      const [resultRaw, narr] = await Promise.all([
        colaboradorAlvo ? loadPerfilCISGestor(colaboradorAlvo) : loadPerfilCIS(),
        (colaboradorAlvo ? loadBehavioralReportGestor(colaboradorAlvo) : loadBehavioralReport()).catch(() => null),
      ]);
      const result: any = resultRaw;
      if (!ativo) return;
      if (result.error) setError(result.error);
      else {
        setData(result);
        // Cache aquecido: assina o arquivo e já monta os controles. Não gera
        // áudio aqui — a flag só fica true quando relatório e MP3 estão atuais.
        if (result.audioComportamentalDisponivel) {
          const cachedAudio = await (colaboradorAlvo
            ? ouvirDevolutivaComportamentalGestor(colaboradorAlvo)
            : ouvirDevolutivaComportamental()).catch(() => null);
          if (!ativo) return;
          if (cachedAudio?.url) {
            setAudioAutoplay(false);
            setAudioUrl(cachedAudio.url);
          }
        }
      }
      if (narr && !narr.error) setNarrativa(narr);
      setLoading(false);
    }
    void init();
    return () => { ativo = false; };
  }, [colaboradorAlvo, router, supabase]);

  async function handleAbrirPdfExterno() {
    setAbrindoPdfExterno(true);
    // Abre a aba ANTES do await: popup criado depois da resposta assíncrona
    // perde o gesto do usuário e é bloqueado pelo navegador.
    const aba = window.open('', '_blank');
    const r = colaboradorAlvo
      ? await getPerfilExternoPdfUrlGestor(colaboradorAlvo)
      : await getMeuPerfilExternoPdfUrl();
    setAbrindoPdfExterno(false);
    if (r.error || !r.url) { aba?.close(); flash(r.error || t('external.pdfError')); return; }
    if (aba) aba.location.href = r.url;
    else window.open(r.url, '_blank');
  }

  async function handleDownloadPdf() {
    setDownloading(true);
    const r = colaboradorAlvo
      ? await baixarRelatorioComportamentalPdfGestor(colaboradorAlvo)
      : await baixarRelatorioComportamentalPdf();
    setDownloading(false);
    if (r.error) { setError(r.error); return; }
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const voltarEquipe = visaoGestor ? (
    <button
      type="button"
      onClick={() => router.push('/dashboard/gestor')}
      className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60"
    >
      <ArrowLeft size={14} /> {t('teamView.back')}
    </button>
  ) : null;

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-brand-400" /></div>;
  if (error) return <PageContainer>{voltarEquipe}<div className="p-6 text-center text-gray-400">{error}</div></PageContainer>;
  if (!data) return null;

  const { colaborador: c, empresaPerfilExternoFonte, empresaPerfilExternoLabel } = data as any;
  const hasDISC = c.perfil_dominante && (c.d_natural || c.i_natural || c.s_natural || c.c_natural);
  const usaFonteExterna = !!empresaPerfilExternoFonte;
  const temPerfilExterno = !!c.perfil_externo_dados;
  const temPdfPerfilExterno = (data as any).temPdfPerfilExterno === true;
  const perfilComportamentalLiberado = (data as any).perfilComportamentalLiberado !== false;

  // Empresa com fonte externa/proprietária: NUNCA oferecer DISC nativo.
  // O perfil pode ser usado pelo pipeline interno quando houver dados, mas o
  // colaborador não precisa responder o mapeamento da Vertho.
  if (usaFonteExterna) {
    const perfil = c.perfil_externo_dados || {};
    const altas = Array.isArray(perfil?.resumo?.altas) ? perfil.resumo.altas.slice(0, 3) : [];
    return (
      <PageContainer>
        {voltarEquipe}
        <PageHero
          eyebrow={visaoGestor ? t('teamView.eyebrow') : 'PERFIL COMPORTAMENTAL'}
          title={visaoGestor ? c.nome_completo : (temPerfilExterno ? t('external.receivedTitle') : t('external.handledTitle'))}
          subtitle={t('external.subtitle', { source: empresaPerfilExternoLabel || t('external.defaultSource') })}
        />
        <div className="flex justify-center">
          <div className="rounded-2xl border border-white/[0.06] p-8 text-center max-w-[520px] w-full"
            style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
            <AlertCircle size={40} className="text-brand-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400 leading-relaxed mb-4">
              {temPerfilExterno
                ? t('external.receivedDescription')
                : t('external.pendingDescription')}
            </p>
            {/* O relatório original é o que a pessoa reconhece — sem ele a Fase 1
                fica "concluída" sem nada para ver. Aparece assim que o PDF existe,
                mesmo que a extração ainda não tenha rodado. */}
            {temPdfPerfilExterno && (
              <button onClick={handleAbrirPdfExterno} disabled={abrindoPdfExterno}
                className="w-full mb-4 px-5 py-3 rounded-full text-sm font-bold text-white inline-flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {abrindoPdfExterno
                  ? <Loader2 size={16} className="animate-spin" />
                  : <FileText size={16} />}
                {t('external.openPdf', { source: empresaPerfilExternoFonte === 'opq32' ? 'OPQ32' : String(empresaPerfilExternoFonte || '').toUpperCase() })}
              </button>
            )}
            {altas.length > 0 && (
              <div className="rounded-xl border border-white/[0.06] p-4 text-left" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-2">{t('external.availableHighlights')}</p>
                <div className="space-y-1">
                  {altas.map((a: any, i: number) => (
                    <p key={i} className="text-xs text-gray-300">
                      {a.nome || t('external.scale')}{a.sten ? ` · sten ${a.sten}` : ''}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  // Fluxo DISC nativo — oferece mapeamento se ainda não tem.
  if (!hasDISC) {
    if (!perfilComportamentalLiberado) {
      return (
        <PageContainer>
          {voltarEquipe}
          <PageHero
            eyebrow={visaoGestor ? t('teamView.eyebrow') : 'PERFIL COMPORTAMENTAL'}
            title={visaoGestor ? c.nome_completo : t('blocked.title')}
            subtitle={t('blocked.subtitle')}
          />
          <div className="flex justify-center">
            <div className="rounded-2xl border border-amber-400/20 p-8 text-center max-w-[520px] w-full"
              style={{ background: 'rgba(245,158,11,0.06)', backdropFilter: 'blur(12px)' }}>
              <AlertCircle size={40} className="text-amber-300 mx-auto mb-3" />
              <p className="text-sm text-gray-300 leading-relaxed">
                {t('blocked.description')}
              </p>
            </div>
          </div>
        </PageContainer>
      );
    }

    return (
      <PageContainer>
        {voltarEquipe}
        <PageHero
          eyebrow={visaoGestor ? t('teamView.eyebrow') : 'PERFIL COMPORTAMENTAL'}
          title={visaoGestor ? c.nome_completo : t('notMapped.title')}
          subtitle={visaoGestor ? t('teamView.notMapped') : t('notMapped.subtitle')}
        />
        <div className="flex justify-center">
          <div className="rounded-2xl border border-white/[0.06] p-8 text-center max-w-[520px] w-full"
            style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)' }}>
            <AlertCircle size={40} className="text-brand-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400 mb-5">
              {t('notMapped.description')}
            </p>
            {!visaoGestor && (
              <button onClick={() => router.push('/dashboard/perfil-comportamental/mapeamento')}
                className="px-6 py-3 rounded-full text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {t('notMapped.start')}
              </button>
            )}
          </div>
        </div>
      </PageContainer>
    );
  }

  // Montar estruturas a partir das colunas planas
  const disc = { D: c.d_natural || 0, I: c.i_natural || 0, S: c.s_natural || 0, C: c.c_natural || 0 };
  const lead = [
    { label: 'Executivo', value: c.lid_executivo || 0, color: DISC_COLORS.D },
    { label: 'Motivador', value: c.lid_motivador || 0, color: DISC_COLORS.I },
    { label: 'Metódico', value: c.lid_metodico || 0, color: DISC_COLORS.S },
    { label: 'Sistemático', value: c.lid_sistematico || 0, color: DISC_COLORS.C },
  ];

  // Flatten das 16 competências para forças/desenvolvimento
  const allComps = Object.entries(COMP_GROUPS).flatMap(([dim, arr]) =>
    arr.map(({ label, key }) => ({ name: label, value: c[key] || 0, dim }))
  );
  const sortedComps = [...allComps].sort((a, b) => b.value - a.value);
  const strengths = sortedComps.slice(0, 3);
  const gaps = sortedComps.slice(-3).reverse();

  // Resumo executivo (arquétipo + tags + insights) vem da action
  const arquetipo = data.arquetipo;
  const tags = data.tags || [];
  const insights = data.insights || [];

  return (
    <PageContainer className="space-y-5">
      {voltarEquipe}
      <PageHero
        eyebrow={visaoGestor ? t('teamView.eyebrow') : t('hero.eyebrow')}
        title={visaoGestor ? c.nome_completo : t('hero.title')}
        actions={narrativa ? (
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleOuvirDevolutiva} disabled={gerandoAudio}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-extrabold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)', boxShadow: '0 0 20px rgba(139,92,246,0.25)' }}>
              {gerandoAudio ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
              {gerandoAudio ? t('audio.generating') : t('audio.listen')}
            </button>
            {!visaoGestor && (
              <button onClick={handleEnviarWhats} disabled={enviandoWhats}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-extrabold text-white transition disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #22C55E, #15803D)', boxShadow: '0 0 20px rgba(34,197,94,0.25)' }}>
                {enviandoWhats ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {enviandoWhats ? t('audio.sending') : t('audio.whatsapp')}
              </button>
            )}
            <button onClick={handleDownloadPdf} disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-extrabold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)', boxShadow: '0 0 20px rgba(0,180,216,0.25)' }}>
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloading ? t('download.preparing') : t('download.button')}
            </button>
          </div>
        ) : null}
      />

      {audioUrl && (
        <div className="rounded-2xl border border-purple-400/20 bg-purple-500/5 p-4 flex items-center gap-3">
          <Volume2 size={18} className="text-purple-300 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-purple-200 mb-1">{t('audio.title')}</p>
            <audio
              controls
              autoPlay={audioAutoplay}
              src={audioUrl}
              onLoadedMetadata={(event) => { event.currentTarget.currentTime = 0; }}
              className="w-full h-9"
            />
          </div>
        </div>
      )}

      <ResumoExecutivo
        key={c.id}
        colaborador={c}
        arquetipo={arquetipo}
        tags={tags}
        insights={insights}
        insightsCached={data.insightsCached}
        canGenerateInsights={!visaoGestor}
        t={t}
      />

      {/* Análise narrativa (quadrantes DISC, top5 forças/gaps, liderança, pressão) */}
      {narrativa && (
        <>
          <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mt-8 mb-1">
            {t('sections.narrative')}
          </p>
          <AnaliseNarrativa data={narrativa} t={t} />
        </>
      )}

      <p className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mt-8">
        {t('sections.detailed')}
      </p>

      {/* ── Radar DISC ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC</p>
        <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
          {[25, 50, 75, 100].map(r => (
            <polygon key={r} points={radarPoints(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          ))}
          {[[100, 0], [200, 100], [100, 200], [0, 100]].map(([x, y], i) => (
            <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          ))}
          <polygon points={discRadarPoints(disc)} fill="rgba(45,212,191,0.12)" stroke="#2DD4BF" strokeWidth="2" />
          {[{ f: 'D', x: 100, y: v => 100 - v }, { f: 'I', x: v => 100 + v, y: 100 }, { f: 'S', x: 100, y: v => 100 + v }, { f: 'C', x: v => 100 - v, y: 100 }].map(p => {
            const nv = disc[p.f];
            const nx = typeof p.x === 'function' ? p.x(nv) : p.x, ny = typeof p.y === 'function' ? p.y(nv) : p.y;
            return <circle key={p.f} cx={nx} cy={ny} r="3.5" fill="#2DD4BF" />;
          })}
          <text x="100" y="10" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">D</text>
          <text x="195" y="105" textAnchor="start" fill="#CBD5E1" fontSize="13" fontWeight="700">I</text>
          <text x="100" y="199" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">S</text>
          <text x="5" y="105" textAnchor="end" fill="#CBD5E1" fontSize="13" fontWeight="700">C</text>
        </svg>
        <div className="flex justify-center gap-5 mt-3">
          <span className="text-xs font-bold text-gray-300"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2DD4BF] mr-1.5" />{t('labels.natural')}</span>
        </div>
      </div>

      {/* ── Forças / Desenvolvimento ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-green-400 mb-3">{t('sections.strengths')}</p>
          {strengths.map(s => (
            <p key={s.name} className="text-sm font-bold text-white mt-1.5">{s.name} <span className="text-green-400">{Math.round(s.value)}</span></p>
          ))}
        </div>
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-amber-400 mb-3">{t('sections.development')}</p>
          {gaps.map(g => (
            <p key={g.name} className="text-sm font-bold text-white mt-1.5">{g.name} <span className="text-amber-400">{Math.round(g.value)}</span></p>
          ))}
        </div>
      </div>

      {/* ── DISC Natural ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC Natural</p>
        {[['Dominância', disc.D, DISC_COLORS.D], ['Influência', disc.I, DISC_COLORS.I], ['Estabilidade', disc.S, DISC_COLORS.S], ['Conformidade', disc.C, DISC_COLORS.C]].map(([l, v, col]) => (
          <Bar key={l} label={l} value={v} max={100} color={col} />
        ))}
      </div>

      {/* ── Liderança ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-brand-400 mb-4">{t('sections.leadership')}</p>
        {/* Régua ÚNICA 0-100 em todos os blocos desta tela (DISC, Liderança,
            Competências). Antes a Liderança usava max={50} — a escala nativa
            dela, já que `lid_X = DISC_X / 2` (computeLeadership no mapeamento)
            e os 4 estilos somam 100 contra os 200 do DISC. Só que o número ao
            lado é o mesmo em todos os blocos: com duas réguas, um Executivo 39
            desenhava a MESMA barra de um Conformidade 78, e a tela convidava a
            uma comparação que ela mesma invalidava. Com régua única a barra
            passa a ser lida direto pelo número — a Liderança fica visualmente
            menor porque ela É metade do DISC. */}
        {lead.map(l => (
          <Bar key={l.label} label={l.label} value={l.value} max={100} color={l.color} />
        ))}
      </div>

      {/* ── Competências por dimensão ── */}
      {Object.entries(COMP_GROUPS).map(([dim, comps]) => (
        <div key={dim} className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[2px] mb-4" style={{ color: DISC_COLORS[dim] }}>
            {t('sections.competencies')} — {DISC_LABELS[dim]}
          </p>
          {comps.map(({ label, key }) => (
            <Bar key={key} label={label} value={c[key] || 0} max={100} color={DISC_COLORS[dim]} />
          ))}
        </div>
      ))}
    </PageContainer>
  );
}
