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
import { PROGRESSO } from '@/lib/status';
import { formatarAvanco } from '@/lib/season-engine/convergencia';
import { leituraDoStatusDaAcumulada } from '@/lib/season-engine/trilha-runtime';
import { nivelDaNotaOuNull } from '@/lib/nivel-da-nota-ou-nulo';
import { aplicarEnvio, cenariosDoSlot, posicaoNoFechamento } from '@/lib/season-engine/fechamento-por-competencia';

const MIN_CHARS = 20;
const MIN_CHARS_ARG = 3; // arguição é conversa — respostas curtas são válidas

/** As respostas já gravadas, uma por pergunta (as que faltam vazias). A contagem é a das perguntas do cenário, nunca um 4 escrito à mão. */
function respostasDoTranscript(perguntas, transcript) {
  const feitas = (transcript || []).filter(m => m.role === 'user').map(m => m.content);
  return (perguntas || []).map((_, i) => feitas[i] ?? '');
}

/** Remove o bloco [META] das falas da IA (só a mensagem visível fica). */
const stripMetaCli = (s) => String(s || '').replace(/\[META\][\s\S]*?\[\/META\]/g, '').trim();

/** Reconstrói o chat da arguição a partir do histórico persistido: descarta a
 *  semente (bloco ═══ CENÁRIO) e limpa o [META] das falas do Mentor. */
function argMsgsFromHistorico(hist) {
  return (hist || [])
    .filter(m => m?.content && !String(m.content).startsWith('═══ CENÁRIO'))
    .map(m => ({ role: m.role, content: stripMetaCli(m.content) }))
    .filter(m => m.content);
}

/** Intervalo do acompanhamento da pontuação. O `aiLimiter` da rota é 10/min. */
const POLL_FECHAMENTO_MS = 8000;
const POLL_FECHAMENTO_MAX = 60;
/**
 * Acompanhamento do RELATÓRIO depois da nota (R-137): ~4 min. Cobre a janela
 * em que o servidor ainda o considera "sendo gerado" (`RELATORIO_JANELA_MS`,
 * 90 s) e a retomada, que conclui a trilha em segundos.
 */
const POLL_RELATORIO_MAX = 30;

/**
 * Onde está a pontuação do fechamento, do ponto de vista de quem espera.
 * `pendente` = tudo respondido e nunca pedida; `lento` = o acompanhamento
 * esgotou sem resposta. A régua de verdade é `estadoDoFechamento`, no servidor.
 */
function PainelFechamento({ estado, onGerar, onVerResultado, t }) {
  if (estado === 'avaliado') {
    return (
      <button onClick={onVerResultado}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#091D35] font-bold text-sm">
        <CheckCircle2 size={16} /> {t('arguicao.seeResult')}
      </button>
    );
  }
  if (estado === 'processando') {
    return (
      <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.05] p-4 flex items-start gap-3">
        <Loader2 size={18} className="animate-spin text-brand-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-white">{t('fechamento.processingTitle')}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{t('fechamento.processingBody')}</p>
        </div>
      </div>
    );
  }
  const corpo = estado === 'lento' ? t('fechamento.slowBody')
    : estado === 'erro' ? t('fechamento.errorBody')
    : t('fechamento.pendingBody');
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{t('fechamento.pendingTitle')}</p>
      <p className="text-xs text-gray-400 mt-1 mb-3 leading-relaxed">{corpo}</p>
      <button onClick={onGerar}
        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#091D35] font-bold text-sm">
        {estado === 'pronto' ? t('fechamento.generate') : t('fechamento.retry')}
      </button>
    </div>
  );
}

