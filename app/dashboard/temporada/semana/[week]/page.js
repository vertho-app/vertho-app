'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { formatarLiberacao } from '@/lib/season-engine/week-gating';
import ReactMarkdown from 'react-markdown';
import { Loader2, ArrowLeft, Video, FileText, Headphones, BookOpen, Send, Sparkles, Target, Check, HelpCircle } from 'lucide-react';
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
  // Só libera "Marcar como realizado" depois que o colab abriu o link do conteúdo
  // (ou, pra vídeo, o auto-consumido dispara no 80% via postMessage).
  const [abriuConteudo, setAbriuConteudo] = useState(false);
  // Tira-Dúvidas — estado independente do chat de Evidências.
  const [tdHistory, setTdHistory] = useState([]);
  const [tdInput, setTdInput] = useState('');
  const [tdBusy, setTdBusy] = useState(false);
  const [tdOpen, setTdOpen] = useState(false);

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
        const tdTranscript = prog?.tira_duvidas?.transcript_completo || [];
        if (tdTranscript.length > 0) {
          setTdHistory(tdTranscript);
          setTdOpen(true);
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

  // Escolhe endpoint conforme tipo da semana
  const isEvalSemana = semanaNum === 13 || semanaNum === 14;
  const endpoint = isEvalSemana ? '/api/temporada/evaluation' : '/api/temporada/reflection';

  async function startChat() {
    setChatStarted(true);
    setChatBusy(true);
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, action: 'init' }),
    }).then(r => r.json());
    if (r.history) setChatHistory(r.history);
    setChatFinished(!!r.finished);
    setChatBusy(false);
  }

  async function sendTiraDuvida() {
    if (!tdInput.trim() || tdBusy) return;
    const msg = tdInput;
    setTdInput('');
    setTdHistory(h => [...h, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setTdBusy(true);
    const r = await fetch('/api/temporada/tira-duvidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: data.trilha.id, semana: semanaNum, message: msg }),
    }).then(r => r.json());
    if (r.history) setTdHistory(r.history);
    setTdBusy(false);
  }

  async function sendMessage() {
    if (!chatInput.trim() || chatBusy) return;
    const msg = chatInput;
    setChatInput('');
    setChatHistory(h => [...h, { role: 'user', content: msg, timestamp: new Date().toISOString() }]);
    setChatBusy(true);
    const r = await fetch(endpoint, {
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
            <ConteudoViewer conteudo={conteudo} formatoAtivo={formatoAtivo} setFormatoAtivo={setFormatoAtivo}
              trilhaId={data.trilha.id} semana={semanaNum}
              onAbrirConteudo={() => setAbriuConteudo(true)}
              onAutoConsumido={() => !conteudoConsumido && handleConsumido()} />
            {!conteudoConsumido && (
              <button onClick={handleConsumido} disabled={!abriuConteudo}
                title={!abriuConteudo ? 'Abra o conteúdo antes de marcar como realizado' : ''}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold">
                <Check size={14} /> Marcar como realizado
              </button>
            )}
            {conteudoConsumido && (
              <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs">
                <Check size={14} /> Conteúdo realizado
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

      {isAvaliacao && semanaNum === 13 && (
        <GlassCard className="mb-4 border-purple-500/30 bg-purple-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">Fechamento qualitativo</span>
          </div>
          <p className="text-sm text-gray-300">
            Chegou a hora de olhar pra trás. Vamos conversar sobre o que mudou em você nessas 12 semanas, percorrendo cada descritor.
          </p>
        </GlassCard>
      )}

      {isAvaliacao && semanaNum === 14 && (
        <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Target size={16} className="text-amber-400" />
            <span className="text-xs uppercase text-amber-400 font-bold">Cenário final</span>
          </div>
          <p className="text-sm text-gray-300">
            Um cenário completo para você aplicar tudo o que desenvolveu. Sua resposta será avaliada em cada descritor da competência.
          </p>
        </GlassCard>
      )}

      {/* Tira-Dúvidas: só em semanas de conteúdo, após consumir o conteúdo.
          Chat livre focado no descritor da semana (guard-rail no prompt). */}
      {!isAplicacao && !isAvaliacao && conteudoConsumido && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={16} className="text-cyan-400" />
            <span className="text-xs uppercase text-cyan-400 font-bold">Tira-Dúvidas</span>
            <span className="text-[10px] text-gray-500">· só responde sobre {semana.descritor}</span>
          </div>

          {!tdOpen ? (
            <button onClick={() => setTdOpen(true)}
              className="w-full px-4 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-sm font-bold">
              Tirar dúvida sobre a semana
            </button>
          ) : (
            <>
              <div className="space-y-3 max-h-80 overflow-y-auto mb-3">
                {tdHistory.length === 0 && (
                  <p className="text-xs text-gray-500 italic text-center py-4">
                    Pergunte o que quiser sobre <span className="text-cyan-400">{semana.descritor}</span>.
                  </p>
                )}
                {tdHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {tdBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> pensando...
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input type="text" value={tdInput}
                    onChange={e => setTdInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendTiraDuvida()}
                    placeholder="Sua dúvida..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                    disabled={tdBusy} />
                  <button onClick={sendTiraDuvida} disabled={tdBusy || !tdInput.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
                <MicInput value={tdInput} onChange={setTdInput} disabled={tdBusy} />
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Evidências — socrático, levanta evidências do comportamento do colab.
          (Antes chamado de "Mentor IA".) Inclui semanas de avaliação (13/14). */}
      {true && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">
              {semanaNum === 13 ? 'Conversa de fechamento'
               : semanaNum === 14 ? 'Cenário + avaliação final'
               : isAplicacao ? 'Feedback (Evidências)'
               : 'Evidências'}
            </span>
          </div>

          {!chatStarted ? (
            <button
              onClick={startChat}
              disabled={!conteudoConsumido && !isAplicacao && !isAvaliacao}
              className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-sm font-bold"
            >
              {semanaNum === 13 ? 'Iniciar conversa de fechamento'
               : semanaNum === 14 ? 'Ver cenário final'
               : isAplicacao ? 'Enviar minha resposta'
               : 'Levantar evidências'}
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
                  {semanaNum >= 14
                    ? '✓ Conversa concluída · Temporada finalizada'
                    : `✓ Conversa concluída · Próxima semana libera ${formatarLiberacao(data.trilha.data_inicio, semanaNum + 1)}`}
                </div>
              )}
            </>
          )}
        </GlassCard>
      )}
    </PageContainer>
  );
}

function ConteudoViewer({ conteudo, formatoAtivo, setFormatoAtivo, onAutoConsumido, onAbrirConteudo, trilhaId, semana }) {
  const formatos = Object.keys(conteudo.formatos_disponiveis || {});
  const ativo = formatoAtivo || conteudo.formato_core;
  const item = conteudo.formatos_disponiveis?.[ativo] || (ativo === conteudo.formato_core ? { url: conteudo.core_url, titulo: conteudo.core_titulo } : null);

  // Listener postMessage Bunny → auto-marca conteudo_consumido ao atingir 80%
  useEffect(() => {
    if (ativo !== 'video') return;
    let markedRef = false;
    const handler = (event) => {
      if (!event.origin?.includes('mediadelivery.net')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        // Bunny player.js envia 'timeupdate' com seconds/duration, ou 'play_finished'
        const pct = data?.progress != null ? Number(data.progress) :
                    (data?.seconds && data?.duration ? data.seconds / data.duration : null);
        // Play iniciado libera o botão "Marcar como realizado"
        if (data?.event === 'play' || data?.event === 'playing' || data?.event === 'play_started') {
          onAbrirConteudo?.();
        }
        if ((pct && pct >= 0.8) || data?.event === 'play_finished' || data?.event === 'ended') {
          if (!markedRef && onAutoConsumido) {
            markedRef = true;
            onAutoConsumido();
          }
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [ativo, onAutoConsumido]);

  // Adiciona metaData na URL do Bunny embed (atribuição de view)
  const embedUrl = (() => {
    if (ativo !== 'video' || !item?.url) return item?.url;
    try {
      const u = new URL(item.url);
      u.searchParams.set('metaData', `trilha-${trilhaId}_semana-${semana}`);
      return u.toString();
    } catch { return item.url; }
  })();

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
          <iframe src={embedUrl} className="w-full h-full" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
        </div>
      )}
      {item?.url && ativo === 'audio' && (
        <audio controls className="w-full" src={item.url} />
      )}
      {item?.url && (ativo === 'texto' || ativo === 'case') && (
        <div className="prose prose-invert prose-sm max-w-none">
          <a href={item.url} target="_blank" rel="noopener"
            onClick={() => onAbrirConteudo?.()}
            className="text-cyan-400">Abrir conteúdo →</a>
        </div>
      )}
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}
