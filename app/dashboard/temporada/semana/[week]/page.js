'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import ReactMarkdown from 'react-markdown';
import { Loader2, ArrowLeft, Video, FileText, Headphones, BookOpen, Send, Sparkles, Target, Check } from 'lucide-react';
import { loadTemporadaPorEmail, marcarConteudoConsumido } from '@/actions/temporadas';
import { PageContainer, GlassCard } from '@/components/page-shell';
import MicInput from '@/components/mic-input';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };

export default function SemanaPage({ params }) {
  const { week } = use(params);
  const semanaNum = Number(week);
  const router = useRouter();
  const sb = getSupabase();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formatoAtivo, setFormatoAtivo] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFinished, setChatFinished] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const r = await loadTemporadaPorEmail(user.email);
      if (!r.error) {
        setData(r);
        const semana = (r.trilha?.temporada_plano || []).find(s => s.semana === semanaNum);
        setFormatoAtivo(semana?.conteudo?.formato_core || null);
        const prog = (r.progresso || []).find(p => p.semana === semanaNum);
        const slot = semana?.tipo === 'aplicacao' ? 'feedback' : 'reflexao';
        const transcript = prog?.[slot]?.transcript_completo || [];
        if (transcript.length > 0) {
          setChatHistory(transcript);
          setChatStarted(true);
          setChatFinished(prog?.status === 'concluido');
        }
      }
      setLoading(false);
    })();
  }, [router, sb, semanaNum]);

  if (loading) return <Center><Loader2 className="animate-spin text-cyan-400" /></Center>;
  if (!data?.trilha) return <Center><p className="text-gray-400">Temporada não encontrada</p></Center>;

  const semana = (data.trilha.temporada_plano || []).find(s => s.semana === semanaNum);
  if (!semana) return <Center><p className="text-gray-400">Semana inválida</p></Center>;

  const isAplicacao = semana.tipo === 'aplicacao';
  const isAvaliacao = semana.tipo === 'avaliacao';
  const conteudo = semana.conteudo;
  const cenario = semana.cenario;
  const progressoSemana = (data.progresso || []).find(p => p.semana === semanaNum);
  const conteudoConsumido = progressoSemana?.conteudo_consumido;

  async function handleConsumido() {
    await marcarConteudoConsumido(data.trilha.id, semanaNum);
    const r = await loadTemporadaPorEmail((await sb.auth.getUser()).data.user.email);
    setData(r);
  }

  async function startChat() {
    setChatStarted(true);
    setChatBusy(true);
    const r = await fetch('/api/temporada/reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, action: 'init' }),
    }).then(r => r.json());
    if (r.history) setChatHistory(r.history);
    setChatFinished(!!r.finished);
    setChatBusy(false);
  }

  async function sendMessage() {
    if (!chatInput.trim() || chatBusy) return;
    const msg = chatInput;
    setChatInput('');
    setChatHistory(h => [...h, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setChatBusy(true);
    const r = await fetch('/api/temporada/reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, message: msg, action: 'send' }),
    }).then(r => r.json());
    if (r.history) setChatHistory(r.history);
    setChatFinished(!!r.finished);
    setChatBusy(false);
  }

  return (
    <PageContainer>
      <button onClick={() => router.push('/dashboard/temporada')} className="flex items-center gap-2 text-xs text-gray-400 hover:text-cyan-400 mb-4">
        <ArrowLeft size={14} /> Voltar à temporada
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase text-cyan-400 mb-1">
          Semana {semanaNum} de 14 · {isAplicacao ? 'Aplicação Prática' : isAvaliacao ? 'Avaliação' : 'Episódio'}
        </div>
        <h1 className="text-2xl font-bold text-white">{semana.descritor || data.trilha.competencia_foco}</h1>
      </div>

      {/* Conteúdo da semana */}
      {!isAplicacao && !isAvaliacao && conteudo && (
        <>
          <GlassCard className="mb-4">
            <ConteudoViewer conteudo={conteudo} formatoAtivo={formatoAtivo} setFormatoAtivo={setFormatoAtivo} />
            {!conteudoConsumido && (
              <button onClick={handleConsumido} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold">
                <Check size={14} /> Marcar como assistido
              </button>
            )}
            {conteudoConsumido && (
              <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs">
                <Check size={14} /> Conteúdo concluído
              </div>
            )}
          </GlassCard>

          <GlassCard className="mb-4 border-cyan-500/30 bg-cyan-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-cyan-400" />
              <span className="text-xs uppercase text-cyan-400 font-bold">Desafio da semana</span>
            </div>
            <p className="text-sm text-gray-200">{conteudo.desafio_texto}</p>
          </GlassCard>
        </>
      )}

      {/* Cenário (semanas de aplicação) */}
      {isAplicacao && cenario && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Target size={16} className="text-amber-400" />
            <span className="text-xs uppercase text-amber-400 font-bold">Cenário · {cenario.complexidade}</span>
          </div>
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{cenario.texto}</ReactMarkdown>
          </div>
        </GlassCard>
      )}

      {isAvaliacao && (
        <GlassCard className="mb-4">
          <p className="text-sm text-gray-300">Avaliação será liberada após você concluir todos os episódios anteriores.</p>
        </GlassCard>
      )}

      {/* Chat com Mentor IA */}
      {!isAvaliacao && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">
              {isAplicacao ? 'Feedback do Mentor IA' : 'Reflexão com o Mentor IA'}
            </span>
          </div>

          {!chatStarted ? (
            <button
              onClick={startChat}
              disabled={!conteudoConsumido && !isAplicacao}
              className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold"
            >
              {isAplicacao ? 'Enviar minha resposta' : 'Conversar com o Mentor'}
            </button>
          ) : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-3">
                {chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> pensando...
                    </div>
                  </div>
                )}
              </div>

              {!chatFinished ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                      placeholder={isAplicacao ? 'Descreva como você conduziria...' : 'Sua resposta...'}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                      disabled={chatBusy}
                    />
                    <button onClick={sendMessage} disabled={chatBusy || !chatInput.trim()} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </div>
                  <MicInput value={chatInput} onChange={setChatInput} disabled={chatBusy} />
                </div>
              ) : (
                <div className="text-center text-emerald-400 text-xs py-2">
                  ✓ Conversa concluída · Próxima semana liberada
                </div>
              )}
            </>
          )}
        </GlassCard>
      )}
    </PageContainer>
  );
}

