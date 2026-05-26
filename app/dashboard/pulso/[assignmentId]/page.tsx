'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Activity } from 'lucide-react';
import { loadAssignment, saveResponse, finishAssignment } from '@/actions/pulse/responder';
import { LikertScale } from '@/components/pulse/LikertScale';
import { OpenTextQuestion } from '@/components/pulse/OpenTextQuestion';
import { PulseProgress } from '@/components/pulse/PulseProgress';
import { PulseCompletion } from '@/components/pulse/PulseCompletion';
import { PrivacyNotice } from '@/components/pulse/PrivacyNotice';
import type { PulseQuestion } from '@/lib/pulse/template';

interface Resposta {
  numeric_answer: number | null;
  text_answer: string | null;
}

export default function PulsoPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [respostas, setRespostas] = useState<Record<string, Resposta>>({});
  const [step, setStep] = useState<'intro' | 'questions' | 'done'>('intro');
  const [idx, setIdx] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [errFalt, setErrFalt] = useState<string | null>(null);

  useEffect(() => {
    loadAssignment(assignmentId).then(r => {
      if (r.ok === false) { setError(r.error); setLoading(false); return; }
      setData(r.data);
      setRespostas(r.data.respostasExistentes);
      // Se já finalizou, mostra tela de done
      if (r.data.assignment.status === 'completed') setStep('done');
      // Se já tem alguma resposta, pula intro
      else if (Object.keys(r.data.respostasExistentes).length) setStep('questions');
      setLoading(false);
    });
  }, [assignmentId]);

  if (loading) return <Loader />;
  if (error) return <ErrorScreen msg={error} onBack={() => router.push('/dashboard')} />;
  if (!data) return null;

  const perguntas: PulseQuestion[] = data.perguntas;
  const total = perguntas.length;
  const atual = perguntas[idx];
  const respostaAtual = respostas[atual?.id] || { numeric_answer: null, text_answer: null };

  async function handleAnswer(value: { numeric?: number | null; text?: string | null }) {
    setSalvando(true);
    setErrFalt(null);
    // Otimista
    setRespostas(prev => ({
      ...prev,
      [atual.id]: {
        numeric_answer: value.numeric ?? prev[atual.id]?.numeric_answer ?? null,
        text_answer: value.text ?? prev[atual.id]?.text_answer ?? null,
      },
    }));
    const r = await saveResponse(assignmentId, atual.id, value);
    setSalvando(false);
    if (r.ok === false) setErrFalt(r.error);
  }

  async function handleFinish() {
    setFinalizando(true);
    const r = await finishAssignment(assignmentId);
    setFinalizando(false);
    if (r.ok === false) {
      setErrFalt(r.error + (r.faltam?.length ? ` (faltam ${r.faltam.length})` : ''));
      // Vai pra primeira pergunta faltante
      if (r.faltam?.length) {
        const idxFalt = perguntas.findIndex(p => p.id === r.faltam![0]);
        if (idxFalt >= 0) setIdx(idxFalt);
      }
      return;
    }
    setStep('done');
  }

  if (step === 'done') {
    return <PulseCompletion pulseMoment={data.assignment.pulse_moment} />;
  }

  if (step === 'intro') {
    const t0 = data.assignment.pulse_moment === 'T0';
    return (
      <div className="max-w-md mx-auto px-5 py-8" style={{ minHeight: '100dvh' }}>
        <div className="mb-6 flex items-center gap-2">
          <Activity size={20} className="text-brand-400" />
          <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">
            Pulso de Desenvolvimento
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          {t0 ? 'Pulso de Desenvolvimento' : 'Pulso final de desenvolvimento'}
        </h1>
        <p className="text-sm text-gray-300 leading-relaxed mb-6">
          {t0
            ? 'Antes de começar sua jornada, responda a um pulso rápido sobre seu ambiente de desenvolvimento. Leva cerca de 3 minutos e ajuda a Vertho a personalizar melhor sua experiência.'
            : 'Agora queremos entender o que mudou e o que ainda pode ajudar sua evolução. Leva cerca de 3 minutos.'}
        </p>
        <div className="mb-6">
          <PrivacyNotice />
        </div>
        <button
          onClick={() => setStep('questions')}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-[#0F2B54] bg-brand-400 hover:brightness-110 transition-all"
        >
          Começar
        </button>
      </div>
    );
  }

  // step === 'questions'
  return (
    <div className="max-w-md mx-auto px-5 py-6" style={{ minHeight: '100dvh' }}>
      <div className="mb-5">
        <PulseProgress atual={idx + 1} total={total} dimensaoAtual={atual.dimension_name} />
      </div>

      <div className="rounded-2xl border border-white/[0.06] p-5 mb-5" style={{ background: '#0F2B54' }}>
        <p className="text-[9px] font-bold text-brand-400 uppercase tracking-widest mb-3">
          {atual.dimension_name}
        </p>
        <p className="text-base text-white leading-relaxed mb-6">{atual.question_text}</p>

        {atual.question_type === 'likert_1_5' ? (
          <LikertScale
            value={respostaAtual.numeric_answer}
            onChange={n => handleAnswer({ numeric: n })}
            disabled={salvando}
          />
        ) : (
          <OpenTextQuestion
            value={respostaAtual.text_answer || ''}
            onChange={t => handleAnswer({ text: t })}
            placeholder={atual.pulse_moment === 'T0'
              ? 'O que ajuda ou dificulta seu desenvolvimento...'
              : 'O que ajudou ou dificultou sua evolução...'}
            disabled={salvando}
          />
        )}
      </div>

      {errFalt && (
        <p className="text-[11px] text-amber-400 text-center mb-3">{errFalt}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[11px] font-bold text-gray-400 border border-white/10 disabled:opacity-30 hover:text-white hover:border-white/30 transition-all"
        >
          <ArrowLeft size={14} /> Voltar
        </button>

        {idx < total - 1 ? (
          <button
            onClick={() => setIdx(idx + 1)}
            disabled={atual.is_required && respostaAtual.numeric_answer == null}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[11px] font-bold text-[#0F2B54] bg-brand-400 hover:brightness-110 transition-all disabled:opacity-40"
          >
            Continuar <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={finalizando}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-[11px] font-bold text-[#0F2B54] bg-brand-400 hover:brightness-110 transition-all disabled:opacity-50"
          >
            {finalizando ? <Loader2 size={14} className="animate-spin" /> : 'Finalizar'}
          </button>
        )}
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: '100dvh' }}>
      <Loader2 size={32} className="animate-spin text-brand-400" />
    </div>
  );
}

function ErrorScreen({ msg, onBack }: { msg: string; onBack: () => void }) {
  return (
    <div className="max-w-md mx-auto px-5 py-10 text-center" style={{ minHeight: '100dvh' }}>
      <p className="text-sm text-red-400 mb-5">{msg}</p>
      <button onClick={onBack}
        className="px-5 py-2.5 rounded-lg text-xs font-bold text-white border border-white/20 hover:bg-white/[0.04]">
        Voltar
      </button>
    </div>
  );
}
