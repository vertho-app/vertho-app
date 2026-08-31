'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, AudioLines, Ban, Building2, Check, ChevronRight, CircleAlert, Clock3,
  ClipboardPaste, Database, ExternalLink, FileText, Headphones, LoaderCircle, Mic, Radio,
  MessageSquareQuote, Newspaper, RefreshCw, Save, Search, Share2, ShieldAlert, ShieldCheck,
  Sparkles, Square, Target, UsersRound, Wifi, WifiOff,
} from 'lucide-react';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import {
  DEFAULT_VERTHO_OFFER, DISCOVERY_CHECKLIST, MEETING_KINDS, PACE_PHASES,
  type CopilotAccountListItem, type CopilotOpportunity, type CopilotPlan, type CopilotPlay, type CopilotSource,
  type CopilotSourceKind, type LiveReading, type LiveUtterance, type MeetingKind, type PacePhase, type SupernormalPost,
  type SupernormalPostDetail,
} from '@/lib/copiloto/types';
import { inferMeetingKind } from '@/lib/copiloto/play';
import { mesclarPerfisSociais } from '@/lib/copiloto/social-discovery';
import {
  LocalMeetingCapture, toUtterance,
  type CaptureAudioLevels, type CaptureState, type CaptureSurface,
} from './audio-capture';
import {
  probeLocalAsr,
  requestLocalAsrStart,
  waitForLocalAsr,
  type LocalAsrState,
} from './local-asr';
import {
  addAudioEvidence, assessAudioInputHealth, EMPTY_AUDIO_EVIDENCE,
  type AudioInputEvidence, type AudioInputHealth,
} from './audio-health';
import ClientsWorkspace, {
  type CopilotOpenPlanSeed,
  type CopilotPreparationSeed,
} from './clients-workspace';
import { selectImmediateQuestions } from './local-bank';
import styles from './copiloto.module.css';

type Tab = 'clientes' | 'planejamento' | 'ao-vivo' | 'pos-reuniao';
type LiveAnalysisState = 'idle' | 'active' | 'fallback' | 'error';
type MeetingComposition = 'solo-vertho' | 'mixed-remote';

const PLAN_STORAGE_KEY = 'vertho-copiloto-plan-v1';
const ASR_URL = process.env.NEXT_PUBLIC_COPILOTO_ASR_URL || 'ws://127.0.0.1:8765';
const LIVE_ANALYSIS_COOLDOWN_MS = 2600;

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

function sourceChannel(value: string): 'LinkedIn' | 'Instagram' | 'Facebook' | 'YouTube' | 'TikTok' | 'X' | 'Web' {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'LinkedIn';
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'Instagram';
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) return 'Facebook';
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) return 'YouTube';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'TikTok';
    if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'X';
  } catch {
    // URLs já são validadas no servidor; o fallback mantém o dossiê utilizável.
  }
  return 'Web';
}

type SourceDisplayKind = CopilotSourceKind | 'legacy';

const SOURCE_GROUPS: Array<{
  kind: SourceDisplayKind;
  index: string;
  label: string;
  description: string;
}> = [
  { kind: 'site', index: '01', label: 'Site oficial', description: 'Páginas e documentos institucionais' },
  { kind: 'news', index: '02', label: 'Imprensa externa', description: 'Notícias fora do domínio oficial' },
  { kind: 'social', index: '03', label: 'Redes oficiais', description: 'Perfis e publicações confirmados' },
  { kind: 'legacy', index: '—', label: 'Web · plano anterior', description: 'Gere o plano novamente para classificar' },
];

function sourceDisplayKind(source: CopilotSource): SourceDisplayKind {
  if (source.kind) return source.kind;
  return sourceChannel(source.url) === 'Web' ? 'legacy' : 'social';
}

function meetingKindLabel(kind: MeetingKind): string {
  return MEETING_KINDS.find((item) => item.key === kind)?.label || 'Reunião';
}

type SocialDiscoveryState =
  | { status: 'idle' }
  | { status: 'buscando' }
  | { status: 'ok'; encontrados: number; adicionados: number; host: string }
  | { status: 'vazio'; host: string }
  | { status: 'erro'; mensagem: string };

/** Só vale varrer quando o que está no campo já parece um domínio inteiro. */
const SITE_VARRIVEL = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i;

function hostVisivel(value: string): string {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, '');
  } catch {
    return value.replace(/^https?:\/\//i, '').replace(/^www\./, '').split('/')[0];
  }
}