function ConteudoViewer({ conteudo, formatoAtivo, setFormatoAtivo }) {
  const formatos = Object.keys(conteudo.formatos_disponiveis || {});
  const ativo = formatoAtivo || conteudo.formato_core;
  const item = conteudo.formatos_disponiveis?.[ativo] || (ativo === conteudo.formato_core ? { url: conteudo.core_url, titulo: conteudo.core_titulo } : null);

  return (
    <div>
      {/* Switch de formatos */}
      {formatos.length > 1 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] uppercase text-gray-500">Disponível em:</span>
          {formatos.map(f => {
            const Icon = FORMAT_ICON[f] || FileText;
            const ativ = f === ativo;
            return (
              <button key={f} onClick={() => setFormatoAtivo(f)} className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] ${
                ativ ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}>
                <Icon size={12} /> {f}
              </button>
            );
          })}
        </div>
      )}

      {/* Renderização */}
      {!item?.url && conteudo.fallback_gerado && (
        <div className="text-sm text-gray-400 italic p-4 rounded bg-white/5 border border-amber-500/20">
          Estamos preparando mais formatos para este episódio. Foque no desafio e na reflexão abaixo.
        </div>
      )}
      {item?.url && ativo === 'video' && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe src={item.url} className="w-full h-full" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
        </div>
      )}
      {item?.url && ativo === 'audio' && (
        <audio controls className="w-full" src={item.url} />
      )}
      {item?.url && (ativo === 'texto' || ativo === 'case') && (
        <div className="prose prose-invert prose-sm max-w-none">
          <a href={item.url} target="_blank" rel="noopener" className="text-cyan-400">Abrir conteúdo →</a>
        </div>
      )}
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}
