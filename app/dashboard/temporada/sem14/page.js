'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, Send, CheckCircle, AlertTriangle, Shield } from 'lucide-react';
import { loadTemporadaPorEmail } from '@/actions/temporadas';
import ReactMarkdown from 'react-markdown';

/**
 * Avaliação Final da Temporada (Semana 14).
 * UX idêntica ao mapeamento (/dashboard/assessment/chat): header, chat
 * bubble, input fixo, card de avaliação ao fim. Backend:
 * /api/temporada/evaluation com 4 perguntas estáticas do cenário B.
 */
export default function Sem14Page() {
  const router = useRouter();
  const sb = getSupabase();
  const scrollRef = useRef(null);

  const [trilhaId, setTrilhaId] = useState(null);
  const [competencia, setCompetencia] = useState('');
  const [cenario, setCenario] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [dimensaoAtual, setDimensaoAtual] = useState('SITUAÇÃO');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [finished, setFinished] = useState(false);
  const [avaliacao, setAvaliacao] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaPorEmail(user.email);
      if (r.error || !r.trilha) { setError(r.error || 'Sem trilha'); setInitLoading(false); return; }
      setTrilhaId(r.trilha.id);
      setCompetencia(r.trilha.competencia_foco);

      // Carrega estado da sem 14 OU inicia
      const prog = (r.progresso || []).find(p => p.semana === 14);
      const fb = prog?.feedback || {};
      if (fb.transcript_completo?.length > 0) {
        setMessages(fb.transcript_completo);
        setCenario(fb.cenario || '');
        if (prog.status === 'concluido') {
          setFinished(true);
          setAvaliacao({
            nota_media_pre: fb.nota_media_pre,
            nota_media_pos: fb.nota_media_pos,
            delta_medio: fb.delta_medio,
            resumo_avaliacao: fb.resumo_avaliacao,
            avaliacao_por_descritor: fb.avaliacao_por_descritor || [],
          });
        } else {
          const ultima = fb.transcript_completo[fb.transcript_completo.length - 1];
          if (ultima?.dimensao) setDimensaoAtual(ultima.dimensao);
        }
      } else {
        // Dispara init
        const initResp = await fetch('/api/temporada/evaluation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trilhaId: r.trilha.id, semana: 14, action: 'init' }),
        });
        if (!initResp.ok) {
          const err = await initResp.json();
          setError(err.error || 'Erro ao iniciar sem 14');
          setInitLoading(false); return;
        }
        const data = await initResp.json();
        setCenario(data.cenario || '');
        setMessages(data.history || []);
        if (data.history?.length) setDimensaoAtual(data.history[0].dimensao || 'SITUAÇÃO');
      }
      setInitLoading(false);
    })();
  }, [router, sb]);

  async function handleSend(e) {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input;
    setInput('');
    setMessages(m => [...m, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setLoading(true);
    const r = await fetch('/api/temporada/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId, semana: 14, action: 'send', message: msg }),
    });
    if (!r.ok) {
      const err = await r.json();
      alert(err.error || 'Erro ao enviar');
      setLoading(false); return;
    }
    const data = await r.json();
    if (data.history) setMessages(data.history);
    if (data.dimensao) setDimensaoAtual(data.dimensao);
    if (data.finished) {
      setFinished(true);
      setAvaliacao(data.avaliacao);
    }
    setLoading(false);
  }

  if (initLoading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return (
    <div className="flex items-center justify-center h-[60dvh]">
      <div className="text-center">
        <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => router.push('/dashboard/temporada')} className="text-xs text-cyan-400 mt-3 hover:underline">← Voltar</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--header-height)-var(--nav-height))]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/dashboard/temporada')} className="text-gray-500 hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="text-center flex-1 px-3">
            <p className="text-sm font-bold text-white truncate">{competencia || 'Avaliação Final'}</p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-400/15 text-purple-300">
                Semana 14 · Avaliação
              </span>
              {!finished && (
                <span className="text-[10px] text-gray-500">
                  Dimensão: <span className="text-cyan-400 font-bold">{dimensaoAtual}</span>
                </span>
              )}
              {finished && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/15 text-green-400">
                  Concluída
                </span>
              )}
            </div>
          </div>
          <Shield size={18} className="text-gray-700" />
        </div>
      </div>

      {/* Cenário colapsável */}
      {cenario && (
        <div className="shrink-0 mx-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03]">
          <details>
            <summary className="cursor-pointer px-4 py-2.5 text-[11px] font-bold text-amber-400 uppercase tracking-widest">
              Cenário final · clique para expandir
            </summary>
            <div className="px-4 pb-3 prose prose-invert prose-sm max-w-none text-xs text-gray-300">
              <ReactMarkdown>{cenario}</ReactMarkdown>
            </div>
          </details>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-cyan-500/15 text-cyan-100 rounded-br-md'
                : 'bg-white/[0.06] text-gray-200 rounded-bl-md'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.06] px-4 py-3 rounded-2xl rounded-bl-md">
              <Loader2 size={16} className="animate-spin text-gray-500" />
            </div>
          </div>
        )}
      </div>

      {/* Avaliação final */}
      {avaliacao && (
        <div className="shrink-0 mx-4 mb-3 rounded-xl border border-green-400/20 overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-4 py-2.5 border-b border-green-400/10 flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-xs font-bold text-green-400">Avaliação Concluída</span>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className="text-lg font-bold text-white">{avaliacao.nota_media_pre}</p>
                <p className="text-[9px] text-gray-500 uppercase">Pré</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className="text-lg font-bold text-cyan-400">{avaliacao.nota_media_pos}</p>
                <p className="text-[9px] text-gray-500 uppercase">Pós</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className={`text-lg font-bold ${Number(avaliacao.delta_medio) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Number(avaliacao.delta_medio) > 0 ? '+' : ''}{avaliacao.delta_medio}
                </p>
                <p className="text-[9px] text-gray-500 uppercase">Delta</p>
              </div>
            </div>
            {avaliacao.resumo_avaliacao && (
              <div className="p-3 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
                <p className="text-xs text-gray-300 leading-relaxed">{avaliacao.resumo_avaliacao}</p>
              </div>
            )}
            <button onClick={() => router.push('/dashboard/temporada/concluida')}
              className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-emerald-600 hover:opacity-90 text-sm font-bold">
              Ver relatório completo →
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {!finished && (
        <form onSubmit={handleSend} className="shrink-0 flex items-center gap-2 p-3 border-t border-white/[0.06]" style={{ background: '#091D35' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Sua resposta..."
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-400/40 disabled:opacity-50"
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={16} className="text-[#091D35]" />
          </button>
        </form>
      )}
    </div>
  );
}
