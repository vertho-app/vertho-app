'use client';
import { toast } from 'sonner';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, CheckCircle, ArrowRight, Target, Calendar, FileText, Trophy, Play } from 'lucide-react';
import BackButton from '@/components/back-button';
import VideoModal from '@/components/video-modal';
import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from './assessment-actions';
import MicInput from '@/components/mic-input';

const PHASE = {
  LOADING: 'loading',
  EXPLICACAO: 'explicacao',
  INTRO: 'intro',
  PERGUNTAS: 'perguntas',
  REPR: 'repr',
  CONFIRM: 'confirm',
  CONCLUIDO: 'concluido',
  HOJE: 'hoje',
  ERROR: 'error',
};

const PROMPT_P = [
  'P1 — Situação',
  'P2 — Ação',
  'P3 — Raciocínio',
  'P4 — Análise',
];

// Vídeo de encerramento da avaliação (pedido do deck "Experiência do usuário - Elo"):
// agradecimento + próximas etapas (PDI e Temporada).
// TODO: vídeo em produção — trocar pelo ID real do Bunny Stream quando estiver pronto.
const BUNNY_LIBRARY = 636615;
const CLOSING_VIDEO_ID = 'TROCAR_PELO_ID_DO_VIDEO_DE_ENCERRAMENTO_AVALIACAO';

