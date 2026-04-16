'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, Play, CheckCircle2, AlertTriangle, Mic, MicOff } from 'lucide-react';
import { loadTemporadaPorEmail } from '@/actions/temporadas';
import ReactMarkdown from 'react-markdown';
import MicInput from '@/components/mic-input';

const MIN_CHARS = 20;

/**
 * Avaliação Final da Temporada (Semana 14) — UX idêntica ao mapeamento:
 * wizard com cenário + 4 perguntas + botões anterior/próxima + submit final.
 */
export default function Sem14Page() {
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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaPorEmail(user.email);
      if (r.error || !r.trilha) { setError(r.error || 'Sem trilha'); return; }
      setTrilhaId(r.trilha.id);
      setCompetencia(r.trilha.competencia_foco);
      setColabNome(r.colaborador?.nome_completo || '');
      setCargo(r.colaborador?.cargo || '');

      const prog = (r.progresso || []).find(p => p.semana === 14);
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
        const initResp = await fetch('/api/temporada/evaluation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trilhaId: r.trilha.id, semana: 14, action: 'init' }),
        });
        if (!initResp.ok) {
          const err = await initResp.json();
          setError(err.error || 'Erro ao iniciar sem 14');
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
      alert('Todas as 4 perguntas precisam ser respondidas com pelo menos ' + MIN_CHARS + ' caracteres.');
      return;
    }
    setBusy(true);
    // Envia as 4 respostas em sequência (pedagogicamente correto — o backend
    // espera 4 mensagens antes do scorer). Reusa o fluxo send existente.
    for (let i = 0; i < respostas.length; i++) {
      const r = await fetch('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId, semana: 14, action: 'send', message: respostas[i] }),
      });
      if (!r.ok) {
        const err = await r.json();
        alert('Erro: ' + (err.error || 'Falha ao enviar'));
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
        <button onClick={() => router.push('/dashboard/temporada')} className="text-xs text-cyan-400 mt-3 hover:underline">← Voltar</button>
      </div>
    </div>
  );

  if (step < 0) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <button onClick={() => router.push('/dashboard/temporada')} className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 mb-4">
        <ArrowLeft size={14} /> Voltar à temporada
      </button>

      {/* Card de progresso do colab */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <p className="text-base font-bold text-white">{colabNome}</p>
            <p className="text-xs text-gray-400">{cargo}</p>
          </div>
          <p className="text-xs font-bold text-cyan-400">
            {step <= 0 ? '0%' : step === 6 ? '100%' : `${Math.round(((step - 1) / 4) * 100)}%`}
          </p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all"
            style={{ width: step === 6 ? '100%' : step > 0 ? `${((step - 1) / 4) * 100}%` : '0%' }} />
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          {step === 6 ? 'Avaliação concluída' : `Semana 14 · ${competencia}`}
        </p>
      </div>

      {/* STEP 0 — Cenário */}
      {step === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold mb-3">Contexto</p>
          <div className="prose prose-invert prose-sm max-w-none text-gray-200 mb-5">
            <ReactMarkdown>{cenario}</ReactMarkdown>
          </div>
          <button onClick={() => setStep(1)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#091D35] font-bold text-sm">
            <Play size={14} fill="currentColor" /> Iniciar avaliação
          </button>
        </div>
      )}

      {/* STEPS 1..4 — Perguntas */}
      {step >= 1 && step <= 4 && perguntas[step - 1] && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
              Pergunta {step} de 4
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={`h-1 w-12 rounded-full transition-all ${
                  i <= step ? 'bg-cyan-400' : 'bg-white/10'
                }`} />
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-cyan-500/5 border-l-4 border-cyan-500 p-4 mb-3">
            <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">{perguntas[step - 1].dimensao}</p>
            <p className="text-sm text-white font-semibold leading-relaxed">{perguntas[step - 1].texto}</p>
          </div>

          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-[11px] text-gray-500 flex-1">
              <b className="text-cyan-400">Dica:</b> Clique em <b className="text-cyan-400">Gravar por voz</b> e fale naturalmente em português — o texto aparece no campo enquanto você fala. Permita acesso ao microfone na primeira vez.
            </p>
            <MicInput ref={micRef} value={respostas[step - 1]}
              onChange={val => setResposta(step - 1, val)} disabled={busy} />
          </div>

          <textarea value={respostas[step - 1]}
            onChange={e => setResposta(step - 1, e.target.value)}
            placeholder="Descreva com detalhes sua resposta..."
            rows={6}
            disabled={busy}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 resize-vertical" />

          <div className="flex items-center justify-between mt-2 mb-4">
            <span className={`text-[11px] ${respostas[step - 1].trim().length >= MIN_CHARS ? 'text-emerald-400' : 'text-red-400'}`}>
              {respostas[step - 1].length} / mín. {MIN_CHARS} caracteres
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => { micRef.current?.stop(); setStep(step - 1); }} disabled={busy}
              className="flex-1 py-3 rounded-xl border border-white/10 hover:border-white/30 text-sm text-gray-300 disabled:opacity-50">
              ← Anterior
            </button>
            {step < 4 ? (
              <button onClick={() => {
                if (respostas[step - 1].trim().length < MIN_CHARS) { alert(`Mínimo ${MIN_CHARS} caracteres.`); return; }
                micRef.current?.stop(); setStep(step + 1);
              }} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#091D35] font-bold text-sm disabled:opacity-50">
                Próxima →
              </button>
            ) : (
              <button onClick={() => { micRef.current?.stop(); finalizar(); }} disabled={busy}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#091D35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {busy ? <><Loader2 size={14} className="animate-spin" /> Processando...</> : <>Finalizar avaliação</>}
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
            <p className="text-base font-bold text-white">Avaliação concluída</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className="text-xl font-bold text-white">{avaliacao.nota_media_pre}</p>
              <p className="text-[10px] text-gray-500 uppercase">Pré</p>
            </div>
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className="text-xl font-bold text-cyan-400">{avaliacao.nota_media_pos}</p>
              <p className="text-[10px] text-gray-500 uppercase">Pós</p>
            </div>
            <div className="text-center rounded-lg bg-white/[0.05] p-3">
              <p className={`text-xl font-bold ${Number(avaliacao.delta_medio) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {Number(avaliacao.delta_medio) > 0 ? '+' : ''}{avaliacao.delta_medio}
              </p>
              <p className="text-[10px] text-gray-500 uppercase">Delta</p>
            </div>
          </div>
          {avaliacao.resumo_avaliacao && (
            <div className="rounded-lg bg-white/[0.03] p-3 text-sm text-gray-200 mb-4">
              {avaliacao.resumo_avaliacao}
            </div>
          )}
          <button onClick={() => router.push('/dashboard/temporada/concluida')}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 hover:opacity-90 text-sm font-bold text-white">
            Ver relatório completo →
          </button>
        </div>
      )}
    </div>
  );
}
