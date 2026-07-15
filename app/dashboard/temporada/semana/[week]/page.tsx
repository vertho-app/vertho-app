'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { formatarLiberacao } from '@/lib/season-engine/week-gating';
import ReactMarkdown from 'react-markdown';
import { Loader2, Video, FileText, Headphones, BookOpen, Send, Sparkles, Target, Check, HelpCircle } from 'lucide-react';
import BackButton from '@/components/back-button';
import { loadTemporadaPorEmail, marcarConteudoConsumido } from '@/actions/temporadas';
import { resolverVideoDaSemana } from '@/actions/gerar-video';
import { useBunnyTracking } from '@/lib/use-bunny-tracking';
import { PageContainer, GlassCard } from '@/components/page-shell';
import MicInput from '@/components/mic-input';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import { registrarEventoTrilha } from '@/actions/engajamento';

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

export default function SemanaPage({ params }: { params: Promise<{ week: string }> }) {
  const t = useTranslations('SeasonWeek');
  const { week } = use(params);
  const semanaNum = Number(week);
  const router = useRouter();
  const searchParams = useSearchParams();
  const sb = getSupabase();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formatoAtivo, setFormatoAtivo] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatFinished, setChatFinished] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);

  // Telemetria: loga a ABERTURA do conteúdo (uma vez), com atribuição por pílula
  // (?p=1|2) e formato (?formato=) vindos do deep-link. Best-effort, nunca quebra.
  const aberturaLogada = useRef(false);
  useEffect(() => {
    const trilhaId = data?.trilha?.id;
    if (!trilhaId || aberturaLogada.current) return;
    aberturaLogada.current = true;
    const pRaw = Number(searchParams.get('p'));
    const pilula = pRaw === 1 || pRaw === 2 ? pRaw : null;
    registrarEventoTrilha({ trilhaId, semana: semanaNum, pilula, formato: searchParams.get('formato'), tipo: 'abertura' }).catch(() => {});
  }, [data?.trilha?.id, semanaNum]);

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
      const r = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
      if (!r.error) {
        setData(r);
        const semana = (r.trilha?.temporada_plano || []).find(s => s.semana === semanaNum);
        // Deep-link da pílula (?formato=video|audio|texto|case) abre a semana já
        // no formato preferido do colab; senão, cai no formato_core da semana.
        const fmtParam = searchParams.get('formato');
        setFormatoAtivo(fmtParam || semana?.conteudo?.formato_core || null);
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
  if (semanaNum === 14) { router.replace('/dashboard/temporada/sem14'); return <Center><Loader2 className="animate-spin text-brand-400" /></Center>; }
  if (loading) return <Center><Loader2 className="animate-spin text-brand-400" /></Center>;
  if (!data?.trilha) return <Center><p className="text-gray-400">{t('errors.seasonNotFound')}</p></Center>;

  const semana = (data.trilha.temporada_plano || []).find(s => s.semana === semanaNum);
  if (!semana) return <Center><p className="text-gray-400">{t('errors.invalidWeek')}</p></Center>;

  const isAplicacao = semana.tipo === 'aplicacao';
  const isAvaliacao = semana.tipo === 'avaliacao';
  // DUO: a semana cobre 2 descritores (seg+ter). Rótulo único p/ título e Tira-Dúvidas.
  const descritoresLabel = (Array.isArray(semana.descritores_cobertos) && semana.descritores_cobertos.length > 1)
    ? semana.descritores_cobertos.join(' + ')
    : (semana.descritor || semana.competencia || data.trilha.competencia_foco);
  const conteudo = semana.conteudo;
  const entregasConteudo = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length > 0
    ? semana.conteudos_dia.filter(e => e?.conteudo)
    : (conteudo ? [{ dia: 'semana', label: t('type.episode'), competencia: semana.competencia, descritor: semana.descritor, conteudo }] : []);
  const cenario = semana.cenario;
  const progressoSemana = (data.progresso || []).find(p => p.semana === semanaNum);
  const conteudoConsumido = progressoSemana?.conteudo_consumido;

  async function handleConsumido() {
    await marcarConteudoConsumido(data.trilha.id, semanaNum);
    const r = await loadTemporadaPorEmail((await sb.auth.getUser()).data.user.email, { semanaTranscrito: semanaNum });
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
      const fresh = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
      setData(fresh);
    }
  }

  async function setMissaoModo(modo) {
    if (missaoBusy) return;
    if (modo === 'pratica' && !compromissoInput.trim()) return;
    setMissaoBusy(true);
    const r = await fetchAuth('/api/temporada/missao', {
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
      const fresh = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semanaNum });
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
    const r = await fetchAuth('/api/temporada/tira-duvidas', {
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
      <BackButton href="/dashboard/temporada" />

      {/* Header */}
      <div className="mb-6">
        <div className="text-xs uppercase text-brand-400 mb-1">
          {t('header.weekOf', { week: semanaNum, total: 14 })} · {isAplicacao ? t('type.practice') : isAvaliacao ? t('type.assessment') : t('type.episode')}
        </div>
        <h1 className="text-2xl font-bold text-white">{descritoresLabel}</h1>
      </div>

      {/* Vínculo com o PDI (Blueprint) — só quando a trilha é dirigida pelo blueprint. */}
      {semana.acao_pdi && (
        <div className="mb-6 rounded-xl border border-brand-400/30 bg-brand-400/5 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brand-400 font-bold mb-1">
            <Target size={12} /> {t('pdi.badge')}
          </div>
          {semana.objetivo_da_semana && (
            <p className="text-sm text-gray-200 mb-1.5">{semana.objetivo_da_semana}</p>
          )}
          <p className="text-xs text-gray-400">
            <span className="text-gray-500">{t('pdi.sustains')}: </span>{semana.acao_pdi}
          </p>
        </div>
      )}

      {/* Conteúdo da semana */}
      {!isAplicacao && !isAvaliacao && entregasConteudo.length > 0 && (
        <>
          <GlassCard className="mb-4 space-y-5">
            {entregasConteudo.map((entrega, idx) => (
              <div key={`${entrega.dia}-${entrega.competencia || idx}`} className={idx > 0 ? 'border-t border-white/10 pt-5' : ''}>
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-widest text-brand-400 font-bold">{entrega.label}</p>
                  <h2 className="text-sm font-bold text-white">{entrega.competencia || semana.competencia}</h2>
                  {entrega.descritor && <p className="text-xs text-gray-400">{entrega.descritor}</p>}
                </div>
                <ConteudoViewer
                  conteudo={entrega.conteudo}
                  competencia={entrega.competencia || semana.competencia}
                  descritor={entrega.descritor}
                  pilula={idx + 1}
                  formatoAtivo={typeof formatoAtivo === 'object' && formatoAtivo !== null ? formatoAtivo[idx] : (idx === 0 ? formatoAtivo : null)}
                  setFormatoAtivo={(formato) => setFormatoAtivo(prev => ({ ...(typeof prev === 'object' && prev !== null ? prev : {}), [idx]: formato }))}
                  trilhaId={data.trilha.id}
                  semana={semanaNum}
                  onAbrirConteudo={() => setAbriuConteudo(true)}
                  onAutoConsumido={() => !conteudoConsumido && handleConsumido()}
                  t={t}
                />
              </div>
            ))}
            {!conteudoConsumido && (
              <div className="mt-4">
                <button onClick={handleConsumido} disabled={!abriuConteudo}
                  title={!abriuConteudo ? t('content.openBeforeComplete') : ''}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${abriuConteudo ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-white/10 text-gray-500 cursor-not-allowed'}`}>
                  <Check size={14} /> {t('content.markDone')}
                </button>
                {!abriuConteudo && (
                  <p className="mt-2 text-xs text-amber-300/80">{t('content.openBeforeComplete')}</p>
                )}
              </div>
            )}
            {conteudoConsumido && (
              <div className="mt-4 flex items-center gap-2 text-emerald-400 text-xs">
                <Check size={14} /> {t('content.done')}
              </div>
            )}
          </GlassCard>

          <GlassCard className="mb-4 border-brand-500/30 bg-brand-500/5">
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-brand-400" />
              <span className="text-xs uppercase text-brand-400 font-bold">{t('challenge.title')}</span>
            </div>
            <div className="space-y-4">
              {entregasConteudo.map((entrega, idx) => (
                <div key={`${entrega.dia}-challenge-${idx}`} className={idx > 0 ? 'border-t border-brand-500/20 pt-4' : ''}>
                  <p className="text-[10px] uppercase tracking-widest text-brand-400/70 font-semibold mb-1">{entrega.label}</p>
                  <p className="text-sm text-gray-200">{entrega.conteudo?.desafio_texto}</p>
                  {entrega.conteudo?.acao_observavel && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <span className="text-[10px] uppercase text-brand-400/70 font-semibold">{t('challenge.observe')}</span>
                        <p className="text-xs text-gray-300">{entrega.conteudo.acao_observavel}</p>
                      </div>
                      {entrega.conteudo.criterio_de_execucao && (
                        <div>
                          <span className="text-[10px] uppercase text-brand-400/70 font-semibold">{t('challenge.execution')}</span>
                          <p className="text-xs text-gray-300">{entrega.conteudo.criterio_de_execucao}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                <span className="text-xs uppercase text-amber-400 font-bold">{t('mission.title')}</span>
              </div>
              <div className="prose prose-invert prose-sm max-w-none mb-4">
                <ReactMarkdown>{missaoTexto}</ReactMarkdown>
              </div>
              <label className="block text-xs text-gray-400 mb-2">
                {t('mission.commitmentPrompt')}
              </label>
              <textarea value={compromissoInput}
                onChange={e => setCompromissoInput(e.target.value)}
                rows={2} placeholder={t('mission.commitmentPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-500 mb-3" />
              <button onClick={() => setMissaoModo('pratica')}
                disabled={missaoBusy || !compromissoInput.trim()}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm font-bold">
                {t('mission.accept')}
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
                <span className="text-xs uppercase text-amber-400 font-bold">{t('mission.title')}</span>
              </div>
              {missaoTexto && (
                <div className="prose prose-invert prose-sm max-w-none mb-3">
                  <ReactMarkdown>{missaoTexto}</ReactMarkdown>
                </div>
              )}
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 mb-3">
                <p className="text-[10px] uppercase text-amber-400 font-bold tracking-wider mb-1">{t('mission.yourCommitment')}</p>
                <p className="text-sm text-gray-200">{compromissoSalvo}</p>
              </div>
              {!chatStarted && (
                <>
                  <p className="text-xs text-gray-400 mb-3">
                    {t('mission.didYouExecute')}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={startChat}
                      className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-bold min-w-[80px]">
                      {t('common.yes')}
                    </button>
                    <button onClick={() => setMissaoModo('cenario')}
                      disabled={missaoBusy}
                      className="px-5 py-2 rounded-lg border border-white/15 hover:border-white/30 disabled:opacity-50 text-sm text-gray-300 min-w-[80px]">
                      {t('common.no')}
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
              <span className="text-xs uppercase text-amber-400 font-bold">{t('context')}</span>
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
            <span className="text-xs uppercase text-purple-400 font-bold">{t('qualitative.title')}</span>
          </div>
          <p className="text-sm text-gray-300">
            {t('qualitative.description')}
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
              <span className="text-xs uppercase text-amber-400 font-bold">{t('finalScenario.title')}</span>
            </div>
            {cenarioTexto ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{stripCenarioTitulo(cenarioTexto)}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-gray-300">
                {t.rich('finalScenario.description', { action: (chunks) => <span className="text-purple-400">{chunks}</span> })}
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
            <HelpCircle size={16} className="text-brand-400" />
            <span className="text-xs uppercase text-brand-400 font-bold">{t('qa.title')}</span>
            <span className="text-[10px] text-gray-500">· {t('qa.scope', { descriptor: descritoresLabel })}</span>
          </div>

          {!tdOpen ? (
            <button onClick={() => setTdOpen(true)}
              disabled={!conteudoConsumido}
              title={!conteudoConsumido ? t('qa.markContentFirst') : ''}
              className="w-full px-4 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold">
              {conteudoConsumido ? t('qa.ask') : t('qa.unlockAfterContent')}
            </button>
          ) : (
            <>
              <div className="space-y-3 max-h-80 overflow-y-auto mb-3">
                {tdHistory.length === 0 && (
                  <p className="text-xs text-gray-500 italic text-center py-4">
                    {t.rich('qa.empty', { descriptor: descritoresLabel, strong: (chunks) => <span className="text-brand-400">{chunks}</span> })}
                  </p>
                )}
                {tdHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {tdBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> {t('thinking')}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <textarea value={tdInput}
                    onChange={e => setTdInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTiraDuvida(); } }}
                    placeholder={t('qa.placeholder')}
                    rows={2}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none"
                    disabled={tdBusy} />
                  <button onClick={sendTiraDuvida} disabled={tdBusy || !tdInput.trim()}
                    className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
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
              {semanaNum === 13 ? t('evidence.closingConversation')
               : semanaNum === 14 ? t('evidence.finalScenario')
               : isAplicacao
                 ? (progressoSemana?.feedback?.modo === 'pratica' ? t('evidence.missionReport') : t('evidence.feedback'))
                 : t('evidence.title')}
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
                  {t.rich('evidence.clickYes', { action: (chunks) => <span className="text-emerald-400">{chunks}</span> })}
                </p>
              );
            }
            return (
              <button
                onClick={startChat}
                disabled={(!conteudoConsumido && !isAplicacao && !isAvaliacao) || aplicacaoSemModo}
                title={aplicacaoSemModo ? t('evidence.chooseMissionFirst') : ''}
                className="w-full px-4 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
              >
                {semanaNum === 13 ? t('evidence.startClosing')
                 : semanaNum === 14 ? t('evidence.viewFinalScenario')
                 : isAplicacao ? t('evidence.sendAnswer')
                 : t('evidence.start')}
              </button>
            );
          })() : (
            <>
              <div className="space-y-3 max-h-96 overflow-y-auto mb-3">
                {chatHistory.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                      m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
                    }`}>
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2 text-sm text-gray-400">
                      <Loader2 size={14} className="animate-spin inline" /> {t('thinking')}
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
                              ? t('evidence.placeholderPractice')
                              : t('evidence.placeholderScenario'))
                          : t('evidence.placeholderDefault')
                      }
                      rows={2}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-none"
                      disabled={chatBusy}
                    />
                    <button onClick={sendMessage} disabled={chatBusy || !chatInput.trim()} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                      <Send size={16} />
                    </button>
                  </div>
                  <MicInput ref={chatMicRef} value={chatInput} onChange={setChatInput} disabled={chatBusy} />
                </div>
              ) : (
                <div className="text-center text-emerald-400 text-xs py-2">
                  {semanaNum >= 14
                    ? t('evidence.doneSeason')
                    : t('evidence.doneNextWeek', { date: formatarLiberacao(data.trilha.data_inicio, semanaNum + 1) })}
                </div>
              )}
            </>
          )}
        </GlassCard>
      )}
    </PageContainer>
  );
}

function ConteudoViewer({ conteudo, competencia, descritor, pilula, formatoAtivo, setFormatoAtivo, onAutoConsumido, onAbrirConteudo, trilhaId, semana, t }) {
  // Vídeo da CÉLULA (cargo × DISC × PPP), resolvido pela competência da semana.
  // Aparece como um formato a mais (chip clicável); o player abre inline igual
  // aos outros. Não dispara geração (gerar=false) — só reusa pronto/em-preparo.
  const [vid, setVid] = useState<any>(null);
  const videoIframeRef = useRef(null);
  useEffect(() => {
    if (!competencia) return;
    let alive = true;
    resolverVideoDaSemana(competencia, descritor || null, false)
      .then((r) => { if (alive) setVid(r); })
      .catch(() => { if (alive) setVid({ available: false }); });
    return () => { alive = false; };
  }, [competencia, descritor]);
  const videoPronto = !!(vid?.available && vid?.status === 'done' && vid?.bunny_video_id && vid?.bunny_library);
  const videoPreparando = !!(vid?.available && ['processing', 'render_queued', 'rendering'].includes(vid?.status));
  const temVideo = videoPronto || videoPreparando;

  // Formatos: conteúdo do kit (case/texto/audio) + vídeo da célula (quando há).
  const formatos = [...Object.keys(conteudo.formatos_disponiveis || {}).filter((f) => f !== 'video'), ...(temVideo ? ['video'] : [])];
  let ativo = formatoAtivo || conteudo.formato_core;
  if (ativo === 'video' && !temVideo) ativo = formatos[0]; // core era vídeo mas não há → 1º disponível
  const item = conteudo.formatos_disponiveis?.[ativo] || (ativo === conteudo.formato_core ? { url: conteudo.core_url, titulo: conteudo.core_titulo } : null);

  // audio (TTS) e texto/case (PDF) são servidos por ID via rota (gerados sob
  // demanda) — não precisam de URL pré-renderizada. Vídeo usa o embed da célula.
  const fonteId = (item as any)?.id || conteudo.core_id;
  const temFonte = ativo === 'video' ? temVideo : !!(item?.url || fonteId);

  useBunnyTracking(videoIframeRef, videoPronto ? vid?.colaboradorId : null, videoPronto ? vid?.bunny_video_id : null);

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

  // Embed do vídeo da célula (Bunny) + metaData p/ atribuição de view.
  const embedUrl = (() => {
    if (!videoPronto) return null;
    const base = `https://iframe.mediadelivery.net/embed/${vid.bunny_library}/${vid.bunny_video_id}?autoplay=false&responsive=true`;
    try { const u = new URL(base); u.searchParams.set('metaData', `trilha-${trilhaId}_semana-${semana}`); return u.toString(); } catch { return base; }
  })();

  // Resolve a fonte de um formato qualquer (não só o ativo) — p/ chips clicáveis.
  const fonteDoFormato = (f: string) => {
    if (f === 'video') return { info: null, fid: null, tem: temVideo };
    const info = conteudo.formatos_disponiveis?.[f] || (f === conteudo.formato_core ? { id: conteudo.core_id, url: conteudo.core_url } : null);
    const fid = info?.id || (f === conteudo.formato_core ? conteudo.core_id : null);
    const tem = !!(info?.url || fid);
    return { info, fid, tem };
  };

  // Telemetria: loga qual formato o colab abriu (atribuído à pílula deste descritor).
  const logFormato = (f) => {
    registrarEventoTrilha({ trilhaId, semana, pilula, formato: f, tipo: 'formato' }).catch(() => {});
  };

  return (
    <div>
      {/* Formatos como LINKS/ações diretas: texto/case abrem o PDF em nova aba;
          áudio/vídeo selecionam e tocam inline abaixo. Sem passo "Abrir conteúdo". */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] uppercase text-gray-500">{t('content.availableIn')}</span>
        {formatos.map(f => {
          const Icon = FORMAT_ICON[f] || FileText;
          const { info, fid, tem } = fonteDoFormato(f);
          const base = 'flex items-center gap-1 px-2.5 py-1 rounded text-[11px] transition-colors';
          const cls = `${base} ${f === ativo ? 'bg-brand-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'} ${!tem ? 'opacity-40 cursor-not-allowed' : ''}`;
          // texto/case → link direto pro PDF (nova aba)
          if (tem && (f === 'texto' || f === 'case')) {
            return (
              <a key={f} href={fid ? `/api/conteudo/${fid}/pdf` : info?.url}
                target="_blank" rel="noopener"
                onClick={() => { setFormatoAtivo(f); onAbrirConteudo?.(); logFormato(f); }}
                className={cls}>
                <Icon size={12} /> {f}
              </a>
            );
          }
          // áudio/vídeo → seleciona e toca inline abaixo
          return (
            <button key={f} onClick={() => { if (tem) { setFormatoAtivo(f); logFormato(f); } }} disabled={!tem} className={cls}>
              <Icon size={12} /> {f}
            </button>
          );
        })}
      </div>

      {/* Player inline para áudio/vídeo selecionados (texto/case abrem em nova aba) */}
      {!temFonte && (
        <div className="text-sm text-gray-400 italic p-4 rounded bg-white/5 border border-amber-500/20">
          {t('content.preparingFormats')}
        </div>
      )}
      {ativo === 'video' && videoPronto && (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe ref={videoIframeRef} src={embedUrl} className="w-full h-full" allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture" allowFullScreen />
          {vid?.isPersonalizado && <p className="text-[10px] text-emerald-400 font-semibold mt-1">· com seu nome</p>}
        </div>
      )}
      {ativo === 'video' && !videoPronto && videoPreparando && (
        <div className="text-sm text-gray-400 italic p-4 rounded bg-white/5 border border-violet-400/20">
          Estamos preparando seu vídeo personalizado — volte em alguns minutos.
        </div>
      )}
      {temFonte && ativo === 'audio' && (
        <audio
          controls
          className="w-full"
          src={fonteId ? `/api/conteudo/${fonteId}/podcast` : item.url}
          onEnded={() => registrarEventoTrilha({ trilhaId, semana, pilula, formato: 'audio', tipo: 'audio_fim' }).catch(() => {})}
        />
      )}
    </div>
  );
}

function Center({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#0a0e1a] text-white">{children}</div>;
}
