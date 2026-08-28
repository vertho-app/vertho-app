'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, AudioLines, Building2, Check, ChevronRight, CircleAlert, Clock3,
  Database, ExternalLink, FileText, Headphones, LoaderCircle, Mic, Radio,
  RefreshCw, Search, ShieldCheck, Sparkles, Square, Wifi, WifiOff,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import {
  DEFAULT_VERTHO_OFFER, DISCOVERY_CHECKLIST, PACE_PHASES,
  type CopilotOpportunity, type CopilotPlan, type LiveReading, type LiveUtterance,
  type PacePhase, type SupernormalPost, type SupernormalPostDetail,
} from '@/lib/copiloto/types';
import { LocalMeetingCapture, toUtterance, type CaptureState } from './audio-capture';
import { selectImmediateQuestions } from './local-bank';
import styles from './copiloto.module.css';

type Tab = 'planejamento' | 'ao-vivo' | 'pos-reuniao';

const PLAN_STORAGE_KEY = 'vertho-copiloto-plan-v1';
const ASR_URL = process.env.NEXT_PUBLIC_COPILOTO_ASR_URL || 'ws://127.0.0.1:8765';

const PHASE_LABELS: Record<PacePhase, string> = {
  preparar: 'Preparar', analisar: 'Analisar', cocriar: 'Cocriar', engajar: 'Engajar',
};

