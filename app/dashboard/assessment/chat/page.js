'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Send, Loader2, CheckCircle, AlertTriangle, ArrowLeft, Shield } from 'lucide-react';
import { getColabByEmail } from '@/app/dashboard/colab-action';

export default function ChatPage() {
  const searchParams = useSearchParams();
  const competenciaId = searchParams.get('competencia');
  const supabase = getSupabase();

  const [user, setUser] = useState(null);
  const [colab, setColab] = useState(null);
  const [sessaoId, setSessaoId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [fase, setFase] = useState('cenario');
  const [status, setStatus] = useState('em_andamento');
  const [confianca, setConfianca] = useState(0);
  const [avaliacao, setAvaliacao] = useState(null);
  const [error, setError] = useState('');
  const [compNome, setCompNome] = useState('');
  const scrollRef = useRef(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // Init: carregar user + colaborador + sessão existente
  useEffect(() => {
    async function init() {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { setError('Não autenticado'); setInitLoading(false); return; }
      setUser(u);

      const c = await getColabByEmail(u.email, 'id, nome_completo, empresa_id');
      if (!c) { setError('Colaborador não encontrado'); setInitLoading(false); return; }
      setColab(c);

      if (!competenciaId) { setError('competencia não informada na URL'); setInitLoading(false); return; }

      // Nome da competência
      const { data: comp } = await supabase.from('competencias')
        .select('nome').eq('id', competenciaId).single();
      if (comp) setCompNome(comp.nome);

      // Buscar sessão ativa
      const { data: sessaoAtiva } = await supabase.from('sessoes_avaliacao')
        .select('id, fase, status, confianca, avaliacao_final')
        .eq('colaborador_id', c.id)
        .eq('competencia_id', competenciaId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (sessaoAtiva) {
        setSessaoId(sessaoAtiva.id);
        setFase(sessaoAtiva.fase);
        setStatus(sessaoAtiva.status);
        setConfianca(sessaoAtiva.confianca || 0);
        if (sessaoAtiva.avaliacao_final) setAvaliacao(sessaoAtiva.avaliacao_final);

        // Carregar histórico
        const { data: hist } = await supabase.from('mensagens_chat')
          .select('role, content, created_at')
          .eq('sessao_id', sessaoAtiva.id)
          .order('created_at');
        if (hist) setMessages(hist.map(m => ({ role: m.role, content: m.content })));
      }

      setInitLoading(false);
    }
    init();
  }, [competenciaId]);

  async function handleSend(e) {
    e?.preventDefault();
    if (!input.trim() || loading || status === 'concluido') return;

    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessaoId,
          empresaId: colab.empresa_id,
          colaboradorId: colab.id,
          competenciaId,
          mensagem: msg,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || 'Erro na API');
        setLoading(false);
        return;
      }

      setSessaoId(data.sessaoId);
      setFase(data.fase);
      setStatus(data.status);
      setConfianca(data.confianca || 0);
      setMessages(prev => [...prev, { role: 'assistant', content: data.mensagem }]);

      if (data.avaliacaoFinal) {
        setAvaliacao(data.avaliacaoFinal);
      }
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }

  if (initLoading) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error && !colab) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <div className="text-center">
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const faseLabel = {
    cenario: 'Cenário',
    aprofundamento: 'Aprofundamento',
    contraexemplo: 'Contraexemplo',
    encerramento: 'Encerramento',
    concluida: 'Concluída',
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-var(--header-height)-var(--nav-height))]">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <div className="flex items-center justify-between">
          <a href="/dashboard/assessment" className="text-gray-500 hover:text-white">
            <ArrowLeft size={18} />
          </a>
          <div className="text-center flex-1 px-3">
            <p className="text-sm font-bold text-white truncate">{compNome || 'Avaliação'}</p>
            <div className="flex items-center justify-center gap-3 mt-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-400/15 text-cyan-400">
                {faseLabel[fase] || fase}
              </span>
              {status === 'em_andamento' && (
                <span className="text-[10px] text-gray-500">
                  Confiança: <span className="text-cyan-400 font-bold">{confianca}%</span>
                </span>
              )}
              {status === 'concluido' && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-400/15 text-green-400">
                  Concluída
                </span>
              )}
            </div>
          </div>
          <Shield size={18} className="text-gray-700" />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500">Envie uma mensagem para iniciar a avaliação.</p>
            <p className="text-xs text-gray-600 mt-1">Descreva como você agiria no cenário apresentado.</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-cyan-500/15 text-cyan-100 rounded-br-md'
                : 'bg-white/[0.06] text-gray-300 rounded-bl-md'
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

      {/* Avaliação Final */}
      {avaliacao && (
        <div className="shrink-0 mx-4 mb-3 rounded-xl border border-green-400/20 overflow-hidden" style={{ background: '#0F2A4A' }}>
          <div className="px-4 py-2.5 border-b border-green-400/10 flex items-center gap-2">
            <CheckCircle size={14} className="text-green-400" />
            <span className="text-xs font-bold text-green-400">Avaliação Concluída</span>
          </div>
          <div className="p-4 space-y-3">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className="text-lg font-bold text-white">N{avaliacao.nivel}</p>
                <p className="text-[9px] text-gray-500 uppercase">Nível</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className="text-lg font-bold text-cyan-400">{avaliacao.nota_decimal}</p>
                <p className="text-[9px] text-gray-500 uppercase">Nota</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#091D35' }}>
                <p className="text-lg font-bold text-amber-400">{avaliacao.lacuna}</p>
                <p className="text-[9px] text-gray-500 uppercase">Lacuna</p>
              </div>
            </div>

            {/* Feedback */}
            {avaliacao.feedback && (
              <div className="space-y-2">
                {avaliacao.feedback.pontos_fortes?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-widest mb-1">Pontos Fortes</p>
                    {avaliacao.feedback.pontos_fortes.map((p, i) => (
                      <p key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-green-400/30 mb-1">{p}</p>
                    ))}
                  </div>
                )}
                {avaliacao.feedback.pontos_melhoria?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Pontos de Melhoria</p>
                    {avaliacao.feedback.pontos_melhoria.map((p, i) => (
                      <p key={i} className="text-xs text-gray-400 pl-3 border-l-2 border-amber-400/30 mb-1">{p}</p>
                    ))}
                  </div>
                )}
                {avaliacao.feedback.resumo && (
                  <div className="p-3 rounded-lg border border-white/[0.06]" style={{ background: '#091D35' }}>
                    <p className="text-xs text-gray-300 leading-relaxed">{avaliacao.feedback.resumo}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      {status !== 'concluido' && (
        <form onSubmit={handleSend} className="shrink-0 flex items-center gap-2 p-3 border-t border-white/[0.06]" style={{ background: '#091D35' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Descreva como você agiria..."
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.05] text-sm text-white outline-none placeholder:text-white/30 focus:border-cyan-400/40 disabled:opacity-50"
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {loading ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}
          </button>
        </form>
      )}

      {/* Error */}
      {error && colab && (
        <div className="shrink-0 px-4 py-2 bg-red-400/10 border-t border-red-400/20">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