/**
 * Avaliação Final da Temporada (semana do cenário B: regular=14, jornada=7, onboarding=12).
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
  const [respostas, setRespostas] = useState([]);
  const [step, setStep] = useState(-1); // -1 = loading, 0 = cenário, 1..N = pergunta (N <= 4), 6 = finalizada, 7 = arguição (chat), 8 = pontuação (gerando / retomar)
  const totalPerguntas = perguntas.length;
  // Onboarding (5 cenários, um por competência): a lista do slot e o cenário em andamento. Nesse
  // modo `cenario`, `perguntas`, `respostas` e `respostasSalvas` são os do cenário em andamento;
  // nulo = o formato de sempre (um cenário).
  const [cenarios, setCenarios] = useState(null);
  const [idxCenario, setIdxCenario] = useState(0);
  const [cenarioRecemConcluido, setCenarioRecemConcluido] = useState(false);
  const multi = Array.isArray(cenarios) && cenarios.length > 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [avaliacao, setAvaliacao] = useState(null);
  const [semCenarioB, setSemCenarioB] = useState(14); // derivado do plano
  // O slot do fechamento herda o calendário de outra semana (a degustação: o
  // slot 3 libera junto da 2). Rotulá-lo "Semana 3" nomeia uma semana que o
  // programa de 2 não tem (R-30).
  const [cenarioBEspelhado, setCenarioBEspelhado] = useState(false);
  const [preparando, setPreparando] = useState(false); // piloto: acumulada em Trigger.dev
  // A acumulada falhou (ou o acompanhamento esgotou): a tela diz e oferece "Tentar de novo" (R-102).
  const [preparandoFalhou, setPreparandoFalhou] = useState(false);
  // Pontuação do fechamento (roda no servidor, fora do request): processando | pronto | erro | lento | avaliado
  const [fechamento, setFechamento] = useState(null);
  // Quantas respostas ao cenário já estão gravadas: reenviar essas empurraria falas duplicadas.
  const [respostasSalvas, setRespostasSalvas] = useState(0);
  // Relatório de evolução depois da nota (R-137): verificando | gerando | pronto | indisponivel.
  // "Ver relatório" só abre com ele pronto: antes, abria "Temporada ainda não concluída".
  const [relatorio, setRelatorio] = useState(null);
  const [tentativaRelatorio, setTentativaRelatorio] = useState(0);

  // Arguição (defesa oral): modo CHAT turn-by-turn, depois da última pergunta.
  const [argMsgs, setArgMsgs] = useState([]); // { role: 'assistant'|'user', content }
  const [argInput, setArgInput] = useState('');
  const [argTurno, setArgTurno] = useState(0);
  const [argBusy, setArgBusy] = useState(false);
  const [argConcluida, setArgConcluida] = useState(false);
  const argEndRef = useRef(null);
  const pollRef = useRef(true);
  useEffect(() => () => { pollRef.current = false; }, []); // cancela polling no unmount

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      let r = await loadTemporadaPorEmail(user.email, { semanaTranscrito: 14 });
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
      const slotCB = plano.find(s => s?.semana === semCB);
      setCenarioBEspelhado(slotCB?.calendario_semana != null && slotCB.calendario_semana !== slotCB.semana);

      // Cenário B fora da sem 14 (piloto=3, jornada=7, onboarding=12): rebusca com o
      // transcript da semana certa — senão feedback vem vazio e o wizard
      // perde cenário/respostas parciais já persistidos.
      if (semCB !== 14) {
        const r2 = await loadTemporadaPorEmail(user.email, { semanaTranscrito: semCB });
        if (!r2.error && r2.trilha) r = r2;
      }

      const prog = (r.progresso || []).find(p => p.semana === semCB);
      const fb = prog?.feedback || {};

      // Já concluída — mostra avaliação
      if (prog?.status === PROGRESSO.CONCLUIDO) {
        setAvaliacao({
          nota_media_pre: fb.nota_media_pre,
          nota_media_pos: fb.nota_media_pos,
          delta_medio: fb.delta_medio,
          resumo_avaliacao: fb.resumo_avaliacao,
          spec_version: fb.spec_version,
        });
        setStep(6);
        return;
      }

      // ONBOARDING: o slot guarda os 5 cenários. Retomar volta ao cenário e à pergunta em que a
      // pessoa parou; com tudo respondido, vale o mesmo que no cenário único (arguição ou pontuação).
      const lista = cenariosDoSlot(fb);
      if (lista) {
        setCenarios(lista);
        const pos = posicaoNoFechamento(lista);
        if (pos.cenarioAtual === null) {
          abrirCenario(lista, lista.length - 1);
          if (fb.arguicao && !fb.arguicao.concluida) {
            setArgMsgs(argMsgsFromHistorico(fb.arguicao.historico));
            setArgTurno(fb.arguicao.turno || 1);
            setStep(7);
            return;
          }
          setStep(8);
          const estado = await acompanharFechamento(r.trilha.id, semCB);
          if (estado === 'avaliado') setStep(6);
          return;
        }
        abrirCenario(lista, pos.cenarioAtual);
        return;
      }

      // Tudo respondido (e a arguição, se houve, concluída) sem nota: a
      // pontuação está rodando, falhou ou nunca foi pedida. 🔴 Antes este caso
      // caía no formulário das 4 respostas (o ramo `fb.cenario && fb.perguntas`
      // abaixo), e reenviar dali duplicava falas e pagava o scorer de novo.
      const respostasFeitas = (fb.transcript_completo || []).filter(m => m.role === 'user').length;
      const nPerguntas = Array.isArray(fb.perguntas) ? fb.perguntas.length : 0;
      if (fb.cenario && nPerguntas > 0 && respostasFeitas >= nPerguntas && !(fb.arguicao && !fb.arguicao.concluida)) {
        setCenario(fb.cenario);
        setPerguntas(fb.perguntas);
        setStep(8);
        const estado = await acompanharFechamento(r.trilha.id, semCB);
        if (estado === 'avaliado') setStep(6);
        return;
      }

      // Arguição em andamento (colab reabriu no meio da defesa oral): entra
      // direto no chat, reconstruindo do histórico persistido (feedback.arguicao).
      if (fb.arguicao && !fb.arguicao.concluida && prog?.status !== PROGRESSO.CONCLUIDO) {
        setCenario(fb.cenario || '');
        setPerguntas(fb.perguntas || []);
        setRespostas(respostasDoTranscript(fb.perguntas, fb.transcript_completo));
        setArgMsgs(argMsgsFromHistorico(fb.arguicao.historico));
        setArgTurno(fb.arguicao.turno || 1);
        setStep(7);
        return;
      }

      // Carrega cenário + perguntas (faz init se não tem)
      if (fb.cenario && fb.perguntas) {
        setCenario(fb.cenario);
        setPerguntas(fb.perguntas);
        // recupera respostas parciais se existirem no transcript
        setRespostas(respostasDoTranscript(fb.perguntas, fb.transcript_completo));
        setRespostasSalvas(Math.min(respostasFeitas, fb.perguntas.length));
        setStep(0);
      } else {
        await doInit(r.trilha.id, semCB);
      }
    })();
  }, [router, sb]);

  // Abre o fechamento. No piloto, se a avaliação acumulada (Trigger.dev) ainda
  // não terminou, a rota responde { processando:true } (202) → mostramos
  // "preparando avaliação…" e fazemos polling até liberar. Mata a race B2.
  async function doInit(tid, semCB) {
    const initResp = await fetchAuth('/api/temporada/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId: tid, semana: semCB, action: 'init' }),
    });
    if (!initResp.ok && initResp.status !== 202) {
      const err = await initResp.json().catch(() => ({}));
      setError(err.error || t('errors.startWeek', { week: semCB }));
      return;
    }
    const data = await initResp.json().catch(() => ({}));
    if (data.processando) {
      setPreparando(true);
      setPreparandoFalhou(false);
      setStep(-1);
      pollAcumulada(tid, semCB);
      return;
    }
    setPreparando(false);
    setPreparandoFalhou(false);
    // Onboarding: a rota devolve os 5 cenários, e a pessoa começa no primeiro sem resposta.
    const lista = cenariosDoSlot(data);
    if (lista) {
      setCenarios(lista);
      abrirCenario(lista, posicaoNoFechamento(lista).cenarioAtual ?? 0);
      return;
    }
    setCenario(data.cenario || '');
    setPerguntas(data.perguntas || []);
    setRespostas((data.perguntas || []).map(() => ''));
    setStep(0);
  }

  /**
   * Onboarding: abre o cenário `idx` da lista. Volta à pergunta em que a pessoa parou (o
   * cenário de contexto, se ainda não respondeu nada) e deixa as já enviadas só para leitura.
   */
  function abrirCenario(lista, idx) {
    const c = lista[idx];
    const feitas = (c.transcript_completo || []).filter(m => m.role === 'user').length;
    const salvas = Math.min(feitas, c.perguntas.length);
    setIdxCenario(idx);
    setCenario(c.cenario);
    setPerguntas(c.perguntas);
    setRespostas(respostasDoTranscript(c.perguntas, c.transcript_completo));
    setRespostasSalvas(salvas);
    setStep(salvas > 0 ? Math.min(salvas + 1, c.perguntas.length) : 0);
  }

  // Polling do status da acumulada (o gate self-heal já re-dispara se travar).
  async function pollAcumulada(tid, semCB) {
    for (let i = 0; i < 120 && pollRef.current; i++) {
      await new Promise((res) => setTimeout(res, 3000));
      if (!pollRef.current) return;
      const resp = await fetchAuth('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId: tid, semana: semCB, action: 'status' }),
      });
      if (!resp.ok) continue;
      const s = await resp.json().catch(() => ({}));
      const leitura = leituraDoStatusDaAcumulada(s.acumulada_status);
      if (leitura === 'pronto') { await doInit(tid, semCB); return; }
      if (leitura === 'falhou') { setPreparandoFalhou(true); return; }
    }
    // Esgotou sem `done` nem `error`: não fica girando para sempre.
    if (pollRef.current) setPreparandoFalhou(true);
  }

  /**
   * Acompanha a pontuação do fechamento até ela concluir ou parar. Devolve o
   * estado final. `fechamento_status` é só leitura: nunca dispara pontuação.
   */
  async function acompanharFechamento(tid, semCB) {
    for (let i = 0; i < POLL_FECHAMENTO_MAX && pollRef.current; i++) {
      if (i > 0) await new Promise((res) => setTimeout(res, POLL_FECHAMENTO_MS));
      if (!pollRef.current) return null;
      const resp = await fetchAuth('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId: tid, semana: semCB, action: 'fechamento_status' }),
      }).catch(() => null);
      if (!resp?.ok) continue; // 429 do limitador ou rede: tenta na próxima volta
      const s = await resp.json().catch(() => ({}));
      if (s.estado === 'avaliado') {
        setAvaliacao(s.avaliacao);
        setFechamento('avaliado');
        return 'avaliado';
      }
      if (s.estado === 'processando') { setFechamento('processando'); continue; }
      if (s.estado === 'erro') { setFechamento('erro'); return 'erro'; }
      if (s.estado === 'pronto-para-pontuar') { setFechamento('pronto'); return 'pronto'; }
      // Qualquer outro estado (ex.: respondendo) não é deste painel: volta ao cenário.
      setStep(0);
      return s.estado || null;
    }
    if (pollRef.current) setFechamento('lento');
    return 'lento';
  }

  /**
   * Acompanha o RELATÓRIO depois da nota (R-137). A nota é gravada antes dele, e
   * se ele falha a trilha fica aberta: "Ver relatório" abria "Temporada ainda
   * não concluída", sem retomada nenhuma. Aqui, `falhou` (o servidor diz que
   * a janela do fechamento passou) dispara a retomada UMA vez por tentativa, e o
   * botão só abre com o relatório `pronto`. Resposta sem o campo (servidor de
   * antes desta mudança) é lida como pronto: é o comportamento anterior.
   */
  async function acompanharRelatorio(tid, semCB) {
    setRelatorio('verificando');
    let pediuRetomada = false;
    for (let i = 0; i < POLL_RELATORIO_MAX && pollRef.current; i++) {
      if (i > 0) await new Promise((res) => setTimeout(res, POLL_FECHAMENTO_MS));
      if (!pollRef.current) return;
      const resp = await fetchAuth('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId: tid, semana: semCB, action: 'fechamento_status' }),
      }).catch(() => null);
      if (!resp?.ok) continue; // 429 do limitador ou rede: tenta na próxima volta
      const s = await resp.json().catch(() => ({}));
      if (s.relatorio === undefined || s.relatorio === 'pronto') { setRelatorio('pronto'); return; }
      setRelatorio('gerando');
      if (s.relatorio === 'falhou' && !pediuRetomada) {
        pediuRetomada = true;
        await fetchAuth('/api/temporada/evaluation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trilhaId: tid, semana: semCB, action: 'generate_report' }),
        }).catch(() => null);
      }
    }
    if (pollRef.current) setRelatorio('indisponivel');
  }

  // Ao chegar no resultado (carregado já concluído ou recém-pontuado), confere o relatório.
  useEffect(() => {
    if (step === 6 && trilhaId) acompanharRelatorio(trilhaId, semCenarioB);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, trilhaId, tentativaRelatorio]);

  async function gerarAvaliacaoFinal() {
    setFechamento('processando');
    const resp = await fetchAuth('/api/temporada/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId, semana: semCenarioB, action: 'finalizar' }),
    }).catch(() => null);
    const data = resp ? await resp.json().catch(() => ({})) : {};
    if (data.estado === 'avaliado') {
      setAvaliacao(data.avaliacao);
      setFechamento('avaliado');
      return;
    }
    if (data.estado === 'processando') {
      await acompanharFechamento(trilhaId, semCenarioB);
      return;
    }
    setFechamento('erro');
  }

  // Auto-scroll do chat da arguição ao chegar mensagem nova / IA "pensando".
  useEffect(() => {
    if (step === 7) argEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [argMsgs, argBusy, step]);

  function setResposta(i, val) {
    setRespostas(prev => prev.map((r, idx) => idx === i ? val : r));
  }

  /**
   * A última resposta foi gravada: a arguição abre (a pessoa passa para o modo chat) ou a
   * pontuação foi disparada no servidor (a tela acompanha até a nota sair).
   */
  async function aposUltimaResposta(data) {
    // Arguição ligada: a última resposta ABRE a defesa oral (não pontua ainda).
    // Troca do formulário para o modo CHAT turn-by-turn.
    if (data.arguindo) {
      setArgMsgs([{ role: 'assistant', content: stripMetaCli(data.message) }]);
      setArgTurno(data.turno || 1);
      setBusy(false);
      setStep(7);
      return;
    }
    // Arguição desligada: a pontuação foi disparada no servidor.
    setBusy(false);
    setStep(8);
    if (data.finalizando || data.fechamento === 'avaliado') {
      setFechamento('processando');
      const estado = await acompanharFechamento(trilhaId, semCenarioB);
      if (estado === 'avaliado') setStep(6);
    } else {
      setFechamento('erro');
    }
  }

  /**
   * Onboarding: envia a resposta da pergunta atual (cada uma é gravada na hora, então retomar
   * volta à pergunta em que a pessoa parou). Ao fechar o cenário, abre o próximo; ao fechar o
   * último, vale o caminho de sempre (arguição ou pontuação).
   */
  async function enviarRespostaAtual() {
    const i = step - 1;
    if (respostas[i].trim().length < MIN_CHARS) { alert(t('question.minAlert', { min: MIN_CHARS })); return; }
    micRef.current?.stop();
    // Já enviada (a pessoa voltou para reler): só navega, sem empurrar fala nova.
    if (i < respostasSalvas) { if (step < totalPerguntas) setStep(step + 1); return; }
    setBusy(true);
    const r = await fetchAuth('/api/temporada/evaluation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trilhaId, semana: semCenarioB, action: 'send', message: respostas[i] }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const err = r ? await r.json().catch(() => ({})) : {};
      alert(t('alerts.error', { error: err.error || t('alerts.sendFailure') }));
      setBusy(false);
      return;
    }
    const data = await r.json().catch(() => ({}));
    // A lista local acompanha o servidor: o cenário seguinte já vem com a 1ª pergunta aberta.
    const resposta = { role: 'user', content: respostas[i], timestamp: new Date().toISOString() };
    const apos = aplicarEnvio(cenarios, idxCenario, resposta, data);
    setCenarios(apos.lista);
    if (apos.tipo === 'ultima-resposta') {
      // Última resposta do último cenário.
      setRespostasSalvas(i + 1);
      await aposUltimaResposta(data);
      return;
    }
    setBusy(false);
    if (apos.tipo === 'proximo-cenario') {
      // Fechou o cenário: o próximo abre no card de contexto.
      setCenarioRecemConcluido(true);
      abrirCenario(apos.lista, apos.idx);
      return;
    }
    setRespostasSalvas(i + 1);
    setStep(step + 1);
  }

  async function finalizar() {
    if (respostas.some(r => r.trim().length < MIN_CHARS)) {
      alert(t('alerts.allQuestions', { min: MIN_CHARS, total: totalPerguntas }));
      return;
    }
    setBusy(true);
    // Envia as 4 respostas em sequência (pedagogicamente correto: o backend
    // espera 4 mensagens antes do scorer). Reusa o fluxo send existente.
    for (let i = respostasSalvas; i < respostas.length; i++) {
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
        if (!data.arguindo) setRespostasSalvas(respostas.length);
        await aposUltimaResposta(data);
        return;
      }
    }
    setBusy(false);
  }

  async function enviarArguicao() {
    const msg = argInput.trim();
    if (msg.length < MIN_CHARS_ARG) return;
    setArgMsgs(prev => [...prev, { role: 'user', content: msg }]);
    setArgInput('');
    micRef.current?.stop();
    setArgBusy(true);
    try {
      const r = await fetchAuth('/api/temporada/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trilhaId, semana: semCenarioB, action: 'arguir', message: msg }),
      });
      if (!r.ok) {
        const err = await r.json();
        alert(t('alerts.error', { error: err.error || t('alerts.sendFailure') }));
        setArgBusy(false);
        return;
      }
      const data = await r.json();
      if (data.message) setArgMsgs(prev => [...prev, { role: 'assistant', content: stripMetaCli(data.message) }]);
      // Encerrou a arguição → a pontuação (com a fusão da defesa) roda no
      // servidor. Mostra o fecho da IA e acompanha até a nota sair.
      if (data.arguicaoConcluida) {
        setArgConcluida(true);
        if (data.finalizando || data.fechamento === 'avaliado') {
          setFechamento('processando');
          acompanharFechamento(trilhaId, semCenarioB);
        } else {
          setFechamento('erro');
        }
      } else {
        setArgTurno(data.turno || argTurno + 1);
      }
    } catch (e) {
      alert(t('alerts.error', { error: e?.message || t('alerts.sendFailure') }));
    } finally {
      setArgBusy(false);
    }
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

  if (step < 0) return (
    <div className="flex items-center justify-center h-[60dvh]">
      <div className="text-center max-w-sm px-4">
        {preparandoFalhou ? (
          <>
            <AlertTriangle size={32} className="text-amber-400 mx-auto" />
            <p className="text-sm font-semibold text-white mt-4">{t('preparing.failedTitle')}</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t('preparing.failedBody')}</p>
            <button
              onClick={() => doInit(trilhaId, semCenarioB)}
              className="mt-4 w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#091D35] font-bold text-sm"
            >
              {t('preparing.retry')}
            </button>
          </>
        ) : (
          <Loader2 size={32} className="animate-spin text-brand-400 mx-auto" />
        )}
        {preparando && !preparandoFalhou && (
          <>
            <p className="text-sm font-semibold text-white mt-4">{t('preparing.title')}</p>
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{t('preparing.body')}</p>
          </>
        )}
      </div>
    </div>
  );

  // Quanto do fechamento já foi respondido. No Onboarding conta as perguntas de TODOS os
  // cenários (os anteriores inteiros mais as já enviadas do atual), e não só as do atual.
  const totalGlobal = multi ? cenarios.reduce((s, c) => s + c.perguntas.length, 0) : totalPerguntas;
  const respondidasAntes = multi ? cenarios.slice(0, idxCenario).reduce((s, c) => s + c.perguntas.length, 0) : 0;
  const progressoPct = step >= 6 ? 100
    : multi ? Math.round(((respondidasAntes + respostasSalvas) / Math.max(1, totalGlobal)) * 100)
      : step <= 0 ? 0 : Math.round(((step - 1) / Math.max(1, totalPerguntas)) * 100);
  const ultimoCenario = multi && idxCenario === cenarios.length - 1;
  // Onboarding: a resposta já enviada fica só para leitura (reenviar empurraria fala duplicada).
  const respostaTravada = multi && step >= 1 && step - 1 < respostasSalvas;

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
          <p className="text-xs font-bold text-brand-400">{progressoPct}%</p>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand-500 to-emerald-500 transition-all"
            style={{ width: `${progressoPct}%` }} />
        </div>
        <p className="text-[10px] text-gray-500 mt-2">
          {step === 7 ? t('arguicao.badge') : step === 6 ? t('progress.done') : step === 8 ? t('fechamento.eyebrow') : multi ? t('scenario.progressLine', { current: idxCenario + 1, total: cenarios.length, competency: cenarios[idxCenario]?.competencia || '' }) : cenarioBEspelhado ? t('progress.finalCompetency', { competency: competencia }) : t('progress.weekCompetency', { week: semCenarioB, competency: competencia })}
        </p>
      </div>

      {/* STEP 0 — Cenário */}
      {step === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {multi && (
            <div className="mb-4">
              <p className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
                {t('scenario.counter', { current: idxCenario + 1, total: cenarios.length })}
              </p>
              <p className="text-base font-bold text-white mt-1">{cenarios[idxCenario]?.competencia}</p>
              {cenarioRecemConcluido && (
                <p className="text-[11px] text-gray-400 mt-1">{t('scenario.previousDone', { done: idxCenario })}</p>
              )}
            </div>
          )}
          <p className="text-xs uppercase tracking-widest text-brand-400 font-bold mb-3">{t('context')}</p>
          <div className="prose prose-invert prose-sm max-w-none text-gray-200 mb-5">
            <ReactMarkdown>{cenario}</ReactMarkdown>
          </div>
          <button onClick={() => { setCenarioRecemConcluido(false); setStep(1); }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-[#091D35] font-bold text-sm">
            <Play size={14} fill="currentColor" /> {t('startAssessment')}
          </button>
        </div>
      )}

      {/* STEPS 1..N: Perguntas (N = as do cenário; no Onboarding, as do cenário em andamento) */}
      {step >= 1 && step <= totalPerguntas && perguntas[step - 1] && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          {multi && (
            <p className="text-[11px] text-gray-400 mb-3">
              {t('scenario.counter', { current: idxCenario + 1, total: cenarios.length })} · {cenarios[idxCenario]?.competencia}
            </p>
          )}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-widest text-brand-400 font-bold">
              {t('question.counter', { current: step, total: totalPerguntas })}
            </p>
            <div className="flex gap-1">
              {perguntas.map((_, k) => k + 1).map(i => (
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
              onChange={val => setResposta(step - 1, val)} disabled={busy || respostaTravada} />
          </div>

          <textarea value={respostas[step - 1]}
            onChange={e => setResposta(step - 1, e.target.value)}
            placeholder={t('question.placeholder')}
            rows={6}
            disabled={busy || respostaTravada}
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
            {multi ? (
              /* Onboarding: cada resposta é enviada na hora (retomar volta à pergunta em que parou). */
              <button onClick={enviarRespostaAtual} disabled={busy}
                className={`flex-1 py-3 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 ${
                  step < totalPerguntas ? 'bg-brand-500 hover:bg-brand-400 text-[#091D35]' : 'bg-emerald-500 hover:bg-emerald-400 text-[#091D35]'}`}>
                {busy ? <><Loader2 size={14} className="animate-spin" /> {t('question.processing')}</>
                  : step < totalPerguntas ? t('question.next')
                    : ultimoCenario ? t('question.finish') : t('scenario.finish')}
              </button>
            ) : step < totalPerguntas ? (
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

      {/* STEP 7: Arguição (defesa oral, chat turn-by-turn) */}
      {step === 7 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Mic size={16} className="text-brand-400" />
            <p className="text-xs uppercase tracking-widest text-brand-400 font-bold">{t('arguicao.title')}</p>
          </div>
          <p className="text-[11px] text-gray-500 mb-4">{t('arguicao.intro')}</p>

          {/* Fluxo da conversa */}
          <div className="space-y-3 mb-4 max-h-[46dvh] overflow-y-auto pr-1">
            {argMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-brand-500/15 border border-brand-500/25 text-white rounded-br-sm'
                    : 'bg-white/[0.04] border border-white/10 text-gray-200 rounded-bl-sm'
                }`}>
                  <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {argBusy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/10 px-3.5 py-2.5">
                  <Loader2 size={14} className="animate-spin text-brand-400" />
                </div>
              </div>
            )}
            <div ref={argEndRef} />
          </div>

          {argConcluida ? (
            <PainelFechamento estado={fechamento} t={t}
              onVerResultado={() => setStep(6)} onGerar={gerarAvaliacaoFinal} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-[11px] text-gray-500 flex-1">{t('arguicao.turnHint', { turno: argTurno })}</p>
                <MicInput ref={micRef} value={argInput} onChange={setArgInput} disabled={argBusy} />
              </div>
              <textarea value={argInput}
                onChange={e => setArgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviarArguicao(); } }}
                placeholder={t('arguicao.placeholder')}
                rows={3}
                disabled={argBusy}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-brand-500 resize-vertical" />
              <button onClick={enviarArguicao} disabled={argBusy || argInput.trim().length < MIN_CHARS_ARG}
                className="mt-2 w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-[#091D35] font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {argBusy ? <><Loader2 size={14} className="animate-spin" /> {t('arguicao.sending')}</> : t('arguicao.send')}
              </button>
            </>
          )}
        </div>
      )}

      {/* STEP 8: pontuação gerando, ou retomada quando não saiu */}
      {step === 8 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-xs uppercase tracking-widest text-brand-400 font-bold mb-3">{t('fechamento.eyebrow')}</p>
          <PainelFechamento estado={fechamento} t={t}
            onVerResultado={() => setStep(6)} onGerar={gerarAvaliacaoFinal} />
        </div>
      )}

      {/* STEP 6: Concluída */}
      {step === 6 && avaliacao && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <p className="text-base font-bold text-white">{t('done.title')}</p>
          </div>
          {String(avaliacao.spec_version || '').startsWith('piloto') ? (
            /* Piloto: SEM pré/delta — a avaliação é demonstração do método,
               não medição de evolução (2 semanas não medem evolução). */
            <div className="mb-4">
              {/* Nível, não nota (R-109, 04/10/2026): a conclusão do piloto mostrava a
                  nota crua com o rótulo "Nota da demonstração". */}
              {nivelDaNotaOuNull(avaliacao.nota_media_pos) != null && (
                <div className="text-center rounded-lg bg-white/[0.05] p-3">
                  <p className="text-xl font-bold text-brand-400">{t('done.levelValue', { n: nivelDaNotaOuNull(avaliacao.nota_media_pos) })}</p>
                  <p className="text-[10px] text-gray-500 uppercase">{t('done.demoLevel')}</p>
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-2">{t('done.pilotNote')}</p>
            </div>
          ) : formatarAvanco(avaliacao.nota_media_pre, avaliacao.nota_media_pos) && (
          /* Só o avanço médio, com piso em zero: sem nota de partida, sem nota
             final e sem queda em vermelho (mesma régua do relatório e do PDF). */
          <div className="text-center rounded-lg bg-white/[0.05] p-3 mb-4">
            <p className="text-xl font-bold text-emerald-400">{formatarAvanco(avaliacao.nota_media_pre, avaliacao.nota_media_pos)}</p>
            <p className="text-[10px] text-gray-500 uppercase">{t('done.progress')}</p>
          </div>
          )}
          {avaliacao.resumo_avaliacao?.mensagem_geral && (
            <div className="rounded-lg bg-white/[0.03] p-3 text-sm text-gray-200 mb-4">
              {avaliacao.resumo_avaliacao.mensagem_geral}
            </div>
          )}
          {/* O relatório DESTA trilha (R-16): sem `?trilha`, a tela abria a mais
              recente, que depois do encadeamento é a jornada seguinte. */}
          {relatorio === 'indisponivel' ? (
            <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3">
              <p className="text-xs text-gray-400 leading-relaxed mb-3">{t('done.reportUnavailable')}</p>
              <button onClick={() => setTentativaRelatorio((n) => n + 1)}
                className="w-full py-3 rounded-xl border border-white/15 hover:border-white/30 text-sm font-bold text-white">
                {t('done.reportRetry')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(trilhaId)}&origem=temporada`)}
              disabled={relatorio !== 'pronto'}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 hover:opacity-90 text-sm font-bold text-white disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2">
              {relatorio === 'pronto'
                ? t('done.viewReport')
                : <><Loader2 size={14} className="animate-spin" /> {t('done.reportPreparing')}</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