function PlayCard({ play }: { play: CopilotPlay }) {
  return (
    <section className={styles.playCard} aria-label="Play desta reunião">
      <header className={styles.playHeader}>
        <div className={styles.playTitle}>
          <span><Target size={15} /> Play desta reunião</span>
          <p><b>{meetingKindLabel(play.kind)}</b><i /> <UsersRound size={13} /> {play.audience}</p>
          <h3><small>Esta hora precisa terminar com</small>{play.goalThisHour}</h3>
        </div>
        <div className={styles.playCloseFlag}>
          <span>Feche pedindo</span>
          <strong>{play.closeWith}</strong>
        </div>
      </header>

      <div className={styles.playOpeners}>
        <div className={styles.playSectionLabel}><MessageSquareQuote size={14} /><span>Abra com</span></div>
        <div>
          {play.openers.map((opener, index) => (
            <blockquote key={`${opener.say}-${index}`}>
              <b>{opener.factIndex === null ? 'Briefing' : `F${opener.factIndex + 1}`}</b>
              <p>“{opener.say}”</p>
            </blockquote>
          ))}
        </div>
      </div>

      <div className={styles.playQuestions}>
        <div className={styles.playSectionLabel}><Radio size={14} /><span>Pergunte estas 3</span></div>
        <div className={styles.playQuestionGrid}>
          {play.mustAsk.map((question, index) => (
            <article key={`${question.text}-${index}`}>
              <span>0{index + 1}</span>
              <h4>{question.text}</h4>
              <div className={styles.playSignals}>
                <p data-signal="green"><b>Verde</b>{question.green}</p>
                <p data-signal="red"><b>Vermelho</b>{question.red}</p>
              </div>
              <footer><ChevronRight size={12} /><span>Se verde: {question.ifGreen}</span></footer>
            </article>
          ))}
        </div>
      </div>

      <footer className={styles.playFooter}>
        <section>
          <div className={styles.playSectionLabel}><Ban size={14} /><span>Não faça</span></div>
          {play.doNot.length
            ? <ul>{play.doNot.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
            : <p>Não antecipe solução antes de confirmar a dor desta conversa.</p>}
        </section>
        <section className={styles.playLandmine}>
          <div className={styles.playSectionLabel}><ShieldAlert size={14} /><span>Minado provável</span></div>
          <strong>“{play.landmine.objection}”</strong>
          <p>Pergunte: {play.landmine.ask}</p>
        </section>
      </footer>
    </section>
  );
}

function LivePlayStrip({ play, reading }: { play: CopilotPlay; reading: LiveReading }) {
  return (
    <aside className={classNames(styles.livePlayStrip, reading.phase !== 'engajar' && styles.livePlayStripOpen)} aria-label="Play em andamento">
      <div className={styles.livePlayGoal}>
        <span><Target size={13} /> Objetivo desta hora</span>
        <strong>{play.goalThisHour}</strong>
      </div>
      <ol>
        {play.mustAsk.map((question, index) => {
          const covered = Boolean(question.discovery && reading.covered.includes(question.discovery));
          return (
            <li key={`${question.text}-${index}`} className={covered ? styles.livePlayCovered : ''}>
              <span>{covered ? <Check size={11} /> : `0${index + 1}`}</span>
              <p>{question.text}</p>
            </li>
          );
        })}
      </ol>
      {reading.phase === 'engajar' && (
        <div className={styles.livePlayClose}>
          <span>Feche pedindo</span>
          <strong>{play.closeWith}</strong>
        </div>
      )}
    </aside>
  );
}

function DossierAction({ persisted, onGoLive }: { persisted: boolean; onGoLive: () => void }) {
  return (
    <div className={styles.dossierAction}>
      <div><Radio size={18} /><span>{persisted ? 'Plano salvo no histórico da empresa' : 'Plano disponível neste navegador'}</span></div>
      <button type="button" onClick={onGoLive}>Abrir apoio ao vivo <ChevronRight size={17} /></button>
    </div>
  );
}

function PaceRunway({ tab, livePhase }: { tab: Tab; livePhase: PacePhase }) {
  const currentIndex = PACE_PHASES.indexOf(livePhase);
  return (
    <div className={styles.runway} aria-label="Jornada PACE">
      <div className={classNames(styles.runwayStep, tab === 'clientes' && styles.runwayCurrent)} data-tone="memory">
        <span>H</span> Histórico
      </div>
      <i>→</i>
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

function PlanDossier({ plan, onGoLive, persisted }: { plan: CopilotPlan; onGoLive: () => void; persisted: boolean }) {
  const phaseGroups = useMemo(() => PACE_PHASES.map((phase) => ({
    phase, questions: plan.questions.filter((question) => question.phase === phase),
  })), [plan.questions]);
  const sourceGroups = useMemo(() => SOURCE_GROUPS.map((group) => ({
    ...group,
    sources: plan.sources.filter((source) => sourceDisplayKind(source) === group.kind),
  })).filter((group) => group.sources.length), [plan.sources]);

  return (
    <section className={styles.dossier} aria-label="Planejamento pronto">
      <header className={styles.dossierHeader}>
        <div>
          <p className={styles.eyebrow}>Dossiê pronto</p>
          <h2>{plan.companyIdentified}</h2>
          <p>{plan.companySummary || plan.valueSummary}</p>
        </div>
        <div className={styles.dossierStats}>
          <span><FileText size={14} /> {plan.play ? '3 perguntas essenciais' : `${plan.questions.length} perguntas`}</span>
          <span><Database size={14} /> {plan.sources.length} fontes</span>
        </div>
      </header>

      {plan.play
        ? <PlayCard play={plan.play} />
        : <div className={styles.objectives}>
            <article><span>Objetivo principal</span><p>{plan.objectives.primary}</p></article>
            <article><span>Objetivo reserva</span><p>{plan.objectives.fallback}</p></article>
          </div>}

      {plan.play && <DossierAction persisted={persisted} onGoLive={onGoLive} />}

      {plan.valueSummary && <p className={styles.valueSummary}><Sparkles size={16} /> {plan.valueSummary}</p>}

      {plan.researchAudit && (
        <div className={styles.researchAudit} aria-label="Rastreabilidade da pesquisa pública">
          <article data-status={plan.researchAudit.site.status}>
            <Building2 size={17} />
            <div><span>Site oficial</span><strong>{
              plan.researchAudit.site.status === 'found'
                ? `${plan.researchAudit.site.signalsFound} ${plan.researchAudit.site.signalsFound === 1 ? 'sinal usado' : 'sinais usados'}`
                : plan.researchAudit.site.status === 'unavailable'
                  ? 'Busca não concluiu nesta tentativa'
                  : plan.researchAudit.site.status === 'none'
                    ? 'Nenhum fato verificável encontrado'
                    : 'Busca não solicitada'
            }</strong></div>
          </article>
          <article data-status={plan.researchAudit.news.status}>
            <Newspaper size={17} />
            <div><span>Imprensa externa</span><strong>{
              plan.researchAudit.news.status === 'found'
                ? `${plan.researchAudit.news.signalsFound} ${plan.researchAudit.news.signalsFound === 1 ? 'notícia usada' : 'notícias usadas'}`
                : plan.researchAudit.news.status === 'unavailable'
                  ? 'Busca não concluiu nesta tentativa'
                  : plan.researchAudit.news.status === 'none'
                    ? 'Nenhuma notícia externa verificável'
                    : 'Busca não solicitada'
            }</strong></div>
          </article>
          <article data-status={plan.researchAudit.social.status}>
            <Share2 size={17} />
            <div><span>Redes oficiais</span><strong>{
              plan.researchAudit.social.status === 'found'
                ? `${plan.researchAudit.social.signalsFound} ${plan.researchAudit.social.signalsFound === 1 ? 'post público usado' : 'posts públicos usados'}`
                : plan.researchAudit.social.status === 'unavailable'
                  ? 'Busca não concluiu nesta tentativa'
                  : plan.researchAudit.social.status === 'none'
                    ? 'Nenhum post público indexado'
                    : 'Nenhum perfil informado'
            }</strong></div>
            {!!plan.researchAudit.social.profilesConsulted && <em>{plan.researchAudit.social.profilesConsulted} {plan.researchAudit.social.profilesConsulted === 1 ? 'perfil' : 'perfis'}</em>}
          </article>
        </div>
      )}

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
          <div className={styles.blockTitle}><div><span>04</span><h3>{plan.play ? 'Banco de reserva PACE' : 'Banco de perguntas PACE'}</h3></div><small>{plan.play ? 'consulte se precisar aprofundar' : 'prontas para falar'}</small></div>
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
            {plan.gaps.map((gap) => <li key={gap}><CircleAlert size={14} /> {plan.play ? 'Ainda não consta na memória' : 'Banco ainda não cobre'}: {DISCOVERY_CHECKLIST.find((item) => item.key === gap)?.label}</li>)}
            {!plan.risks.length && !plan.gaps.length && <li><Check size={14} /> Checklist coberto pelo banco de perguntas.</li>}
          </ul>
        </section>
      </div>

      {!!plan.sources.length && (
        <details className={styles.sources}>
          <summary>
            <span>Fontes públicas consultadas <b>{plan.sources.length}</b></span>
            <em>até 8 por trilha</em>
          </summary>
          <div className={styles.sourceGroups}>
            {sourceGroups.map((group) => (
              <section key={group.kind} className={styles.sourceGroup} data-kind={group.kind} aria-label={group.label}>
                <header>
                  <span>{group.index}</span>
                  <div><h4>{group.label}</h4><p>{group.description}</p></div>
                  <b>{group.sources.length}{group.kind === 'legacy' ? '' : '/8'}</b>
                </header>
                <div className={styles.sourceList}>
                  {group.sources.map((source, index) => {
                    const channel = sourceChannel(source.url);
                    const badge = channel === 'Web' ? (group.kind === 'news' ? 'Imprensa' : 'Site') : channel;
                    return (
                      <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" title={source.url}>
                        <b>{badge}</b><span>{source.title}</span><ExternalLink size={12} />
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </details>
      )}

      {!plan.play && <DossierAction persisted={persisted} onGoLive={onGoLive} />}
    </section>
  );
}

export default function CopilotClient({
  userName, opportunities, accounts, canCreateLeads, supernormalStatus,
}: {
  userName: string;
  opportunities: CopilotOpportunity[];
  accounts: CopilotAccountListItem[];
  canCreateLeads: boolean;
  supernormalStatus: 'connected' | 'not-configured' | 'admin-only';
}) {
  const [tab, setTab] = useState<Tab>('clientes');
  const [company, setCompany] = useState('');
  const [site, setSite] = useState('');
  const [socialProfiles, setSocialProfiles] = useState('');
  const [context, setContext] = useState('');
  const [offer, setOffer] = useState(DEFAULT_VERTHO_OFFER);
  const [opportunityId, setOpportunityId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [meetingKind, setMeetingKind] = useState<MeetingKind>('primeira_conversa');
  const [audience, setAudience] = useState('');
  const [audienceOptions, setAudienceOptions] = useState<string[]>([]);
  const [goalThisHour, setGoalThisHour] = useState('');
  const [socialDiscovery, setSocialDiscovery] = useState<SocialDiscoveryState>({ status: 'idle' });
  const [activePlanningId, setActivePlanningId] = useState('');
  const [planPersisted, setPlanPersisted] = useState(false);
  const [plan, setPlan] = useState<CopilotPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planningSeconds, setPlanningSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [captureState, setCaptureState] = useState<CaptureState>('parado');
  const [localAsrState, setLocalAsrState] = useState<LocalAsrState>('checking');
  const [localAsrReadyNotice, setLocalAsrReadyNotice] = useState(false);
  const [captureSurface, setCaptureSurface] = useState<CaptureSurface>('unknown');
  const [audioHealth, setAudioHealth] = useState<AudioInputHealth>('checking');
  const [meetingComposition, setMeetingComposition] = useState<MeetingComposition>('solo-vertho');
  const [utterances, setUtterances] = useState<LiveUtterance[]>([]);
  const [partial, setPartial] = useState<{ channel: LiveUtterance['channel']; text: string } | null>(null);
  const [reading, setReading] = useState<LiveReading>(EMPTY_READING);
  const [thinking, setThinking] = useState(false);
  const [liveAnalysisState, setLiveAnalysisState] = useState<LiveAnalysisState>('idle');
  const [resultSaving, setResultSaving] = useState(false);
  const [resultSaved, setResultSaved] = useState(false);

  const [posts, setPosts] = useState<SupernormalPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [importingPost, setImportingPost] = useState<string | null>(null);

  const captureRef = useRef<LocalMeetingCapture | null>(null);
  const asrActivationRef = useRef<AbortController | null>(null);
  const asrFreshnessTimerRef = useRef<number | null>(null);
  const startCaptureButtonRef = useRef<HTMLButtonElement | null>(null);
  const utterancesRef = useRef<LiveUtterance[]>([]);
  const readingRef = useRef<LiveReading>(EMPTY_READING);
  const planRef = useRef<CopilotPlan | null>(null);
  const contextRef = useRef('');
  const processingRef = useRef(false);
  const pendingAnalysisRef = useRef(false);
  const analysisInputRef = useRef<LiveUtterance[]>([]);
  const lastAnalysisStartedAtRef = useRef(0);
  const processLiveTurnRef = useRef<(nextUtterances: LiveUtterance[]) => void>(() => undefined);
  const timerRef = useRef<number | null>(null);
  const audioEvidenceRef = useRef<AudioInputEvidence>({ ...EMPTY_AUDIO_EVIDENCE });
  const captureStartedAtRef = useRef(0);
  const meetingCompositionRef = useRef<MeetingComposition>('solo-vertho');
  const audienceRequestRef = useRef(0);
  // Site já varrido: sem isso o efeito de descoberta reexecuta a cada render e
  // um seed que já traz redes salvas dispararia uma busca que não muda nada.
  const siteVarridoRef = useRef('');
  const socialRequestRef = useRef(0);
  const socialProfilesRef = useRef('');

  const markLocalAsrReady = useCallback((showCaptureNotice: boolean = false) => {
    if (asrFreshnessTimerRef.current) window.clearTimeout(asrFreshnessTimerRef.current);
    setLocalAsrState('ready');
    setLocalAsrReadyNotice(showCaptureNotice);
    // O sidecar encerra após 5 min sem cliente. Invalidamos um pouco antes para
    // nunca abrir o seletor de tela contando com um processo que já morreu.
    asrFreshnessTimerRef.current = window.setTimeout(() => {
      setLocalAsrState((current) => current === 'ready' ? 'offline' : current);
      setLocalAsrReadyNotice(false);
    }, 270_000);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(PLAN_STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (parsed?.plan) setPlan(parsed.plan);
        if (typeof parsed?.company === 'string') setCompany(parsed.company);
        if (typeof parsed?.site === 'string') setSite(parsed.site);
        if (typeof parsed?.socialProfiles === 'string') setSocialProfiles(parsed.socialProfiles);
        // Rascunho restaurado que já tem redes declaradas não vira varredura nova.
        if (typeof parsed?.site === 'string' && typeof parsed?.socialProfiles === 'string' && parsed.socialProfiles.trim()) {
          siteVarridoRef.current = parsed.site.trim();
        }
        if (typeof parsed?.context === 'string') setContext(parsed.context);
        if (typeof parsed?.offer === 'string') setOffer(parsed.offer);
        if (typeof parsed?.opportunityId === 'string') setOpportunityId(parsed.opportunityId);
        if (typeof parsed?.accountId === 'string') setAccountId(parsed.accountId);
        if (MEETING_KINDS.some((item) => item.key === parsed?.meetingKind)) setMeetingKind(parsed.meetingKind);
        if (typeof parsed?.audience === 'string') setAudience(parsed.audience);
        if (Array.isArray(parsed?.audienceOptions)) {
          setAudienceOptions(parsed.audienceOptions.filter((item: unknown) => typeof item === 'string').slice(0, 20));
        }
        if (typeof parsed?.goalThisHour === 'string') setGoalThisHour(parsed.goalThisHour);
        if (typeof parsed?.planningId === 'string') {
          setActivePlanningId(parsed.planningId);
          setPlanPersisted(!!parsed.planningId);
        }
        if (parsed?.persisted === true) setPlanPersisted(true);
      } catch {
        localStorage.removeItem(PLAN_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { readingRef.current = reading; }, [reading]);
  useEffect(() => { planRef.current = plan; }, [plan]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { socialProfilesRef.current = socialProfiles; }, [socialProfiles]);
  useEffect(() => { meetingCompositionRef.current = meetingComposition; }, [meetingComposition]);
  useEffect(() => () => {
    asrActivationRef.current?.abort();
    if (asrFreshnessTimerRef.current) window.clearTimeout(asrFreshnessTimerRef.current);
    captureRef.current?.stop();
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (tab !== 'ao-vivo' || captureState === 'gravando') {
      if (asrFreshnessTimerRef.current) window.clearTimeout(asrFreshnessTimerRef.current);
      return;
    }
    let active = true;
    const check = async () => {
      const available = await probeLocalAsr(ASR_URL);
      if (!active) return;
      if (available) markLocalAsrReady(false);
      else setLocalAsrState((current) => current === 'starting' ? current : 'offline');
    };
    void check();
    return () => {
      active = false;
    };
  }, [captureState, markLocalAsrReady, tab]);

  useEffect(() => {
    if (!planning) return;
    const started = Date.now();
    const timer = window.setInterval(() => setPlanningSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [planning]);

  const processLiveTurn = useCallback(async (nextUtterances: LiveUtterance[]) => {
    analysisInputRef.current = nextUtterances;
    if (!nextUtterances.length) return;
    if (processingRef.current) {
      pendingAnalysisRef.current = true;
      return;
    }
    processingRef.current = true;
    lastAnalysisStartedAtRef.current = Date.now();
    setThinking(true);
    try {
      const livePlan = planRef.current ? {
        questions: planRef.current.questions,
        objections: planRef.current.objections,
        play: planRef.current.play,
        gaps: planRef.current.gaps,
        facts: planRef.current.facts.slice(0, 3).map((fact) => ({ title: fact.title, fact: fact.fact })),
      } : null;
      const res = await fetchAuth('/api/copiloto/live', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterances: nextUtterances.slice(-8), phase: readingRef.current.phase,
          covered: readingRef.current.covered, context: contextRef.current.slice(0, 4000), plan: livePlan,
          sharedAudioRole: meetingCompositionRef.current === 'solo-vertho' ? 'cliente' : 'misto',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao ler a conversa');
      if (!data?.reading) throw new Error('A leitura ao vivo voltou vazia');
      setReading(data.reading);
      setLiveAnalysisState(data?.meta?.mode === 'local_fallback' ? 'fallback' : 'active');
      setError(null);
    } catch (err: any) {
      setLiveAnalysisState('error');
      setError(err?.message || 'Falha ao atualizar o apoio ao vivo');
    } finally {
      processingRef.current = false;
      setThinking(false);
      if (pendingAnalysisRef.current) {
        pendingAnalysisRef.current = false;
        const cooldown = Math.max(0, LIVE_ANALYSIS_COOLDOWN_MS - (Date.now() - lastAnalysisStartedAtRef.current));
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          processLiveTurnRef.current(analysisInputRef.current);
        }, cooldown);
      }
    }
  }, []);

  useEffect(() => { processLiveTurnRef.current = (next) => { void processLiveTurn(next); }; }, [processLiveTurn]);

  const scheduleLiveAnalysis = useCallback((nextUtterances: LiveUtterance[], settleMs = 200) => {
    if (!nextUtterances.length) return;
    analysisInputRef.current = nextUtterances;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const cooldown = Math.max(0, LIVE_ANALYSIS_COOLDOWN_MS - (Date.now() - lastAnalysisStartedAtRef.current));
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void processLiveTurn(analysisInputRef.current);
    }, Math.max(settleMs, cooldown));
  }, [processLiveTurn]);

  const onSegment = useCallback((payload: Parameters<typeof toUtterance>[0]) => {
    const utterance = toUtterance(payload);
    const next = [...utterancesRef.current, utterance].slice(-200);
    utterancesRef.current = next;
    setUtterances(next);
    setPartial(null);

    const immediate = selectImmediateQuestions(
      planRef.current,
      readingRef.current,
      next.filter((item) => item.channel === 'vendedor').map((item) => item.text),
    );
    if (immediate.length) setReading((current) => ({ ...current, questions: immediate }));

    // O ASR pode inverter ou não separar os canais conforme a fonte de áudio.
    // Toda fala finalizada aciona a análise; a IA usa o rótulo apenas como contexto.
    scheduleLiveAnalysis(next);
  }, [scheduleLiveAnalysis]);

  const onPartial = useCallback((payload: Parameters<typeof toUtterance>[0]) => {
    const partialText = payload.texto.trim();
    if (!partialText) return;
    setPartial({ channel: payload.canal, text: partialText });
    const sellerUtterances = utterancesRef.current
      .filter((item) => item.channel === 'vendedor')
      .map((item) => item.text);
    if (payload.canal === 'vendedor') sellerUtterances.push(partialText);
    const immediate = selectImmediateQuestions(planRef.current, readingRef.current, sellerUtterances);
    if (immediate.length) setReading((current) => ({ ...current, questions: immediate }));
    if (partialText.length < 24) return;
    const preview = [...utterancesRef.current, {
      channel: payload.canal,
      text: partialText,
      at: Date.now(),
    }].slice(-200);
    // Se o Whisper demorar para fechar o segmento, a parcial ainda mantém o
    // Copiloto responsivo. O debounce substitui versões anteriores da mesma fala.
    scheduleLiveAnalysis(preview, 500);
  }, [scheduleLiveAnalysis]);

  const onAudioLevels = useCallback((levels: CaptureAudioLevels) => {
    const evidence = addAudioEvidence(audioEvidenceRef.current, levels);
    audioEvidenceRef.current = evidence;
    setAudioHealth(assessAudioInputHealth(evidence, Date.now() - captureStartedAtRef.current));
  }, []);

  /**
   * Lê o site informado e traz de lá os perfis oficiais. O rodapé do site é a
   * evidência de titularidade que a régua de identidade exige — sem isso, a
   * trilha "Redes oficiais" da pesquisa não roda (campo vazio = busca social
   * não acontece).
   */
  const descobrirRedes = useCallback(async (rawSite: string) => {
    const alvo = rawSite.trim();
    if (!alvo) return;
    const requestId = ++socialRequestRef.current;
    siteVarridoRef.current = alvo;
    setSocialDiscovery({ status: 'buscando' });
    try {
      const res = await fetchAuth('/api/copiloto/redes-sociais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: alvo }),
      });
      const data = await res.json();
      if (requestId !== socialRequestRef.current) return;
      if (!res.ok) throw new Error(data?.error || 'Não foi possível ler o site');
      const perfis: string[] = Array.isArray(data?.perfis)
        ? data.perfis.filter((item: unknown) => typeof item === 'string')
        : [];
      const host = hostVisivel(typeof data?.siteLido === 'string' && data.siteLido ? data.siteLido : alvo);
      if (!perfis.length) {
        setSocialDiscovery({ status: 'vazio', host });
        return;
      }
      const { texto, adicionados } = mesclarPerfisSociais(socialProfilesRef.current, perfis);
      if (adicionados.length) setSocialProfiles(texto);
      setSocialDiscovery({ status: 'ok', encontrados: perfis.length, adicionados: adicionados.length, host });
    } catch (err: any) {
      if (requestId !== socialRequestRef.current) return;
      setSocialDiscovery({ status: 'erro', mensagem: err?.message || 'Não foi possível ler o site' });
    }
  }, []);

  // Automático: o vendedor digita o site e o campo de redes se preenche sozinho.
  // O debounce evita uma requisição por tecla; `siteVarridoRef` evita repetir o
  // mesmo domínio (inclusive quando um seed já traz as redes salvas).
  useEffect(() => {
    const alvo = site.trim();
    if (!alvo || alvo === siteVarridoRef.current || !SITE_VARRIVEL.test(alvo)) return;
    const timer = window.setTimeout(() => { void descobrirRedes(alvo); }, 900);
    return () => window.clearTimeout(timer);
  }, [site, descobrirRedes]);

  async function generatePlan(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPlanningSeconds(0);
    setPlanning(true);
    try {
      const res = await fetchAuth('/api/copiloto/planejamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, site, socialProfiles, context, offer, opportunityId, accountId,
          meetingKind, audience, goalThisHour,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao montar o planejamento');
      const generatedPlan = data.plan as CopilotPlan;
      setPlan(generatedPlan);
      setReading(EMPTY_READING);
      setPlanPersisted(false);
      const selectedOpportunity = opportunities.find((item) => item.id === opportunityId);
      const normalizedCompany = company.trim().toLocaleLowerCase('pt-BR');
      const matchingAccount = accounts.find((item) => [item.name, item.legalName]
        .some((name) => name.trim().toLocaleLowerCase('pt-BR') === normalizedCompany));
      const linkedAccountId = accountId || selectedOpportunity?.accountId || matchingAccount?.id || '';
      let savedPlanningId = '';
      let persistenceError = linkedAccountId
        ? ''
        : 'Planejamento gerado neste navegador. Para salvá-lo no histórico, comece pela aba Reuniões e escolha uma empresa.';
      if (linkedAccountId) {
        setAccountId(linkedAccountId);
        try {
          const saveRes = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(linkedAccountId)}/planejamentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plan: generatedPlan,
              opportunityId,
              inputs: { company, site, socialProfiles, context, offer, meetingKind, audience, goalThisHour },
            }),
          });
          const saved = await saveRes.json();
          if (!saveRes.ok) throw new Error(saved?.error || 'Falha ao salvar o planejamento');
          savedPlanningId = saved.planning.id;
          setActivePlanningId(savedPlanningId);
          setPlanPersisted(true);
        } catch (saveError: any) {
          persistenceError = saveError?.message || 'O planejamento foi gerado, mas não foi salvo no histórico.';
        }
      }
      try {
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
          plan: generatedPlan, company, site, socialProfiles, context, offer, opportunityId,
          accountId: linkedAccountId, planningId: savedPlanningId, persisted: !!savedPlanningId,
          meetingKind, audience, audienceOptions, goalThisHour,
        }));
      } catch {
        // O plano continua utilizável na sessão se o navegador bloquear storage.
      }
      if (persistenceError) setError(persistenceError);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível montar o planejamento');
    } finally {
      setPlanning(false);
    }
  }

  function loadAudienceContacts(nextAccountId: string, fallbackAudience = '') {
    const requestId = ++audienceRequestRef.current;
    setAudienceOptions(fallbackAudience ? [fallbackAudience] : []);
    void (async () => {
      try {
        const res = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(nextAccountId)}`);
        const data = await res.json();
        if (!res.ok || requestId !== audienceRequestRef.current) return;
        const contacts = Array.isArray(data?.detail?.contacts) ? data.detail.contacts : [];
        const options = contacts.map((contact: any) =>
          `${String(contact?.name || '').trim()}${contact?.role ? `, ${String(contact.role).trim()}` : ''}`)
          .filter(Boolean).slice(0, 20);
        const primary = contacts.find((contact: any) => contact?.isPrimary) || contacts[0];
        const primaryLabel = primary
          ? `${String(primary.name || '').trim()}${primary.role ? `, ${String(primary.role).trim()}` : ''}`
          : fallbackAudience;
        setAudienceOptions(options);
        setAudience((current) => current.trim() ? current : primaryLabel);
      } catch {
        // O contato primário vindo da oportunidade continua disponível.
      }
    })();
  }

  /** Zera a memória da varredura: o próximo site digitado volta a ser buscado. */
  function esquecerVarreduraDeRedes() {
    socialRequestRef.current += 1;
    siteVarridoRef.current = '';
    setSocialDiscovery({ status: 'idle' });
  }

  /**
   * Seed que já traz redes salvas não precisa de varredura — marcar o site como
   * varrido impede que abrir um cliente do histórico dispare uma leitura que não
   * mudaria nada.
   */
  function adotarRedesDoSeed(seedSite: string, seedSocialProfiles: string) {
    socialRequestRef.current += 1;
    siteVarridoRef.current = seedSocialProfiles.trim() ? seedSite.trim() : '';
    setSocialDiscovery({ status: 'idle' });
  }

  function changeCompany(nextCompany: string) {
    const changedIdentity = company.trim()
      && company.trim().toLocaleLowerCase('pt-BR') !== nextCompany.trim().toLocaleLowerCase('pt-BR');
    if (changedIdentity) {
      clearPlan();
      setSite('');
      setSocialProfiles('');
      esquecerVarreduraDeRedes();
      setAudience('');
      setAudienceOptions([]);
      setGoalThisHour('');
      setMeetingKind('primeira_conversa');
    }
    setCompany(nextCompany);
    const normalized = nextCompany.trim().toLocaleLowerCase('pt-BR');
    const matched = accounts.find((item) => [item.name, item.legalName]
      .some((name) => name.trim().toLocaleLowerCase('pt-BR') === normalized));
    setAccountId(matched?.id || '');
    if (matched) {
      setMeetingKind(inferMeetingKind({ stage: matched.currentStage, hasConversation: matched.conversationCount > 0 }));
      loadAudienceContacts(matched.id);
    } else {
      audienceRequestRef.current += 1;
    }
  }

  function selectOpportunity(id: string) {
    const previous = opportunities.find((item) => item.id === opportunityId);
    const selected = opportunities.find((item) => item.id === id);
    if (previous?.accountId !== selected?.accountId) {
      clearPlan();
      setSite('');
      setSocialProfiles('');
      esquecerVarreduraDeRedes();
    }
    setOpportunityId(id);
    if (!selected) {
      audienceRequestRef.current += 1;
      setAudience('');
      setAudienceOptions([]);
      setGoalThisHour('');
      setMeetingKind('primeira_conversa');
      return;
    }
    setAccountId(selected.accountId);
    setCompany(selected.accountName);
    setContext((current) => current.trim() ? current : selected.context);
    const account = accounts.find((item) => item.id === selected.accountId);
    setMeetingKind(inferMeetingKind({
      stage: selected.stage,
      hasConversation: Boolean(account?.conversationCount),
    }));
    setAudience(selected.primaryContact);
    loadAudienceContacts(selected.accountId, selected.primaryContact);
    setGoalThisHour('');
  }

  function prepareFromAccount(seed: CopilotPreparationSeed) {
    audienceRequestRef.current += 1;
    clearPlan();
    setAccountId(seed.accountId);
    setCompany(seed.company);
    setSite(seed.site);
    setSocialProfiles(seed.socialProfiles);
    adotarRedesDoSeed(seed.site, seed.socialProfiles);
    setContext(seed.context);
    setOffer(seed.offer || DEFAULT_VERTHO_OFFER);
    setOpportunityId(seed.opportunityId);
    setMeetingKind(seed.meetingKind);
    setAudience(seed.audience);
    setAudienceOptions(seed.audienceOptions);
    setGoalThisHour(seed.goalThisHour);
    setTab('planejamento');
  }

  function openSavedPlan(seed: CopilotOpenPlanSeed) {
    audienceRequestRef.current += 1;
    const savedCompany = seed.planning.inputs.company || seed.company;
    const savedContext = seed.planning.inputs.context || seed.context;
    setAccountId(seed.accountId);
    setCompany(savedCompany);
    setSite(seed.site);
    setSocialProfiles(seed.socialProfiles);
    adotarRedesDoSeed(seed.site, seed.socialProfiles);
    setContext(savedContext);
    setOffer(seed.offer || DEFAULT_VERTHO_OFFER);
    setOpportunityId(seed.opportunityId);
    setMeetingKind(seed.planning.inputs.meetingKind || seed.planning.plan.play?.kind || seed.meetingKind);
    setAudience(seed.planning.inputs.audience || seed.planning.plan.play?.audience || seed.audience);
    setAudienceOptions(seed.audienceOptions);
    setGoalThisHour(seed.planning.inputs.goalThisHour || seed.planning.plan.play?.goalThisHour || seed.goalThisHour);
    setPlan(seed.planning.plan);
    setReading(EMPTY_READING);
    setPlanPersisted(true);
    setActivePlanningId(seed.planning.conversationId ? '' : seed.planning.id);
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({
        plan: seed.planning.plan,
        company: savedCompany,
        site: seed.site,
        socialProfiles: seed.socialProfiles,
        context: savedContext,
        offer: seed.offer || DEFAULT_VERTHO_OFFER,
        opportunityId: seed.opportunityId,
        accountId: seed.accountId,
        planningId: seed.planning.conversationId ? '' : seed.planning.id,
        persisted: true,
        meetingKind: seed.planning.inputs.meetingKind || seed.planning.plan.play?.kind || seed.meetingKind,
        audience: seed.planning.inputs.audience || seed.planning.plan.play?.audience || seed.audience,
        audienceOptions: seed.audienceOptions,
        goalThisHour: seed.planning.inputs.goalThisHour || seed.planning.plan.play?.goalThisHour || seed.goalThisHour,
      }));
    } catch { /* storage bloqueado */ }
    setTab('planejamento');
  }

  function toggleAudienceOption(option: string) {
    const current = audience.split(';').map((item) => item.trim()).filter(Boolean);
    const selected = current.some((item) => item.toLocaleLowerCase('pt-BR') === option.toLocaleLowerCase('pt-BR'));
    setAudience((selected ? current.filter((item) => item.toLocaleLowerCase('pt-BR') !== option.toLocaleLowerCase('pt-BR')) : [...current, option]).join('; '));
  }

  async function pasteTranscript() {
    setError(null);

    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard-unavailable');

      const transcript = (await navigator.clipboard.readText()).trim();
      if (!transcript) {
        setError('A área de transferência está vazia. Copie a transcrição e tente novamente.');
        return;
      }

      const currentContext = context.trimEnd();
      const separator = currentContext ? '\n\n' : '';
      const combinedContext = `${currentContext}${separator}${transcript}`;

      setContext(combinedContext.slice(0, 30000));
      if (combinedContext.length > 30000) {
        setError('A transcrição foi colada até o limite de 30.000 caracteres do campo.');
      }
    } catch {
      setError('O navegador não permitiu ler a área de transferência. Clique no campo e use Ctrl+V.');
    }
  }

  async function activateLocalAsr() {
    if (localAsrState === 'starting') return;
    setError(null);
    setLocalAsrReadyNotice(false);
    setLocalAsrState('starting');
    asrActivationRef.current?.abort();
    const controller = new AbortController();
    asrActivationRef.current = controller;

    if (!requestLocalAsrStart()) {
      setLocalAsrState('error');
      setError('O navegador não conseguiu acionar o Whisper local nesta máquina.');
      return;
    }

    const ready = await waitForLocalAsr(ASR_URL, {
      timeoutMs: 90_000,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    asrActivationRef.current = null;

    if (!ready) {
      setLocalAsrState('error');
      setError('O iniciador local não respondeu. Permita abrir “Vertho Whisper Local” no aviso do navegador e tente novamente.');
      return;
    }

    markLocalAsrReady(true);
    window.setTimeout(() => startCaptureButtonRef.current?.focus(), 0);
  }

  async function startCapture() {
    if (localAsrState !== 'ready') {
      await activateLocalAsr();
      return;
    }

    setError(null);
    if (asrFreshnessTimerRef.current) window.clearTimeout(asrFreshnessTimerRef.current);
    setLocalAsrReadyNotice(false);
    setLiveAnalysisState('idle');
    setResultSaved(false);
    pendingAnalysisRef.current = false;
    audioEvidenceRef.current = { ...EMPTY_AUDIO_EVIDENCE };
    captureStartedAtRef.current = Date.now();
    setAudioHealth('checking');
    setCaptureSurface('unknown');
    const capture = new LocalMeetingCapture({
      url: ASR_URL,
      onSegment,
      onPartial,
      onLevels: onAudioLevels,
      onSurface: setCaptureSurface,
      onState: setCaptureState,
      onError: setError,
    });
    captureRef.current = capture;
    try {
      await capture.start();
    } catch (captureError: any) {
      captureRef.current = null;
      if (captureError?.message === 'ASR_UNAVAILABLE' || captureError?.message === 'ASR_TIMEOUT') {
        setLocalAsrState('offline');
      }
    }
  }

  function stopCapture() {
    captureRef.current?.stop();
    captureRef.current = null;
    setPartial(null);
  }

  async function restartCapture() {
    stopCapture();
    await startCapture();
  }

  async function saveLiveResult() {
    if (!accountId) {
      setError('Abra a reunião a partir de uma empresa para salvar o resultado no histórico.');
      return;
    }
    const transcript = utterancesRef.current.map((item) => {
      const speaker = item.channel === 'vendedor'
        ? 'Vertho local'
        : meetingCompositionRef.current === 'solo-vertho' ? 'Cliente(s)' : 'Reunião';
      return `${speaker}: ${item.text}`;
    }).join('\n');
    if (transcript.trim().length < 20) {
      setError('Ainda não há transcrição suficiente para salvar o resultado.');
      return;
    }
    setResultSaving(true);
    setError(null);
    try {
      const res = await fetchAuth(`/api/copiloto/clientes/${encodeURIComponent(accountId)}/conversas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: company ? `Reunião com ${company}` : '',
          happenedAt: new Date().toISOString(),
          opportunityId,
          planningId: activePlanningId,
          source: 'whisper_local',
          transcript,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Falha ao salvar o resultado');
      setResultSaved(true);
      setActivePlanningId('');
      try {
        const saved = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}');
        localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ ...saved, planningId: '' }));
      } catch { /* storage bloqueado */ }
    } catch (saveError: any) {
      setError(saveError?.message || 'Não foi possível salvar o resultado da reunião.');
    } finally {
      setResultSaving(false);
    }
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
    setReading(EMPTY_READING);
    setActivePlanningId('');
    setPlanPersisted(false);
  }

  const recording = captureState === 'gravando';
  const firstName = userName.split(' ')[0] || userName;
  const audioIssue = audioHealth === 'microphone-only'
    ? {
        title: 'Estou ouvindo apenas você.',
        detail: captureSurface === 'browser'
          ? 'O som da aba compartilhada não chegou. Confirme que escolheu a aba da reunião e ativou “Compartilhar áudio da guia”.'
          : 'O áudio dos participantes não chegou. Recompartilhe e prefira a aba da reunião com “Compartilhar áudio da guia” ativado.',
      }
    : audioHealth === 'system-only'
      ? {
          title: 'Estou ouvindo a reunião, mas não o seu microfone.',
          detail: 'Confira o microfone selecionado e a permissão do navegador antes de continuar.',
        }
      : audioHealth === 'silent'
        ? {
            title: 'Ainda não detectei fala em nenhum canal.',
            detail: 'Confira se a reunião está reproduzindo áudio e se o microfone correto foi autorizado.',
          }
        : null;
  const audioStatus = !recording
    ? 'parado'
    : audioHealth === 'ready'
      ? '2 fontes ativas'
      : audioHealth === 'checking'
        ? 'verificando canais'
        : audioHealth === 'microphone-only'
          ? 'somente você'
          : audioHealth === 'system-only'
            ? 'somente reunião'
            : 'sem áudio';
  const localAsrCopy = localAsrState === 'ready'
    ? {
        title: localAsrReadyNotice ? 'Whisper pronto — falta compartilhar o áudio' : 'Whisper pronto nesta máquina',
        detail: localAsrReadyNotice
          ? 'Clique novamente em “Compartilhar áudio e iniciar” para escolher a aba da reunião.'
          : 'Ao iniciar, escolha a aba da reunião e ative “Compartilhar áudio da guia”.',
      }
    : localAsrState === 'starting'
      ? {
          title: 'Iniciando Whisper local…',
          detail: 'O modelo está carregando na GPU. Se o navegador perguntar, permita abrir “Vertho Whisper Local”.',
        }
      : localAsrState === 'error'
        ? {
            title: 'O iniciador local não respondeu',
            detail: 'Clique em “Iniciar conversa” para tentar novamente e confirme a abertura no navegador.',
          }
        : localAsrState === 'checking'
          ? {
              title: 'Verificando o Whisper local…',
              detail: 'Isso leva apenas alguns segundos e não envia áudio para a internet.',
            }
          : {
              title: 'Whisper desligado — será iniciado sob demanda',
              detail: 'Clique em “Iniciar conversa”. O modelo liga somente para a reunião e desliga após ficar ocioso.',
            };

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
        <button onClick={() => setTab('clientes')} className={tab === 'clientes' ? styles.tabActive : ''}><UsersRound size={16} /><span>Reuniões<small>planejamento e resultado</small></span></button>
        <button onClick={() => setTab('planejamento')} className={tab === 'planejamento' ? styles.tabActive : ''}><Search size={16} /><span>Planejamento<small>antes da conversa</small></span></button>
        <button onClick={() => setTab('ao-vivo')} className={tab === 'ao-vivo' ? styles.tabActive : ''}><Headphones size={16} /><span>Apoio ao vivo<small>Whisper local</small></span></button>
        <button onClick={() => setTab('pos-reuniao')} className={tab === 'pos-reuniao' ? styles.tabActive : ''}><FileText size={16} /><span>Pós-reunião<small>Supernormal</small></span></button>
      </nav>

      <PaceRunway tab={tab} livePhase={reading.phase} />

      {error && <div className={styles.error}><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}

      {tab === 'clientes' && (
        <ClientsWorkspace initialAccounts={accounts} canCreateLeads={canCreateLeads} onPrepare={prepareFromAccount} onOpenPlan={openSavedPlan} />
      )}

      {tab === 'planejamento' && (
        <div className={styles.workspace}>
          <form className={styles.setupPanel} onSubmit={generatePlan}>
            <header><span>01 · INPUT</span><h2>Prepare esta hora</h2><p>Defina o tipo, quem estará na conversa e o avanço desejado. A pesquisa sustenta o Play — não substitui a condução.</p></header>

            {!!opportunities.length && (
              <label>Oportunidade no CRM
                <select value={opportunityId} onChange={(event) => selectOpportunity(event.target.value)}>
                  <option value="">Preparação avulsa</option>
                  {opportunities.map((item) => <option key={item.id} value={item.id}>{item.accountName} · {item.name}</option>)}
                </select>
              </label>
            )}

            <fieldset className={styles.playSetup}>
              <legend><Target size={14} /><span>Play desta hora</span><small>30 segundos</small></legend>
              <div className={styles.playSetupGrid}>
                <label>Tipo da reunião
                  <select value={meetingKind} onChange={(event) => setMeetingKind(event.target.value as MeetingKind)}>
                    {MEETING_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                </label>
                <label>Quem vai estar
                  <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Ex.: Maria Souza, Head de T&D" maxLength={1000} />
                </label>
              </div>
              {!!audienceOptions.length && (
                <div className={styles.audienceChips} aria-label="Contatos desta empresa">
                  {audienceOptions.map((option) => {
                    const selected = audience.split(';').some((item) => item.trim().toLocaleLowerCase('pt-BR') === option.toLocaleLowerCase('pt-BR'));
                    return <button key={option} type="button" aria-pressed={selected} onClick={() => toggleAudienceOption(option)}>{selected && <Check size={11} />}{option}</button>;
                  })}
                </div>
              )}
              <label className={styles.hourGoal}>O que precisa sair desta hora <em>opcional</em>
                <textarea value={goalThisHour} onChange={(event) => setGoalThisHour(event.target.value)} rows={2} maxLength={1200} placeholder="Ex.: sair com uma demo de 25 min marcada até sexta. Se vazio, o Copiloto infere pelo estágio e pelo playbook." />
              </label>
            </fieldset>

            <div className={styles.twoFields}>
              <label>Empresa<input value={company} onChange={(event) => changeCompany(event.target.value)} placeholder="Ex.: Grupo Sinal" maxLength={200} /></label>
              <label>Site público<input value={site} onChange={(event) => setSite(event.target.value)} placeholder="empresa.com.br" inputMode="url" maxLength={320} /></label>
            </div>

            <div className={styles.identityField}>
              <div className={styles.identityFieldHeader}>
                <label htmlFor="copilot-social">Redes sociais oficiais</label>
                <button
                  type="button"
                  onClick={() => void descobrirRedes(site)}
                  disabled={!site.trim() || socialDiscovery.status === 'buscando'}
                >
                  {socialDiscovery.status === 'buscando'
                    ? <><LoaderCircle size={13} className={styles.spin} /> Lendo o site</>
                    : <><Search size={13} /> Buscar no site</>}
                </button>
              </div>
              <textarea
                id="copilot-social"
                value={socialProfiles}
                onChange={(event) => setSocialProfiles(event.target.value)}
                rows={3}
                maxLength={3000}
                placeholder={'https://linkedin.com/company/empresa\nhttps://instagram.com/empresa\nhttps://x.com/empresa'}
              />
              <small><ShieldCheck size={12} /> Ao informar o site, os perfis linkados nele entram aqui sozinhos. Sinais de outros perfis serão descartados; ao trocar de cliente, o campo é limpo.</small>
              {socialDiscovery.status !== 'idle' && (
                <small data-status={socialDiscovery.status} className={styles.socialDiscoveryNote}>
                  {socialDiscovery.status === 'buscando' && <>Procurando os perfis oficiais no site…</>}
                  {socialDiscovery.status === 'ok' && (socialDiscovery.adicionados
                    ? <>{socialDiscovery.adicionados} {socialDiscovery.adicionados === 1 ? 'perfil veio' : 'perfis vieram'} de {socialDiscovery.host}. Confira antes de gerar o Play.</>
                    : <>Os {socialDiscovery.encontrados === 1 ? 'perfil' : `${socialDiscovery.encontrados} perfis`} de {socialDiscovery.host} já estavam no campo.</>)}
                  {socialDiscovery.status === 'vazio' && <>{socialDiscovery.host} não publica perfis oficiais nas páginas lidas. Cole os links à mão.</>}
                  {socialDiscovery.status === 'erro' && <>{socialDiscovery.mensagem}. Cole os links à mão ou tente de novo.</>}
                </small>
              )}
            </div>

            <div className={styles.contextField}>
              <div className={styles.contextFieldHeader}>
                <label htmlFor="copilot-context">O que você já sabe deste cliente</label>
                <button type="button" onClick={() => void pasteTranscript()}>
                  <ClipboardPaste size={13} /> Colar transcrição
                </button>
              </div>
              <textarea id="copilot-context" value={context} onChange={(event) => setContext(event.target.value)} rows={8} maxLength={30000} placeholder="Cole anotações ou a transcrição de uma conversa anterior…" />
              <small><ShieldCheck size={12} /> Não entra na busca pública.</small>
            </div>

            <label>O que você vende
              <textarea value={offer} onChange={(event) => setOffer(event.target.value)} rows={5} maxLength={12000} />
              <small><Sparkles size={12} /> Pré-preenchido com os serviços Vertho; ajuste para esta conversa.</small>
            </label>

            <div className={styles.formActions}>
              <button type="submit" disabled={planning || (!company.trim() && !site.trim() && !socialProfiles.trim() && context.trim().length < 20)}>
                {planning ? <><LoaderCircle size={17} className={styles.spin} /> Preparando o Play · {planningSeconds}s</> : <><Target size={17} /> Montar Play da reunião</>}
              </button>
              {plan && <button type="button" className={styles.secondaryButton} onClick={clearPlan}>Limpar</button>}
            </div>
            {planning && <p className={styles.waitCopy}>A IA está pesquisando em três trilhas separadas: site oficial, imprensa externa e redes oficiais. Isso pode levar alguns minutos.</p>}
          </form>

          <aside className={styles.researchPanel}>
            <header><span>02 · OUTPUT</span><h2>Play + evidências</h2><p>Primeiro, o roteiro desta hora. Depois, a pesquisa que sustenta cada movimento.</p></header>
            {plan ? (
              <div className={styles.miniMap}>
                <div><b>{plan.facts.length}</b><span>fatos públicos</span></div>
                <div><b>{plan.hypotheses.length}</b><span>hipóteses</span></div>
                <div><b>{plan.play?.mustAsk.length || plan.questions.length}</b><span>{plan.play ? 'perguntas do Play' : 'perguntas'}</span></div>
                <div><b>{plan.sources.length}</b><span>fontes</span></div>
              </div>
            ) : (
              <div className={styles.emptyResearch}>
                <Building2 size={28} />
                <h3>O Play aparece aqui</h3>
                <p>O Copiloto cruza o momento da conta, o playbook do segmento e sinais públicos para preparar esta conversa.</p>
                <ul><li><Check size={13} /> Objetivo concreto da hora</li><li><Check size={13} /> Três perguntas com verde/vermelho</li><li><Check size={13} /> Evidências e fontes como apêndice</li></ul>
              </div>
            )}
            <div className={styles.privacyNote}><ShieldCheck size={17} /><p><strong>Fronteira de privacidade</strong>A busca recebe apenas nome, site e perfis sociais oficiais. Briefing e oferta entram somente na análise privada.</p></div>
          </aside>

          {plan && <div className={styles.fullRow}><PlanDossier plan={plan} onGoLive={() => setTab('ao-vivo')} persisted={planPersisted} /></div>}
        </div>
      )}

      {tab === 'ao-vivo' && (
        <section className={styles.liveWorkspace}>
          <header className={styles.liveHeader}>
            <div><p className={styles.eyebrow}>Sala de comando</p><h2>{recording ? 'Conversa em andamento' : 'Apoio ao vivo com Whisper local'}</h2><p>O áudio é transcrito na sua máquina. Somente trechos de texto seguem para a IA montar as sugestões.</p></div>
            <div className={styles.liveHeaderActions}>
              {!recording && utterances.length > 0 && accountId && <button className={styles.saveResultButton} onClick={() => void saveLiveResult()} disabled={resultSaving || resultSaved}>{resultSaving ? <><LoaderCircle size={16} className={styles.spin} /> Salvando…</> : resultSaved ? <><Check size={16} /> Resultado salvo</> : <><Save size={16} /> Salvar resultado</>}</button>}
              <button ref={startCaptureButtonRef} className={recording ? styles.stopButton : styles.startButton} onClick={recording ? stopCapture : startCapture} disabled={captureState === 'conectando' || localAsrState === 'starting'}>
                {recording
                  ? <><Square size={16} fill="currentColor" /> Parar conversa</>
                  : localAsrState === 'starting'
                    ? <><LoaderCircle size={17} className={styles.spin} /> Iniciando Whisper…</>
                    : captureState === 'conectando'
                      ? <><LoaderCircle size={17} className={styles.spin} /> Conectando…</>
                      : localAsrReadyNotice
                        ? <><Mic size={17} /> Compartilhar áudio e iniciar</>
                        : <><Mic size={17} /> Iniciar conversa</>}
              </button>
            </div>
          </header>

          {!recording && (
            <div className={styles.captureGuide} data-asr-state={localAsrState} role="status" aria-live="polite">
              {localAsrState === 'starting' || localAsrState === 'checking'
                ? <LoaderCircle size={18} className={styles.spin} />
                : localAsrState === 'ready'
                  ? <Wifi size={18} />
                  : <WifiOff size={18} />}
              <div><strong>{localAsrCopy.title}</strong><span>{localAsrCopy.detail}</span></div>
              <label className={styles.meetingMode} htmlFor="copilot-meeting-composition">
                <span>Quem está pela Vertho?</span>
                <select id="copilot-meeting-composition" value={meetingComposition} onChange={(event) => setMeetingComposition(event.target.value as MeetingComposition)}>
                  <option value="solo-vertho">Somente eu</option>
                  <option value="mixed-remote">Também há colegas remotos</option>
                </select>
              </label>
            </div>
          )}

          {recording && audioIssue && (
            <div className={styles.audioWarning} role="alert">
              <CircleAlert size={19} />
              <div><strong>{audioIssue.title}</strong><span>{audioIssue.detail}</span></div>
              <button type="button" onClick={() => void restartCapture()}>Recompartilhar áudio</button>
            </div>
          )}

          {!plan && <div className={styles.liveHint}><CircleAlert size={17} /><span>Você pode iniciar sem plano, mas o apoio melhora quando já conhece o objetivo e as três perguntas desta hora.</span><button onClick={() => setTab('planejamento')}>Planejar primeiro</button></div>}

          {plan?.play && <LivePlayStrip play={plan.play} reading={reading} />}

          <div className={styles.liveGrid}>
            <section className={styles.nextMove}>
              <div className={styles.liveLabel}>
                <Radio size={15} /> Próxima melhor intervenção
                {thinking
                  ? <span><LoaderCircle size={13} className={styles.spin} /> analisando</span>
                  : liveAnalysisState === 'active'
                    ? <span className={styles.connected}><Check size={13} /> IA ativa</span>
                    : liveAnalysisState === 'fallback'
                      ? <span className={styles.degraded}><CircleAlert size={13} /> banco local</span>
                      : liveAnalysisState === 'error'
                        ? <span className={styles.failed}><WifiOff size={13} /> análise falhou</span>
                        : null}
              </div>
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
              <div className={styles.liveLabel}><AudioLines size={15} /> Transcrição local <span className={recording ? (audioHealth === 'ready' ? styles.connected : audioHealth === 'checking' ? styles.degraded : styles.failed) : ''}>{recording ? (audioHealth === 'checking' ? <LoaderCircle size={13} className={styles.spin} /> : audioHealth === 'ready' ? <Wifi size={13} /> : <CircleAlert size={13} />) : <WifiOff size={13} />}{audioStatus}</span></div>
              <div className={styles.transcript}>
                {!utterances.length && !partial && <p className={styles.transcriptEmpty}>A transcrição não é salva no servidor do Copiloto.</p>}
                {utterances.slice(-40).map((item, index) => <p key={`${item.at}-${index}`} data-channel={item.channel}><span title={item.channel === 'cliente' ? 'Áudio compartilhado da reunião' : 'Microfone deste computador'}>{item.channel === 'cliente' ? (meetingComposition === 'solo-vertho' ? 'Cliente(s)' : 'Reunião') : 'Vertho local'}</span>{item.text}</p>)}
                {partial && <p data-channel={partial.channel} className={styles.partial}><span title={partial.channel === 'cliente' ? 'Áudio compartilhado da reunião' : 'Microfone deste computador'}>{partial.channel === 'cliente' ? (meetingComposition === 'solo-vertho' ? 'Cliente(s)' : 'Reunião') : 'Vertho local'}</span>{partial.text}</p>}
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