const EMPTY_READING: LiveReading = {
  phase: 'preparar', covered: [], pending: [...DISCOVERY_CHECKLIST], signal: 'neutro',
  objection: null, alert: null, focus: 'Deixe o cliente explicar o mundo dele.', questions: [],
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function formatDate(value: string): string {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

function PaceRunway({ tab, livePhase }: { tab: Tab; livePhase: PacePhase }) {
  const currentIndex = PACE_PHASES.indexOf(livePhase);
  return (
    <div className={styles.runway} aria-label="Jornada PACE">
      <div className={classNames(styles.runwayStep, tab === 'planejamento' && styles.runwayCurrent)} data-tone="plan">
        <span>00</span> Planejamento
      </div>
      <i>→</i>
      {PACE_PHASES.map((phase, index) => (
        <div key={phase} className={classNames(
          styles.runwayStep,
          tab === 'ao-vivo' && index === currentIndex && styles.runwayCurrent,
          tab === 'ao-vivo' && index < currentIndex && styles.runwayDone,
        )}>
          <span>0{index + 1}</span> {PHASE_LABELS[phase]}
        </div>
      ))}
    </div>
  );
}

function PlanDossier({ plan, onGoLive }: { plan: CopilotPlan; onGoLive: () => void }) {
  const phaseGroups = useMemo(() => PACE_PHASES.map((phase) => ({
    phase, questions: plan.questions.filter((question) => question.phase === phase),
  })), [plan.questions]);

  return (
    <section className={styles.dossier} aria-label="Planejamento pronto">
      <header className={styles.dossierHeader}>
        <div>
          <p className={styles.eyebrow}>Dossiê pronto</p>
          <h2>{plan.companyIdentified}</h2>
          <p>{plan.companySummary || plan.valueSummary}</p>
        </div>
        <div className={styles.dossierStats}>
          <span><FileText size={14} /> {plan.questions.length} perguntas</span>
          <span><Database size={14} /> {plan.sources.length} fontes</span>
        </div>
      </header>

      <div className={styles.objectives}>
        <article><span>Objetivo principal</span><p>{plan.objectives.primary}</p></article>
        <article><span>Objetivo reserva</span><p>{plan.objectives.fallback}</p></article>
      </div>

      {plan.valueSummary && <p className={styles.valueSummary}><Sparkles size={16} /> {plan.valueSummary}</p>}

      <div className={styles.dossierGrid}>
        <section className={classNames(styles.dossierBlock, styles.wideBlock)}>
          <div className={styles.blockTitle}>
            <div><span>01</span><h3>Sinais encontrados</h3></div>
            <small>Fato público ≠ hipótese</small>
          </div>
          {plan.facts.length ? (
            <div className={styles.evidenceRail}>
              {plan.facts.map((fact, index) => (
                <article key={`${fact.title}-${index}`} className={styles.evidence}>
                  <b>F{index + 1}</b>
                  <div>
                    <div className={styles.evidenceTop}><h4>{fact.title}</h4>{fact.publishedAt && <time>{fact.publishedAt}</time>}</div>
                    <p>{fact.fact}</p>
                    <em>Para a conversa: {fact.relevance}</em>
                    {fact.sourceUrl && <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Ver evidência <ExternalLink size={12} /></a>}
                  </div>
                </article>
              ))}
            </div>
          ) : <p className={styles.emptyCopy}>Este plano foi montado somente com o briefing privado, sem pesquisa pública.</p>}
        </section>

        <section className={styles.dossierBlock}>
          <div className={styles.blockTitle}><div><span>02</span><h3>Hipóteses a testar</h3></div></div>
          <ol className={styles.hypothesisList}>
            {plan.hypotheses.map((item, index) => (
              <li key={`${item.hypothesis}-${index}`}>
                <strong>{item.hypothesis}</strong>
                {item.basis && <p>{item.basis}</p>}
                {item.howToTest && <em>Teste: {item.howToTest}</em>}
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.dossierBlock}>
          <div className={styles.blockTitle}><div><span>03</span><h3>ROI para dimensionar</h3></div></div>
          <ul className={styles.plainList}>
            {plan.roiMetrics.map((item, index) => <li key={`${item.metric}-${index}`}><strong>{item.metric}</strong><span>{item.howToMeasure}</span></li>)}
            {!plan.roiMetrics.length && <li><span>Valide volume, frequência, tempo perdido e efeito sobre resultado durante a conversa.</span></li>}
          </ul>
        </section>

        <section className={classNames(styles.dossierBlock, styles.wideBlock)}>
          <div className={styles.blockTitle}><div><span>04</span><h3>Banco de perguntas PACE</h3></div><small>prontas para falar</small></div>
          <div className={styles.questionColumns}>
            {phaseGroups.map(({ phase, questions }) => (
              <article key={phase}>
                <h4>{PHASE_LABELS[phase]} <span>{questions.length}</span></h4>
                <ul>{questions.map((question, index) => <li key={`${question.text}-${index}`}>{question.text}<small>{question.why}</small></li>)}</ul>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.dossierBlock}>
          <div className={styles.blockTitle}><div><span>05</span><h3>Objeções prováveis</h3></div></div>
          <ul className={styles.plainList}>
            {plan.objections.map((item, index) => <li key={`${item.objection}-${index}`}><strong>{item.objection}</strong><span>Pergunte: {item.question}</span></li>)}
          </ul>
        </section>

        <section className={styles.dossierBlock}>
          <div className={styles.blockTitle}><div><span>06</span><h3>Riscos e lacunas</h3></div></div>
          <ul className={styles.riskList}>
            {plan.risks.map((risk, index) => <li key={`${risk}-${index}`}><CircleAlert size={14} /> {risk}</li>)}
            {plan.gaps.map((gap) => <li key={gap}><CircleAlert size={14} /> Banco ainda não cobre: {DISCOVERY_CHECKLIST.find((item) => item.key === gap)?.label}</li>)}
            {!plan.risks.length && !plan.gaps.length && <li><Check size={14} /> Checklist coberto pelo banco de perguntas.</li>}
          </ul>
        </section>
      </div>

      {!!plan.sources.length && (
        <details className={styles.sources}>
          <summary>Fontes públicas consultadas ({plan.sources.length})</summary>
          <div>{plan.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={12} /></a>)}</div>
        </details>
      )}

      <div className={styles.dossierAction}>
        <div><Radio size={18} /><span>Plano salvo neste navegador</span></div>
        <button type="button" onClick={onGoLive}>Abrir apoio ao vivo <ChevronRight size={17} /></button>
      </div>
    </section>
  );
}

export default function CopilotClient({
  userName, opportunities, supernormalStatus,
}: {
  userName: string;
  opportunities: CopilotOpportunity[];
  supernormalStatus: 'connected' | 'not-configured' | 'admin-only';
}) {
  const [tab, setTab] = useState<Tab>('planejamento');
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [context, setContext] = useState('');
  const [offer, setOffer] = useState(DEFAULT_VERTHO_OFFER);
  const [opportunityId, setOpportunityId] = useState('');
  const [plan, setPlan] = useState<CopilotPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planningSeconds, setPlanningSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [captureState, setCaptureState] = useState<CaptureState>('parado');
  const [utterances, setUtterances] = useState<LiveUtterance[]>([]);
  const [partial, setPartial] = useState('');
  const [reading, setReading] = useState<LiveReading>(EMPTY_READING);
  const [thinking, setThinking] = useState(false);

  const [posts, setPosts] = useState<SupernormalPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [importingPost, setImportingPost] = useState<string | null>(null);

  const captureRef = useRef<LocalMeetingCapture | null>(null);
  const utterancesRef = useRef<LiveUtterance[]>([]);
  const readingRef = useRef<LiveReading>(EMPTY_READING);
  const planRef = useRef<CopilotPlan | null>(null);
  const contextRef = useRef('');
  const processingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(PLAN_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (parsed?.plan) setPlan(parsed.plan);
        if (typeof parsed?.company === 'string') setCompany(parsed.company);
        if (typeof parsed?.site === 'string') setSite(parsed.site);
        if (typeof parsed?.context === 'string') setContext(parsed.context);
        if (typeof parsed?.offer === 'string') setOffer(parsed.offer);
        if (typeof parsed?.opportunityId === 'string') setOpportunityId(parsed.opportunityId);
      } catch {
        localStorage.removeItem(PLAN_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { readingRef.current = reading; }, [reading]);
  useEffect(() => { planRef.current = plan; }, [plan]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => () => {
    captureRef.current?.stop();
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!planning) return;
    const started = Date.now();
    const timer = window.setInterval(() => setPlanningSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [planning]);

  const processLiveTurn = useCallback(async (nextUtterances: LiveUtterance[]) => {
    if (processingRef.current || !nextUtterances.length) return;
    processingRef.current = true;
    setThinking(true);
    try {
      const res = await fetchAuth('/api/copiloto/live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterances: nextUtterances.slice(-14), phase: readingRef.current.phase,
          covered: readingRef.current.covered, context: contextRef.current, plan: planRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao ler a conversa');
      setReading(data.reading);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar o apoio ao vivo');
    } finally {
      processingRef.current = false;
      setThinking(false);
    }
  }, []);

  const onSegment = useCallback((payload: Parameters<typeof toUtterance>[0]) => {
    const utterance = toUtterance(payload);
    const next = [...utterancesRef.current, utterance].slice(-200);
    utterancesRef.current = next;
    setUtterances(next);
    setPartial('');

    if (payload.canal === 'cliente') {
      const currentPlan = planRef.current;
      if (currentPlan) {
        const immediate = selectImmediateQuestions(
          currentPlan,
          readingRef.current,
          next.filter((item) => item.channel === 'vendedor').map((item) => item.text),
        );
        if (immediate.length) setReading((current) => ({ ...current, questions: immediate }));
      }
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void processLiveTurn(next), 350);
    }
  }, [processLiveTurn]);

  async function generatePlan(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPlanningSeconds(0);
    setPlanning(true);
    try {
      const res = await fetchAuth('/api/copiloto/planejamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company, site, context, offer, opportunityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao montar o planejamento');
      setPlan(data.plan);
      try {
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
          plan: data.plan, company, site, context, offer, opportunityId,
        }));
      } catch {
        // O plano continua utilizável na sessão se o navegador bloquear storage.
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível montar o planejamento');
    } finally {
      setPlanning(false);
    }
  }

  function selectOpportunity(id: string) {
    setOpportunityId(id);
    const selected = opportunities.find((item) => item.id === id);
    if (!selected) return;
    setCompany(selected.accountName);
    setContext((current) => current.trim() ? current : selected.context);
  }

  async function startCapture() {
    setError(null);
    const capture = new LocalMeetingCapture({
      url: ASR_URL,
      onSegment,
      onPartial: (payload) => { if (payload.canal === 'cliente') setPartial(payload.texto); },
      onState: setCaptureState,
      onError: setError,
    });
    captureRef.current = capture;
    try { await capture.start(); } catch { captureRef.current = null; }
  }

  function stopCapture() {
    captureRef.current?.stop();
    captureRef.current = null;
    setPartial('');
  }

  const loadPosts = useCallback(async () => {
    if (supernormalStatus !== 'connected') return;
    setPostsLoading(true);
    setError(null);
    try {
      const res = await fetchAuth('/api/copiloto/supernormal');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao ler o Supernormal');
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setPostsLoaded(true);
    } catch (err: any) {
      setError(err?.message || 'Falha ao ler o Supernormal');
    } finally {
      setPostsLoading(false);
    }
  }, [supernormalStatus]);

  useEffect(() => {
    if (tab !== 'pos-reuniao' || supernormalStatus !== 'connected' || postsLoaded || postsLoading) return;
    const timer = window.setTimeout(() => void loadPosts(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts, postsLoaded, postsLoading, supernormalStatus, tab]);

  async function importPost(postId: string) {
    setImportingPost(postId);
    setError(null);
    try {
      const res = await fetchAuth(`/api/copiloto/supernormal?post_id=${encodeURIComponent(postId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao importar a reunião');
      const post = data.post as SupernormalPostDetail;
      const transcript = post.transcript.map((item) => `${item.authorName}: ${item.content}`).join('\n');
      const notes = post.notes.map((item) => item.body).filter(Boolean).join('\n');
      const imported = [
        `REUNIÃO ANTERIOR — ${post.title} (${formatDate(post.publishedAt)})`,
        post.summary ? `Resumo do Supernormal:\n${post.summary}` : '',
        notes ? `Notas:\n${notes}` : '',
        transcript ? `Transcrição:\n${transcript}` : '',
      ].filter(Boolean).join('\n\n').slice(0, 30000);
      setContext((current) => [current.trim(), imported].filter(Boolean).join('\n\n').slice(0, 30000));
      setTab('planejamento');
    } catch (err: any) {
      setError(err?.message || 'Falha ao importar a reunião');
    } finally {
      setImportingPost(null);
    }
  }

  function clearPlan() {
    try { localStorage.removeItem(PLAN_STORAGE_KEY); } catch { /* storage bloqueado */ }
    setPlan(null);
  }

  const recording = captureState === 'gravando';
  const firstName = userName.split(' ')[0] || userName;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href="/dashboard" aria-label="Voltar"><ArrowLeft size={17} /></Link>
          <Image src="/logo-vertho.png" alt="Vertho" width={106} height={24} priority />
          <span>Copiloto comercial</span>
        </div>
        <div className={styles.topMeta}>
          <span className={recording ? styles.statusLive : styles.statusReady}><i /> {recording ? 'Escutando' : 'Pronto'}</span>
          <small>{firstName}</small>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PACE · inteligência para a conversa</p>
          <h1>Entre com <em>hipóteses.</em><br />Saia com compromisso.</h1>
          <p>Pesquisa antes, orientação durante e contexto reaproveitável depois da reunião.</p>
        </div>
        <div className={styles.heroMark}><Sparkles size={30} /><span>IA com<br />evidência</span></div>
      </section>

      <nav className={styles.tabs} aria-label="Momentos do copiloto">
        <button onClick={() => setTab('planejamento')} className={tab === 'planejamento' ? styles.tabActive : ''}><Search size={16} /><span>Planejamento<small>antes da conversa</small></span></button>
        <button onClick={() => setTab('ao-vivo')} className={tab === 'ao-vivo' ? styles.tabActive : ''}><Headphones size={16} /><span>Apoio ao vivo<small>Whisper local</small></span></button>
        <button onClick={() => setTab('pos-reuniao')} className={tab === 'pos-reuniao' ? styles.tabActive : ''}><FileText size={16} /><span>Pós-reunião<small>Supernormal</small></span></button>
      </nav>

      <PaceRunway tab={tab} livePhase={reading.phase} />

      {error && <div className={styles.error}><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}

      {tab === 'planejamento' && (
        <div className={styles.workspace}>
          <form className={styles.setupPanel} onSubmit={generatePlan}>
            <header><span>01 · INPUT</span><h2>Planeje a conversa</h2><p>Comece pelo nome da empresa. O briefing pode ser uma nota curta ou a transcrição de uma conversa anterior.</p></header>

            {!!opportunities.length && (
              <label>Oportunidade no CRM
                <select value={opportunityId} onChange={(event) => selectOpportunity(event.target.value)}>
                  <option value="">Preparação avulsa</option>
                  {opportunities.map((item) => <option key={item.id} value={item.id}>{item.accountName} · {item.name}</option>)}
                </select>
              </label>
            )}

            <div className={styles.twoFields}>
              <label>Empresa<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Ex.: Grupo Sinal" maxLength={200} /></label>
              <label>Site público<input value={site} onChange={(event) => setSite(event.target.value)} placeholder="empresa.com.br" inputMode="url" maxLength={320} /></label>
            </div>

            <label>O que você já sabe deste cliente
              <textarea value={context} onChange={(event) => setContext(event.target.value)} rows={8} maxLength={30000} placeholder="Cole anotações ou a transcrição de uma conversa anterior…" />
              <small><ShieldCheck size={12} /> Não entra na busca pública.</small>
            </label>

            <label>O que você vende
              <textarea value={offer} onChange={(event) => setOffer(event.target.value)} rows={5} maxLength={12000} />
              <small><Sparkles size={12} /> Pré-preenchido com os serviços Vertho; ajuste para esta conversa.</small>
            </label>

            <div className={styles.formActions}>
              <button type="submit" disabled={planning || (!company.trim() && !site.trim() && context.trim().length < 20)}>
                {planning ? <><LoaderCircle size={17} className={styles.spin} /> Pesquisando · {planningSeconds}s</> : <><Search size={17} /> Pesquisar e montar plano</>}
              </button>
              {plan && <button type="button" className={styles.secondaryButton} onClick={clearPlan}>Limpar</button>}
            </div>
            {planning && <p className={styles.waitCopy}>A IA está cruzando site, notícias e contexto comercial. Uma pesquisa profunda pode levar alguns minutos.</p>}
          </form>

          <aside className={styles.researchPanel}>
            <header><span>02 · OUTPUT</span><h2>Mapa de evidências</h2><p>Fatos verificáveis de um lado; hipóteses que precisam ser testadas do outro.</p></header>
            {plan ? (
              <div className={styles.miniMap}>
                <div><b>{plan.facts.length}</b><span>fatos públicos</span></div>
                <div><b>{plan.hypotheses.length}</b><span>hipóteses</span></div>
                <div><b>{plan.questions.length}</b><span>perguntas</span></div>
                <div><b>{plan.sources.length}</b><span>fontes</span></div>
              </div>
            ) : (
              <div className={styles.emptyResearch}>
                <Building2 size={28} />
                <h3>O dossiê aparece aqui</h3>
                <p>A pesquisa procura sinais do negócio, movimentos recentes, tendências do setor e caminhos de ROI.</p>
                <ul><li><Check size={13} /> Fontes com links</li><li><Check size={13} /> Hipóteses separadas de fatos</li><li><Check size={13} /> Banco de perguntas PACE</li></ul>
              </div>
            )}
            <div className={styles.privacyNote}><ShieldCheck size={17} /><p><strong>Fronteira de privacidade</strong>A busca recebe apenas nome e site públicos. Briefing e oferta entram somente na análise privada.</p></div>
          </aside>

          {plan && <div className={styles.fullRow}><PlanDossier plan={plan} onGoLive={() => setTab('ao-vivo')} /></div>}
        </div>
      )}

      {tab === 'ao-vivo' && (
        <section className={styles.liveWorkspace}>
          <header className={styles.liveHeader}>
            <div><p className={styles.eyebrow}>Sala de comando</p><h2>{recording ? 'Conversa em andamento' : 'Apoio ao vivo com Whisper local'}</h2><p>O áudio é transcrito na sua máquina. Somente trechos de texto seguem para a IA montar as sugestões.</p></div>
            <button className={recording ? styles.stopButton : styles.startButton} onClick={recording ? stopCapture : startCapture} disabled={captureState === 'conectando'}>
              {recording ? <><Square size={16} fill="currentColor" /> Parar conversa</> : captureState === 'conectando' ? <><LoaderCircle size={17} className={styles.spin} /> Conectando…</> : <><Mic size={17} /> Iniciar conversa</>}
            </button>
          </header>

          {!plan && <div className={styles.liveHint}><CircleAlert size={17} /><span>Você pode iniciar sem plano, mas o apoio melhora muito quando o banco de perguntas já foi preparado.</span><button onClick={() => setTab('planejamento')}>Planejar primeiro</button></div>}

          <div className={styles.liveGrid}>
            <section className={styles.nextMove}>
              <div className={styles.liveLabel}><Radio size={15} /> Próxima melhor intervenção {thinking && <span><LoaderCircle size={13} className={styles.spin} /> analisando</span>}</div>
              <h3>{reading.focus}</h3>
              <div className={styles.suggestionList}>
                {reading.questions.length ? reading.questions.map((question, index) => (
                  <article key={`${question.text}-${index}`}><span>0{index + 1}</span><p>{question.text}<small>{question.why}</small></p></article>
                )) : <div className={styles.listening}><AudioLines size={28} /><p>{recording ? 'Ouvindo a conversa…' : 'As perguntas sugeridas aparecem aqui.'}</p></div>}
              </div>
              {reading.alert && <p className={styles.liveAlert}><CircleAlert size={15} /> {reading.alert}</p>}
              {reading.objection && <p className={styles.liveObjection}><strong>Em aberto:</strong> {reading.objection}</p>}
            </section>

            <aside className={styles.discoveryPanel}>
              <div className={styles.liveLabel}><Check size={15} /> Descoberta</div>
              <div className={styles.progress}><i style={{ width: `${Math.round((reading.covered.length / DISCOVERY_CHECKLIST.length) * 100)}%` }} /></div>
              <p>{reading.covered.length} de {DISCOVERY_CHECKLIST.length} pontos cobertos</p>
              <ul>{DISCOVERY_CHECKLIST.map((item) => <li key={item.key} className={reading.covered.includes(item.key) ? styles.covered : ''}><span>{reading.covered.includes(item.key) ? <Check size={12} /> : ''}</span>{item.label}</li>)}</ul>
            </aside>

            <section className={styles.transcriptPanel}>
              <div className={styles.liveLabel}><AudioLines size={15} /> Transcrição local <span className={recording ? styles.connected : ''}>{recording ? <Wifi size={13} /> : <WifiOff size={13} />}{recording ? 'conectado' : 'parado'}</span></div>
              <div className={styles.transcript}>
                {!utterances.length && !partial && <p className={styles.transcriptEmpty}>A transcrição não é salva no servidor do Copiloto.</p>}
                {utterances.slice(-40).map((item, index) => <p key={`${item.at}-${index}`} data-channel={item.channel}><span>{item.channel === 'cliente' ? 'Cliente' : 'Você'}</span>{item.text}</p>)}
                {partial && <p data-channel="cliente" className={styles.partial}><span>Cliente</span>{partial}</p>}
              </div>
            </section>
          </div>

          <footer className={styles.liveFooter}><ShieldCheck size={15} /><span>Avise os participantes de que você usa um assistente de transcrição e respeite a política de gravação da organização.</span><code>{ASR_URL}</code></footer>
        </section>
      )}

      {tab === 'pos-reuniao' && (
        <section className={styles.postWorkspace}>
          <header><div><p className={styles.eyebrow}>Memória comercial</p><h2>Traga a reunião de volta para o PACE</h2><p>Use resumo, notas e transcrição como histórico para a próxima conversa — sem copiar e colar entre ferramentas.</p></div>{supernormalStatus === 'connected' && <button onClick={() => void loadPosts()} disabled={postsLoading}><RefreshCw size={15} className={postsLoading ? styles.spin : ''} /> Atualizar</button>}</header>

          {supernormalStatus !== 'connected' ? (
            <div className={styles.integrationEmpty}>
              <div className={styles.supernormalMark}>S</div>
              <div><span>{supernormalStatus === 'admin-only' ? 'Proteção de conta' : 'Integração disponível'}</span><h3>{supernormalStatus === 'admin-only' ? 'Conexão individual por enquanto' : 'Conecte o Supernormal'}</h3><p>{supernormalStatus === 'admin-only' ? 'O token configurado pertence a uma conta individual e não é compartilhado com representantes. A próxima evolução é OAuth ou um segredo separado por usuário.' : 'A API fica no servidor. Depois de adicionar o token, suas reuniões recentes aparecem aqui para importação.'}</p></div>
              {supernormalStatus === 'not-configured' && <ol><li><b>1</b> Confirme que seu plano tem acesso à API</li><li><b>2</b> Crie uma API key com escopo mínimo de leitura</li><li><b>3</b> Adicione <code>SUPERNORMAL_API_TOKEN</code> ao ambiente</li></ol>}
              <a href="https://docs.supernormal.com/api-reference/introduction" target="_blank" rel="noreferrer">Abrir documentação <ExternalLink size={14} /></a>
            </div>
          ) : postsLoading && !postsLoaded ? (
            <div className={styles.loadingPosts}><LoaderCircle size={24} className={styles.spin} /> Buscando reuniões recentes…</div>
          ) : posts.length ? (
            <div className={styles.postsGrid}>
              {posts.map((post) => (
                <article key={post.id}>
                  <div className={styles.postDate}><Clock3 size={14} /> {formatDate(post.publishedAt)}</div>
                  <h3>{post.title}</h3><p>{post.summary || 'Sem resumo disponível na listagem.'}</p>
                  <button onClick={() => void importPost(post.id)} disabled={importingPost === post.id}>{importingPost === post.id ? <LoaderCircle size={15} className={styles.spin} /> : <ChevronRight size={15} />} Usar na preparação</button>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.loadingPosts}><FileText size={24} /> Nenhuma reunião encontrada no Supernormal.</div>
          )}

          <div className={styles.manualFallback}><FileText size={18} /><p><strong>Sem API no seu plano?</strong> Você ainda pode colar qualquer transcrição no campo “O que você já sabe deste cliente”.</p><button onClick={() => setTab('planejamento')}>Abrir planejamento</button></div>
        </section>
      )}
    </main>
  );
}