export default function AssessmentPage() {
  const t = useTranslations('Assessment');
  const router = useRouter();
  const supabase = getSupabase();

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const [pergIdx, setPergIdx] = useState(0); // 0..3
  const [respostas, setRespostas] = useState({ r1: '', r2: '', r3: '', r4: '' });
  const [repr, setRepr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  // Vídeo de encerramento (tela CONCLUIDO → modal com tracking)
  const [showClosingVideo, setShowClosingVideo] = useState(false);

  function flash(msg) { toast.error(msg); }

  useEffect(() => {
    (async () => {
      try {
        const r: any = await getDiagnosticoDoDia();
        if (!r) { setError(t('emptyServer')); setPhase(PHASE.ERROR); return; }
        if (r.error) { setError(r.error); setPhase(PHASE.ERROR); return; }
        setData(r);
        if (r.concluiuTudo) setPhase(PHASE.CONCLUIDO);
        else if (r.respondeuHoje) setPhase(PHASE.HOJE);
        else setPhase(PHASE.EXPLICACAO);
      } catch (e) {
        console.error('[assessment init]', e);
        setError(e?.message || t('loadError'));
        setPhase(PHASE.ERROR);
      }
    })();
  }, []);

  const currentR = useMemo(() => respostas[`r${pergIdx + 1}`] || '', [respostas, pergIdx]);

  function setCurrentR(val) {
    setRespostas(prev => ({ ...prev, [`r${pergIdx + 1}`]: val }));
  }

  function avancarPergunta() {
    if (currentR.trim().length < 20) { flash(t('questions.minToast')); return; }
    if (pergIdx === 3) { setPhase(PHASE.REPR); return; }
    setPergIdx(i => i + 1);
  }

  function voltarPergunta() {
    if (pergIdx === 0) { setPhase(PHASE.INTRO); return; }
    setPergIdx(i => i - 1);
  }

  async function enviarResposta() {
    if (!repr) { flash(t('representativity.chooseToast')); return; }
    setSaving(true);
    const cen = data.cenarioDoDia;
    const r: any = await salvarRespostaDiagnostico(cen.cenarioId, cen.compId, cen.compNome, {
      ...respostas,
      repr,
    });
    setSaving(false);
    if (r.error) { flash(r.error); return; }
    setSaveResult(r);
    if (r.concluiuTudo) setPhase(PHASE.CONCLUIDO);
    else setPhase(PHASE.CONFIRM);
  }

  // ══════════════ RENDERS ══════════════

  if (phase === PHASE.LOADING) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    );
  }

  if (phase === PHASE.ERROR) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <BackButton />
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <p className="text-base text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 space-y-4">
      <BackButton />

      {/* Header com progresso */}
      {data?.progresso && phase !== PHASE.CONCLUIDO && (
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-bold text-white">{data.colaborador.nome}</p>
              <p className="text-xs text-gray-400">{data.colaborador.cargo}</p>
            </div>
            <span className="text-xs font-extrabold text-brand-400">{data.progresso.pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full bg-brand-400 transition-all" style={{ width: `${data.progresso.pct}%` }} />
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">{t('progress', { done: data.progresso.respondidas, total: data.progresso.total })}</p>
        </div>
      )}

      {/* ─── EXPLICAÇÃO ─── */}
      {phase === PHASE.EXPLICACAO && (
        <div className="rounded-2xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <div className="text-4xl mb-2">📋</div>
          <p className="text-lg font-extrabold text-white mb-1">{t('explanation.title')}</p>
          <p className="text-xs text-gray-500 mb-5">{t('explanation.subtitle')}</p>
          <div className="space-y-3 text-left mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-400/15 flex items-center justify-center shrink-0"><Calendar size={16} className="text-brand-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">{t('explanation.paceTitle')}</span> · {t('explanation.paceText')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-400/15 flex items-center justify-center shrink-0"><FileText size={16} className="text-purple-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">{t('explanation.questionsTitle')}</span> · {t('explanation.questionsText')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-400/15 flex items-center justify-center shrink-0"><CheckCircle size={16} className="text-green-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">{t('explanation.confidentialTitle')}</span> · {t('explanation.confidentialText')}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0"><Target size={16} className="text-amber-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">{t('explanation.authenticTitle')}</span> · {t('explanation.authenticText')}</div>
            </div>
          </div>
          <button onClick={() => setPhase(PHASE.INTRO)}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition">
            {t('explanation.start')}
          </button>
        </div>
      )}

      {/* ─── INTRO DO CENÁRIO ─── */}
      {phase === PHASE.INTRO && data?.cenarioDoDia && (
        <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-400 mb-2">{t('intro.context')}</p>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-5">{data.cenarioDoDia.contexto}</p>
          <button onClick={() => { setPergIdx(0); setPhase(PHASE.PERGUNTAS); }}
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-br from-[#0F2B54] to-[#1a3a70] hover:brightness-110 transition">
            {t('intro.start')}
          </button>
        </div>
      )}

      {/* ─── PERGUNTAS P1-P4 ─── */}
      {phase === PHASE.PERGUNTAS && data?.cenarioDoDia && (() => {
        const cen = data.cenarioDoDia;
        const enunciados = [cen.p1, cen.p2, cen.p3, cen.p4];
        const len = currentR.trim().length;
        return (
          <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold tracking-widest text-brand-400 uppercase">
                {t('questions.counter', { current: pergIdx + 1, total: enunciados.length })}
              </span>
              <div className="flex gap-1">
                {enunciados.map((_, i) => (
                  <span key={i} className={`h-1.5 w-6 rounded-full transition-colors ${
                    i < pergIdx ? 'bg-brand-400'
                    : i === pergIdx ? 'bg-brand-400/60'
                    : 'bg-white/10'
                  }`} />
                ))}
              </div>
            </div>
            <div className="rounded-xl p-3 mb-3 border-l-4 border-brand-400" style={{ background: 'rgba(45,212,191,0.05)' }}>
              <p className="text-sm font-semibold text-white leading-snug">{enunciados[pergIdx]}</p>
            </div>
            {/* Gravador por voz — dica + botão. O MicInput já mostra "Indisponível"
                quando o browser não suporta Web Speech API (alguns Safari). */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 md:gap-3 mb-2">
              <p className="text-[10px] text-gray-500 leading-relaxed flex-1 md:max-w-md">
                <span className="font-semibold text-gray-400">{t('questions.voiceTipPrefix')}</span>{' '}
                {t.rich('questions.voiceTip', {
                  strong: (chunks) => <span className="text-brand-400 font-semibold">{chunks}</span>,
                })}
              </p>
              <div className="self-start md:self-auto">
                <MicInput value={currentR} onChange={setCurrentR} />
              </div>
            </div>
            <textarea
              value={currentR}
              onChange={e => setCurrentR(e.target.value)}
              placeholder={t('questions.placeholder')}
              rows={6}
              className="w-full p-3 rounded-xl border-2 border-white/10 bg-[#091D35] text-white text-sm outline-none focus:border-brand-400 transition-colors placeholder:text-gray-500"
            />
            <p className={`text-right text-[11px] mt-1 ${len < 20 ? 'text-red-400' : 'text-gray-500'}`}>{t('questions.minChars', { count: len })}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={voltarPergunta}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
                {t('questions.previous')}
              </button>
              <button onClick={avancarPergunta}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition">
                {pergIdx === 3 ? t('questions.representativity') : t('questions.next')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── REPRESENTATIVIDADE ─── */}
      {phase === PHASE.REPR && (
        <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-sm font-semibold text-white leading-snug mb-5">
            {t('representativity.prompt')}
          </p>
          <div className="flex justify-center gap-1.5 flex-wrap mb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button key={n} onClick={() => setRepr(n)}
                className={`w-10 h-10 rounded-lg border-2 text-sm font-extrabold transition-all ${
                  repr === n
                    ? 'bg-brand-400 border-brand-400 text-[#0C1829] scale-110'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:border-brand-400 hover:text-brand-400'
                }`}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-5">
            <span>{t('representativity.low')}</span>
            <span>{t('representativity.high')}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPhase(PHASE.PERGUNTAS); setPergIdx(3); }}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition disabled:opacity-50">
              {t('questions.previous')}
            </button>
            <button onClick={enviarResposta}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? t('representativity.sending') : t('representativity.submit')}
            </button>
          </div>
        </div>
      )}

      {/* ─── CONFIRMAÇÃO ─── */}
      {phase === PHASE.CONFIRM && (
        <div className="rounded-2xl p-6 border border-green-400/30 text-center" style={{ background: 'rgba(16,185,129,0.08)' }}>
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-lg font-extrabold text-green-400 mb-1">{t('confirm.title')}</p>
          <p className="text-sm text-gray-300 mb-5">{t('confirm.description')}</p>
          <div className="flex flex-col gap-2">
            {saveResult?.proximaCompetencia && (
              <button onClick={async () => {
                // recarrega pra pegar próxima
                setPhase(PHASE.LOADING);
                setRespostas({ r1: '', r2: '', r3: '', r4: '' });
                setRepr(null);
                setPergIdx(0);
                setSaveResult(null);
                const r: any = await getDiagnosticoDoDia();
                if (r.error) { setError(r.error); setPhase(PHASE.ERROR); return; }
                setData(r);
                if (r.concluiuTudo) setPhase(PHASE.CONCLUIDO);
                else setPhase(PHASE.INTRO);
              }}
                className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition">
                {t('confirm.nextCompetency')}
              </button>
            )}
            <button onClick={() => router.push('/dashboard')}
              className="w-full py-3 rounded-xl font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
              {t('confirm.dashboard')}
            </button>
          </div>
        </div>
      )}

      {/* ─── JÁ RESPONDEU HOJE ─── */}
      {phase === PHASE.HOJE && (
        <div className="rounded-2xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <div className="text-5xl mb-3">✅</div>
          <p className="text-lg font-extrabold text-white mb-1">{t('today.title')}</p>
          <p className="text-sm text-gray-400 mb-5">{t('today.description')}</p>
          <button onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition">
            {t('confirm.dashboard')}
          </button>
        </div>
      )}

      {/* ─── CONCLUIU TUDO ─── */}
      {phase === PHASE.CONCLUIDO && (
        <div className="rounded-2xl p-6 border border-brand-400/30 text-center" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(252,211,77,0.05))' }}>
          <Trophy size={56} className="text-amber-400 mx-auto mb-3" />
          <p className="text-xl font-black text-white mb-1">{t('done.title', { name: data?.colaborador?.nome?.split(' ')[0] || '' })}</p>
          <p className="text-sm text-gray-300 mb-5">
            {t.rich('done.description', { br: () => <br /> })}
          </p>

          {/* Vídeo de agradecimento + próximas etapas (PDI e Temporada) */}
          <button onClick={() => setShowClosingVideo(true)}
            className="group relative block w-full aspect-video rounded-2xl overflow-hidden border border-white/10 mb-2 active:scale-[0.99] transition-transform"
            aria-label={t('done.watchVideo')}>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #0F2A4A 0%, #123B63 55%, #0C1829 100%)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="w-16 h-16 rounded-full flex items-center justify-center transition-transform group-hover:scale-110"
                style={{ background: 'rgba(45,212,191,0.15)', border: '1.5px solid rgba(45,212,191,0.5)' }}>
                <Play size={26} className="text-brand-400 ml-1" fill="currentColor" />
              </span>
            </div>
          </button>
          <p className="text-[12px] text-gray-400 mb-5">{t('done.watchVideo')}</p>

          <button onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-brand-400 to-brand-600 hover:brightness-110 transition">
            {t('confirm.dashboard')}
          </button>

          {showClosingVideo && (
            <VideoModal
              libraryId={BUNNY_LIBRARY}
              videoId={CLOSING_VIDEO_ID}
              title={t('done.watchVideo')}
              colaboradorId={data?.colaborador?.id || null}
              onClose={() => setShowClosingVideo(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
