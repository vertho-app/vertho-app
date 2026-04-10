'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, CheckCircle, ArrowLeft, ArrowRight, Target, Calendar, FileText, Trophy } from 'lucide-react';
import { getDiagnosticoDoDia, salvarRespostaDiagnostico } from './assessment-actions';

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

export default function AssessmentPage() {
  const router = useRouter();
  const supabase = getSupabase();

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [toast, setToast] = useState(null);

  const [pergIdx, setPergIdx] = useState(0); // 0..3
  const [respostas, setRespostas] = useState({ r1: '', r2: '', r3: '', r4: '' });
  const [repr, setRepr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/login'); return; }
        const r = await getDiagnosticoDoDia(user.email);
        if (!r) { setError('Resposta vazia do servidor'); setPhase(PHASE.ERROR); return; }
        if (r.error) { setError(r.error); setPhase(PHASE.ERROR); return; }
        setData(r);
        if (r.concluiuTudo) setPhase(PHASE.CONCLUIDO);
        else if (r.respondeuHoje) setPhase(PHASE.HOJE);
        else setPhase(PHASE.EXPLICACAO);
      } catch (e) {
        console.error('[assessment init]', e);
        setError(e?.message || 'Erro ao carregar');
        setPhase(PHASE.ERROR);
      }
    })();
  }, []);

  const currentR = useMemo(() => respostas[`r${pergIdx + 1}`] || '', [respostas, pergIdx]);

  function setCurrentR(val) {
    setRespostas(prev => ({ ...prev, [`r${pergIdx + 1}`]: val }));
  }

  function avancarPergunta() {
    if (currentR.trim().length < 20) { flash('Mínimo 20 caracteres.'); return; }
    if (pergIdx === 3) { setPhase(PHASE.REPR); return; }
    setPergIdx(i => i + 1);
  }

  function voltarPergunta() {
    if (pergIdx === 0) { setPhase(PHASE.INTRO); return; }
    setPergIdx(i => i - 1);
  }

  async function enviarResposta() {
    if (!repr) { flash('Escolha a representatividade (1 a 10).'); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const cen = data.cenarioDoDia;
    const r = await salvarRespostaDiagnostico(user.email, cen.cenarioId, cen.compId, cen.compNome, {
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
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (phase === PHASE.ERROR) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <p className="text-base text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[640px] mx-auto px-5 py-6 space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-red-500/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Header com progresso */}
      {data?.progresso && phase !== PHASE.CONCLUIDO && (
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <div className="flex items-center justify-between mb-1">
            <div>
              <p className="text-sm font-bold text-white">{data.colaborador.nome}</p>
              <p className="text-xs text-gray-400">{data.colaborador.cargo}</p>
            </div>
            <span className="text-xs font-extrabold text-cyan-400">{data.progresso.pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${data.progresso.pct}%` }} />
          </div>
          <p className="text-[10px] text-gray-500 mt-1.5">{data.progresso.respondidas} de {data.progresso.total} competências</p>
        </div>
      )}

      {/* ─── EXPLICAÇÃO ─── */}
      {phase === PHASE.EXPLICACAO && (
        <div className="rounded-2xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <div className="text-4xl mb-2">📋</div>
          <p className="text-lg font-extrabold text-white mb-1">Como funciona?</p>
          <p className="text-xs text-gray-500 mb-5">Leia antes de começar</p>
          <div className="space-y-3 text-left mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-400/15 flex items-center justify-center shrink-0"><Calendar size={16} className="text-cyan-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">1 competência por dia</span> · ~10 min cada</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-400/15 flex items-center justify-center shrink-0"><FileText size={16} className="text-purple-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">4 perguntas</span> · cenário real, responda como você agiria</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-400/15 flex items-center justify-center shrink-0"><CheckCircle size={16} className="text-green-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">Confidencial</span> · RH vê apenas dados agregados</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0"><Target size={16} className="text-amber-400" /></div>
              <div className="text-sm text-gray-300"><span className="font-bold text-white">Seja autêntico(a)</span> · sem resposta certa ou errada</div>
            </div>
          </div>
          <button onClick={() => setPhase(PHASE.INTRO)}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition">
            Começar avaliação →
          </button>
        </div>
      )}

      {/* ─── INTRO DO CENÁRIO ─── */}
      {phase === PHASE.INTRO && data?.cenarioDoDia && (
        <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 mb-2">Contexto</p>
          <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap mb-5">{data.cenarioDoDia.contexto}</p>
          <button onClick={() => { setPergIdx(0); setPhase(PHASE.PERGUNTAS); }}
            className="w-full py-3 rounded-xl font-bold text-white bg-gradient-to-br from-[#0F2B54] to-[#1a3a70] hover:brightness-110 transition">
            ▶ Iniciar avaliação
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
            <div className="rounded-xl p-3 mb-3 border-l-4 border-cyan-400" style={{ background: 'rgba(45,212,191,0.05)' }}>
              <p className="text-sm font-semibold text-white leading-snug">{enunciados[pergIdx]}</p>
            </div>
            <textarea
              value={currentR}
              onChange={e => setCurrentR(e.target.value)}
              placeholder="Descreva com detalhes sua resposta…"
              rows={6}
              className="w-full p-3 rounded-xl border-2 border-white/10 bg-[#091D35] text-white text-sm outline-none focus:border-cyan-400 transition-colors placeholder:text-gray-500"
            />
            <p className={`text-right text-[11px] mt-1 ${len < 20 ? 'text-red-400' : 'text-gray-500'}`}>{len} / mín. 20 caracteres</p>
            <div className="flex gap-2 mt-4">
              <button onClick={voltarPergunta}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
                ← Anterior
              </button>
              <button onClick={avancarPergunta}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition">
                {pergIdx === 3 ? 'Representatividade →' : 'Próxima →'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── REPRESENTATIVIDADE ─── */}
      {phase === PHASE.REPR && (
        <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-sm font-semibold text-white leading-snug mb-5">
            Em uma escala de 1 a 10, qual o grau de representatividade desta situação no seu cotidiano?
          </p>
          <div className="flex justify-center gap-1.5 flex-wrap mb-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <button key={n} onClick={() => setRepr(n)}
                className={`w-10 h-10 rounded-lg border-2 text-sm font-extrabold transition-all ${
                  repr === n
                    ? 'bg-cyan-400 border-cyan-400 text-[#0C1829] scale-110'
                    : 'bg-white/[0.02] border-white/10 text-gray-400 hover:border-cyan-400 hover:text-cyan-400'
                }`}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mb-5">
            <span>1 — Raramente</span>
            <span>10 — Muita frequência</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setPhase(PHASE.PERGUNTAS); setPergIdx(3); }}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition disabled:opacity-50">
              ← Anterior
            </button>
            <button onClick={enviarResposta}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              {saving ? 'Enviando...' : 'Enviar avaliação ✓'}
            </button>
          </div>
        </div>
      )}

      {/* ─── CONFIRMAÇÃO ─── */}
      {phase === PHASE.CONFIRM && (
        <div className="rounded-2xl p-6 border border-green-400/30 text-center" style={{ background: 'rgba(16,185,129,0.08)' }}>
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-lg font-extrabold text-green-400 mb-1">Resposta salva!</p>
          <p className="text-sm text-gray-300 mb-5">Sua avaliação foi registrada com sucesso.</p>
          <div className="flex flex-col gap-2">
            {saveResult?.proximaCompetencia && (
              <button onClick={async () => {
                // recarrega pra pegar próxima
                setPhase(PHASE.LOADING);
                setRespostas({ r1: '', r2: '', r3: '', r4: '' });
                setRepr(null);
                setPergIdx(0);
                setSaveResult(null);
                const { data: { user } } = await supabase.auth.getUser();
                const r = await getDiagnosticoDoDia(user.email);
                if (r.error) { setError(r.error); setPhase(PHASE.ERROR); return; }
                setData(r);
                if (r.concluiuTudo) setPhase(PHASE.CONCLUIDO);
                else setPhase(PHASE.INTRO);
              }}
                className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition">
                Próxima competência →
              </button>
            )}
            <button onClick={() => router.push('/dashboard')}
              className="w-full py-3 rounded-xl font-bold text-gray-300 border border-white/10 hover:bg-white/5 transition">
              Voltar ao dashboard
            </button>
          </div>
        </div>
      )}

      {/* ─── JÁ RESPONDEU HOJE ─── */}
      {phase === PHASE.HOJE && (
        <div className="rounded-2xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <div className="text-5xl mb-3">✅</div>
          <p className="text-lg font-extrabold text-white mb-1">Avaliação do dia concluída!</p>
          <p className="text-sm text-gray-400 mb-5">Volte amanhã para continuar sua jornada.</p>
          <button onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition">
            Voltar ao dashboard
          </button>
        </div>
      )}

      {/* ─── CONCLUIU TUDO ─── */}
      {phase === PHASE.CONCLUIDO && (
        <div className="rounded-2xl p-6 border border-cyan-400/30 text-center" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.08), rgba(252,211,77,0.05))' }}>
          <Trophy size={56} className="text-amber-400 mx-auto mb-3" />
          <p className="text-xl font-black text-white mb-1">Parabéns, {data?.colaborador?.nome?.split(' ')[0] || ''}!</p>
          <p className="text-sm text-gray-300 mb-5">
            Você completou todas as avaliações de competências.<br />
            Em breve você receberá seu relatório personalizado.
          </p>
          <button onClick={() => router.push('/dashboard')}
            className="w-full py-3 rounded-xl font-bold text-[#0C1829] bg-gradient-to-br from-cyan-400 to-cyan-600 hover:brightness-110 transition">
            Voltar ao dashboard
          </button>
        </div>
      )}
    </div>
  );
}
