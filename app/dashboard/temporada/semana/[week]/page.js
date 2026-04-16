'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { formatarLiberacao } from '@/lib/season-engine/week-gating';
import ReactMarkdown from 'react-markdown';
import { Loader2, ArrowLeft, Video, FileText, Headphones, BookOpen, Send, Sparkles, Target, Check, HelpCircle } from 'lucide-react';
import { loadTemporadaPorEmail, marcarConteudoConsumido } from '@/actions/temporadas';
import { PageContainer, GlassCard } from '@/components/page-shell';
import MicInput from '@/components/mic-input';

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen };

/**
 * Remove o título do cenário (cenários antigos vinham com "## Título" ou
 * uma linha solta antes do "**Contexto:**"). Novos cenários já não têm,
 * mas mantemos o strip defensivo.
 */
function stripCenarioTitulo(texto) {
  if (!texto) return '';
  const linhas = String(texto).split('\n');
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i].trim();
    if (!l) { i++; continue; }
    // markdown heading
    if (/^#{1,6}\s/.test(l)) { i++; continue; }
    // linha solta antes do Contexto: (sem negrito, sem prefixo)
    if (!/^\*\*|^-\s/.test(l) && i + 1 < linhas.length && /\*\*Contexto:/i.test(linhas.slice(i + 1).join('\n'))) {
      i++;
      continue;
    }
    break;
  }
  return linhas.slice(i).join('\n');
}

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
  // Missão Prática (sems 4/8/12): modo + compromisso.
  // modo=null → nada escolhido; 'pratica' → vai executar na vida real; 'cenario' → fallback escrito
  const [compromissoInput, setCompromissoInput] = useState('');
  const [missaoBusy, setMissaoBusy] = useState(false);
  // Refs pros MicInputs: ao enviar mensagem paramos a gravação automaticamente.
  const chatMicRef = useRef(null);
  const tdMicRef = useRef(null);

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
        // Sem 14 guarda dados em `feedback`, mesmo sendo tipo='avaliacao'.
        // Sem 13 em `reflexao`. Aplicação (4/8/12) em `feedback`. Conteúdo em `reflexao`.
        const slot = (semana?.tipo === 'aplicacao' || semanaNum === 14) ? 'feedback' : 'reflexao';
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

  // Sem 14 tem UI própria (idêntica ao mapeamento)
  if (semanaNum === 14) { router.replace('/dashboard/temporada/sem14'); return <Center><Loader2 className="animate-spin text-cyan-400" /></Center>; }
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
    // Sem 14: init grava cenario no feedback — recarrega pra renderizar na tela.
    if (semanaNum === 14 && r.cenario) {
      const user = (await sb.auth.getUser()).data.user;
      const fresh = await loadTemporadaPorEmail(user.email);
      setData(fresh);
    }
  }

  async function setMissaoModo(modo) {
    if (missaoBusy) return;
    if (modo === 'pratica' && !compromissoInput.trim()) return;
    setMissaoBusy(true);
    const r = await fetch('/api/temporada/missao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trilhaId: data.trilha.id,
        semana: semanaNum,
        modo,
        compromisso: modo === 'pratica' ? compromissoInput.trim() : undefined,
      }),
    }).then(r => r.json());
    setMissaoBusy(false);
    if (!r.error) {
      const user = (await sb.auth.getUser()).data.user;
      const fresh = await loadTemporadaPorEmail(user.email);
      setData(fresh);
    }
  }

  async function sendTiraDuvida() {
    if (!tdInput.trim() || tdBusy) return;
    tdMicRef.current?.stop();
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
    chatMicRef.current?.stop();
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
          Semana {semanaNum} de 14 · {isAplicacao ? 'Prática' : isAvaliacao ? 'Avaliação' : 'Episódio'}
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

      {/* Missão Prática (sems 4/8/12). Três estados:
          (A) sem modo: apresenta missão + form de compromisso OU opção pelo cenário escrito.
          (B) modo=pratica: missão + compromisso salvo (readonly) — chat abaixo vira "relate o que você fez".
          (C) modo=cenario: fallback escrito (Contexto) — chat abaixo segue fluxo analítico clássico. */}
      {isAplicacao && (() => {
        const modoAplicacao = progressoSemana?.feedback?.modo;
        const compromissoSalvo = progressoSemana?.feedback?.compromisso;
        const missaoTexto = semana.missao?.texto;

        // Retro-compat: trilhas antigas não têm missao → skip escolha, vai direto pro cenário.
        const modoEfetivo = modoAplicacao || (!missaoTexto ? 'cenario' : null);

        // Estado A — escolha de modo (só se tem missao e ainda não escolheu)
        if (!modoEfetivo) {
          return (
            <GlassCard className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-amber-400" />
                <span className="text-xs uppercase text-amber-400 font-bold">Missão da Semana</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none mb-4">
                <ReactMarkdown>{missaoTexto}</ReactMarkdown>
              </div>
              <label className="block text-xs text-gray-400 mb-2">
                Qual situação da sua rotina você vai usar pra aplicar isso? (1-2 frases)
              </label>
              <textarea value={compromissoInput}
                onChange={e => setCompromissoInput(e.target.value)}
                rows={2} placeholder="Ex: a reunião de quarta com o cliente X..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 mb-3" />
              <button onClick={() => setMissaoModo('pratica')}
                disabled={missaoBusy || !compromissoInput.trim()}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm font-bold">
                Aceito a missão
              </button>
            </GlassCard>
          );
        }

        // Estado B — modo=pratica
        if (modoAplicacao === 'pratica') {
          return (
            <GlassCard className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Target size={16} className="text-amber-400" />
                <span className="text-xs uppercase text-amber-400 font-bold">Missão da Semana</span>
              </div>
              {missaoTexto && (
                <div className="prose prose-invert prose-sm max-w-none mb-3">
                  <ReactMarkdown>{missaoTexto}</ReactMarkdown>
                </div>
              )}
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 mb-3">
                <p className="text-[10px] uppercase text-amber-400 font-bold tracking-wider mb-1">Seu compromisso</p>
                <p className="text-sm text-gray-200">{compromissoSalvo}</p>
              </div>
              {!chatStarted && (
                <>
                  <p className="text-xs text-gray-400 mb-3">
                    Você conseguiu executar a missão esta semana?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={startChat}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold min-w-[80px]">
                      Sim
                    </button>
                    <button onClick={() => setMissaoModo('cenario')}
                      disabled={missaoBusy}
                      className="px-5 py-2 rounded-lg border border-white/15 hover:border-white/30 disabled:opacity-50 text-sm text-gray-300 min-w-[80px]">
                      Não
                    </button>
                  </div>
                </>
              )}
            </GlassCard>
          );
        }

        // Estado C — modo=cenario (fallback)
        return (
          <GlassCard className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={16} className="text-amber-400" />
              <span className="text-xs uppercase text-amber-400 font-bold">Contexto</span>
            </div>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{stripCenarioTitulo(cenario?.texto || '')}</ReactMarkdown>
            </div>
          </GlassCard>
        );
      })()}

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

      {isAvaliacao && semanaNum === 14 && (() => {
        // Se já tem cenário em feedback, mostra. Senão, placeholder informativo.
        const cenarioTexto = progressoSemana?.feedback?.cenario;
        return (
          <GlassCard className="mb-4 border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-amber-400" />
              <span className="text-xs uppercase text-amber-400 font-bold">Cenário final</span>
            </div>
            {cenarioTexto ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{stripCenarioTitulo(cenarioTexto)}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-gray-300">
                Um cenário completo para você aplicar tudo o que desenvolveu. Clique em <span className="text-purple-400">Ver cenário final</span> abaixo pra começar.
              </p>
            )}
          </GlassCard>
        );
      })()}

      {/* Tira-Dúvidas: só em semanas de conteúdo. Botão liberado após marcar
          o conteúdo como realizado — mas renderiza o card sempre pra dar
          visibilidade do recurso. */}
      {!isAplicacao && !isAvaliacao && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <HelpCircle size={16} className="text-cyan-400" />
            <span className="text-xs uppercase text-cyan-400 font-bold">Tira-Dúvidas</span>
            <span className="text-[10px] text-gray-500">· só responde sobre {semana.descritor}</span>
          </div>

          {!tdOpen ? (
            <button onClick={() => setTdOpen(true)}
              disabled={!conteudoConsumido}
              title={!conteudoConsumido ? 'Marque o conteúdo como realizado antes de tirar dúvidas' : ''}
              className="w-full px-4 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold">
              {conteudoConsumido ? 'Tirar dúvida sobre a semana' : 'Libera após marcar conteúdo como realizado'}
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
                  <textarea value={tdInput}
                    onChange={e => setTdInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTiraDuvida(); } }}
                    placeholder="Sua dúvida... (Shift+Enter pra nova linha)"
                    rows={2}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 resize-none"
                    disabled={tdBusy} />
                  <button onClick={sendTiraDuvida} disabled={tdBusy || !tdInput.trim()}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                    <Send size={16} />
                  </button>
                </div>
                <MicInput ref={tdMicRef} value={tdInput} onChange={setTdInput} disabled={tdBusy} />
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Evidências — socrático, levanta evidências do comportamento do colab.
          (Antes chamado de "Mentor IA".) Inclui semanas de avaliação (13/14).
          Em sems 4/8/12 com modo=prática, só aparece depois do colab clicar 'Sim'
          (chatStarted) pra não poluir a tela com botão duplicado / card sem sentido. */}
      {!(isAplicacao && progressoSemana?.feedback?.modo === 'pratica' && !chatStarted) && (
        <GlassCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-purple-400" />
            <span className="text-xs uppercase text-purple-400 font-bold">
              {semanaNum === 13 ? 'Conversa de fechamento'
               : semanaNum === 14 ? 'Cenário + avaliação final'
               : isAplicacao
                 ? (progressoSemana?.feedback?.modo === 'pratica' ? 'Relato da Missão' : 'Feedback (Evidências)')
                 : 'Evidências'}
            </span>
          </div>

          {!chatStarted ? (() => {
            // Em sems 4/8/12 o chat só destrava após o modo ser definido.
            // Retro-compat: trilhas antigas sem missao não exigem modo.
            const temMissao = !!semana.missao?.texto;
            const modoPratica = progressoSemana?.feedback?.modo === 'pratica';
            const aplicacaoSemModo = isAplicacao && temMissao && !progressoSemana?.feedback?.modo;
            // Em modo prática, a entrada é o botão "Sim, consegui" no card acima.
            if (modoPratica) {
              return (
                <p className="text-xs text-gray-500 italic">
                  Clique em <span className="text-emerald-400">Sim, consegui — relatar execução</span> acima pra começar.
                </p>
              );
            }
            return (
              <button
                onClick={startChat}
                disabled={(!conteudoConsumido && !isAplicacao && !isAvaliacao) || aplicacaoSemModo}
                title={aplicacaoSemModo ? 'Defina como vai executar a missão antes' : ''}
                className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
              >
                {semanaNum === 13 ? 'Iniciar conversa de fechamento'
                 : semanaNum === 14 ? 'Ver cenário final'
                 : isAplicacao ? 'Enviar minha resposta'
                 : 'Levantar evidências'}
              </button>
            );
          })() : (
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
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={
                        isAplicacao
                          ? (progressoSemana?.feedback?.modo === 'pratica'
                              ? 'Relate o que aconteceu... (Shift+Enter pra nova linha)'
                              : 'Descreva como você conduziria... (Shift+Enter pra nova linha)')
                          : 'Sua resposta... (Shift+Enter pra nova linha)'
                      }
                      rows={2}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-500 resize-none"
                      disabled={chatBusy}
                    />
                    <button onClick={sendMessage} disabled={chatBusy || !chatInput.trim()} className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </div>
                  <MicInput ref={chatMicRef} value={chatInput} onChange={setChatInput} disabled={chatBusy} />
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
