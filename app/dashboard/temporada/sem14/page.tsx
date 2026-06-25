'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, Play, CheckCircle2, AlertTriangle, Mic, MicOff } from 'lucide-react';
import BackButton from '@/components/back-button';
import { loadTemporadaPorEmail } from '@/actions/temporadas';
import ReactMarkdown from 'react-markdown';
import MicInput from '@/components/mic-input';
import { fetchAuth } from '@/lib/auth/fetch-auth';

const MIN_CHARS = 20;

/**
 * Avaliação Final da Temporada (semana do cenário B — regular=14, onboarding=10).
 * Wizard com cenário + 4 perguntas + botões anterior/próxima + submit final.
 *
 * O número da semana é derivado do `temporada_plano` (última semana com
 * `tipo: 'avaliacao'`) — a rota continua sendo `/sem14` por compatibilidade.
 */
export default function Sem14Page() {
  const t = useTranslations('SeasonFinal');
  const router = useRouter();
  const sb = getSupabase();
  const micRef = useRef(null);

  const [trilhaId, setTrilhaId] = useState(null);
  const [colabNome, setColabNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [cenario, setCenario] = useState('');
  const [perguntas, setPerguntas] = useState([]);
  const [respostas, setRespostas] = useState(['', '', '', '']);
  const [step, setStep] = useState(-1); // -1 = loading, 0 = cenário, 1..4 = pergunta, 5 = submit, 6 = finalizada
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avaliacao, setAvaliacao] = useState(null);
  const [semCenarioB, setSemCenarioB] = useState(14); // derivado do plano

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaPorEmail(user.email, { semanaTranscrito: 14 });
      if (r.error || !r.trilha) { setError(r.error || t('errors.noTrack')); return; }
      setTrilhaId(r.trilha.id);
      setCompetencia(Array.isArray(r.trilha.competencias_foco) && r.trilha.competencias_foco.length > 1
        ? r.trilha.competencias_foco.join(' + ')
        : r.trilha.competencia_foco);
      setColabNome(r.colaborador?.nome_completo || '');
      setCargo(r.colaborador?.cargo || '');

      // Última semana de avaliação no plano = wizard cenário B
      const plano = Array.isArray(r.trilha.temporada_plano) ? r.trilha.temporada_plano : [];
      const semsAval = plano.filter(s => s?.tipo === 'avaliacao').map(s => s.semana);
      const semCB = semsAval.length ? Math.max(...semsAval) : 14;
      setSemCenarioB(semCB);

      const prog = (r.progresso || []).find(p => p.semana === semCB);
      const fb = prog?.feedback || {};

      // Já concluída — mostra avaliação
      if (prog?.status === 'concluido') {
        setAvaliacao({
          nota_media_pre: fb.nota_media_pre,
          nota_media_pos: fb.nota_media_pos,
          delta_medio: fb.delta_medio,
          resumo_avaliacao: fb.resumo_avaliacao,
        });
        setStep(6);
        return;
      }

      // Carrega cenário + perguntas (faz init se não tem)
      if (fb.cenario && fb.perguntas) {
        setCenario(fb.cenario);
        setPerguntas(fb.perguntas);
        // recupera respostas parciais se existirem no transcript
        const respostasExistentes = (fb.transcript_completo || []).filter(m => m.role === 'user').map(m => m.content);
        setRespostas(prev => {
          const next = [...prev];
          respostasExistentes.forEach((r, i) => { if (i < 4) next[i] = r; });
          return next;
        });
        setStep(0);
      } else {
        const initResp = await fetchAuth('/api/temporada/evaluation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trilhaId: r.trilha.id, semana: semCB, action: 'init' }),
        });
        if (!initResp.ok) {
          const err = await initResp.json();
          setError(err.error || t('errors.startWeek', { week: semCB }));
          return;
        }
        const data = await initResp.json();
        setCenario(data.cenario || '');
        setPerguntas(data.perguntas || []);
        setStep(0);
      }
    })();
  }, [router, sb]);

  function setResposta(i, val) {
    setRespostas(prev => prev.map((r, idx) => idx === i ? val : r));
  }

  async function finalizar() {
    if (respostas.some(r => r.trim().length < MIN_CHARS)) {
      alert(t('alerts.allQuestions', { min: MIN_CHARS }));
      return;
    }
    setBusy(true);
    // Envia as 4 respostas em sequência (pedagogicamente correto — o backend
    // espera 4 mensagens antes do scorer). Reusa o fluxo send existente.
    for (let i = 0; i < respostas.length; i++) {
      const r = await fetchAuth('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId, semana: semCenarioB, action: 'send', message: respostas[i] }),
      });
      if (!r.ok) {
        const err = await r.json();
        alert(t('alerts.error', { error: err.error || t('alerts.sendFailure') }));
        setBusy(false); return;
      }
      if (i === respostas.length - 1) {
        const data = await r.json();
        if (data.finished && data.avaliacao) setAvaliacao(data.avaliacao);
      }
    }
    setBusy(false);
    setStep(6);
  }

  if (error) return (
    <div className="flex items-center justify-center h-[60dvh]">
      <div className="text-center">
        <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => router.push('/dashboard/temporada')} className="text-xs text-brand-400 mt-3 hover:underline">{t('back')}</button>
      </div>
    </div>
  );

  if (step < 0) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-brand-400" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <BackButton href="/dashboard/temporada" />

      {/* Card de progresso do colab */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-base font-bold text-white">{colabNome}</p>
            <p className="text-xs text-gray-400">{cargo}</p>
          </div>
          <p className="text-xs font-bold text-brand-400">
            {step <= 0 ? '0%' : step === 6 ? '100%' : `${Math.round(((step - 1) / 4) * 100)}%`}
          </p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all"
            style={{ width: step === 6 ? '100%' : step > 0 ? `${((step - 1) / 4) * 100}%` : '0%' }} />
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          {step === 6 ? t('progress.done') : t('progress.weekCompetency', { week: semCenarioB, competency: competencia })}
        </p>
      </div>

      {/* STEP 0 — Cenário */}
      {step === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-xs uppercase tracking-widest text-brand-400 font-bold mb-3">{t('context')}</p>
          <div className="prose prose-invert prose-sm max-w-none text-gray-200 mb-5">
            <ReactMarkdown>{cenario}</ReactMarkdown>
          </div>
          <button onClick={() => setStep(1)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-[#091D35] font-bold text-sm">
            <Play size={14} fill="currentColor" /> {t('startAssessment')}
          </button>
        </div>
      )}

      {/* STEPS 1..4 — Perguntas */}
      {step >= 1 && step <= 4 && perguntas[step - 1] && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-brand-400 font-bold">
              {t('question.counter', { current: step, total: 4 })}
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-1 w-12 rounded-full transition-all ${
                  i <= step ? 'bg-brand-400' : 'bg-white/10'
                }`} />
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-brand-500/5 border-l-4 border-brand-500 p-4 mb-3">
            <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold mb-1">{perguntas[step - 1].dimensao}</p>
            <p className="text-sm text-white font-semibold leading-relaxed">{perguntas[step - 1].texto}</p>
          </div>

          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[11px] text-gray-500 flex-1">
              {t.rich('question.voiceTip', { strong: (chunks) => <b className="text-brand-400">{chunks}</b> })}
            </p>
            <MicInput ref={micRef} value={respostas[step - 1]}
              onChange={val => setResposta(step - 1, val)} disabled={busy} />
          </div>

          <textarea value={respostas[step - 1]}
            onChange={e => setResposta(step - 1, e.target.value)}
            placeholder={t('question.placeholder')}
            rows={6}
            disabled={busy}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-vertical" />

          <div className="flex items-center justify-between mt-2 mb-4">
            <span className={`text-[11px] ${respostas[step - 1].trim().length >= MIN_CHARS ? 'text-emerald-400' : 'text-red-400'}`}>
              {t('question.minChars', { count: respostas[step - 1].length, min: MIN_CHARS })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { micRef.current?.stop(); setStep(step - 1); }} disabled={busy}
              className="flex-1 py-3 rounded-xl border border-white/10 hover:border-white/30 text-sm text-gray-300 disabled:opacity-50">
              {t('question.previous')}
            </button>
            {step < 4 ? (
              <button onClick={() => {
                if (respostas[step - 1].trim().length < MIN_CHARS) { alert(t('question.minAlert', { min: MIN_CHARS })); return; }
                micRef.current?.stop(); setStep(step + 1);
              }} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-[#091D35] font-bold text-sm disabled:opacity-50">
                {t('question.next')}
              </button>
            ) : (
              <button onClick={() => { micRef.current?.stop(); finalizar(); }} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#091D35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <><Loader2 size={14} className="animate-spin" /> {t('question.processing')}</> : <>{t('question.finish')}</>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* STEP 6 — Concluída */}
      {step === 6 && avaliacao && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <p className="text-base font-bold text-white">{t('done.title')}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className="text-xl font-bold text-white">{avaliacao.nota_media_pre}</p>
              <p className="text-[10px] text-gray-500 uppercase">{t('done.pre')}</p>
            </div>
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className="text-xl font-bold text-brand-400">{avaliacao.nota_media_pos}</p>
              <p className="text-[10px] text-gray-500 uppercase">{t('done.post')}</p>
            </div>
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className={`text-xl font-bold ${Number(avaliacao.delta_medio) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(avaliacao.delta_medio) > 0 ? '+' : ''}{avaliacao.delta_medio}
              </p>
              <p className="text-[10px] text-gray-500 uppercase">Delta</p>
            </div>
          </div>
          {avaliacao.resumo_avaliacao?.mensagem_geral && (
            <div className="rounded-lg bg-white/[0.03] p-3 text-sm text-gray-200 mb-4">
              {avaliacao.resumo_avaliacao.mensagem_geral}
            </div>
          )}
          <button onClick={() => router.push('/dashboard/temporada/concluida')}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:opacity-90 text-sm font-bold text-white">
            {t('done.viewReport')}
          </button>
        </div>
      )}
    </div>
  );
}
