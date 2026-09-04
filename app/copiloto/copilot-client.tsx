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
  CONVERSATION_GOALS, DEFAULT_VERTHO_OFFER, DISCOVERY_CHECKLIST, MEETING_KINDS, PACE_PHASES,
  type AccountSnapshot, type ConversationGoal, type CopilotAccountListItem, type CopilotOpportunity,
  type CopilotPlan, type CopilotPlay, type CopilotSource, type CopilotSourceKind, type LiveReading,
  type MeetingPerson,
  type AccountMoment, type EvidenceConfidence,
  type LiveUtterance, type MeetingKind, type PacePhase, type SupernormalPost,
  type SupernormalPostDetail,
} from '@/lib/copiloto/types';
import { normalizeConversationGoal } from '@/lib/copiloto/dossier';
import { inferMeetingKind } from '@/lib/copiloto/play';
import { chaveDaConta, mesclarPerfisSociais, precisaPedirRedes } from '@/lib/copiloto/social-discovery';
import {
  linhasDeParticipantes, serializarAudience, serializarNotas, serializarPerfis,
  type LinhaParticipante,
} from '@/lib/copiloto/participantes';
// A MESMA régua que o servidor aplica: o que ela não reconhece é recusado lá com 400.
import { parseOfficialSocialUrls } from '@/lib/copiloto/social-identity';
import {
  LocalMeetingCapture, toUtterance,
  type CaptureAudioLevels, type CaptureState, type CaptureSurface,
} from './audio-capture';
import {
  probeLocalAsr,
  readLocalAsrFailure,
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

/**
 * `vazio` tem dois motivos, e a diferença muda o que dizer ao vendedor.
 *
 * `nada_encontrado` = o site foi lido e não publica perfil nenhum.
 * `sem_resposta` = o site NÃO foi lido: bloqueio anti-bot, 403 ou timeout.
 * Medido em 02/09 com boehringer-ingelheim.com/br, que devolve 1.150 caracteres
 * de página de desafio (`NOINDEX, NOFOLLOW`) para qualquer User-Agent. Tratar os
 * dois como o mesmo caso fazia a tela afirmar que a empresa não publica perfis
 * quando ela publica — e ninguém colava nada à mão.
 */
type SocialDiscoveryState =
  | { status: 'idle' }
  | { status: 'buscando' }
  | { status: 'ok'; encontrados: number; adicionados: number; host: string }
  | { status: 'vazio'; host: string; motivo: 'nada_encontrado' | 'sem_resposta' }
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


const CONFIDENCE_LABELS: Record<EvidenceConfidence, string> = {
  confirmado: 'confirmado',
  inferencia: 'inferência',
  nao_confirmado: 'a confirmar',
};

const MOMENT_LABELS: Record<AccountMoment, string> = {
  expansao: 'em expansão',
  pos_aquisicao: 'pós-aquisição',
  pressao_de_custo: 'sob pressão de custo',
  troca_de_lideranca: 'trocando liderança',
  transformacao: 'em transformação',
  crise: 'em crise',
  indefinido: 'momento não identificado',
};

/**
 * Porte e momento: o que decide ticket, formato e quem assina.
 *
 * Cada linha mostra o proprio rotulo de procedencia porque o que esta "a confirmar" nao
 * vira frase de abertura, vira pergunta.
 */
function SnapshotCard({ snapshot }: { snapshot: AccountSnapshot }) {
  return (
    <section className={styles.snapshot} aria-label="Retrato da conta">
      <div className={styles.snapshotTop}>
        <span><Building2 size={13} /> Retrato da conta</span>
        <strong data-moment={snapshot.moment}>{MOMENT_LABELS[snapshot.moment]}</strong>
        <em data-confidence={snapshot.confidence}>{CONFIDENCE_LABELS[snapshot.confidence]}</em>
      </div>
      <dl className={styles.snapshotGrid}>
        <div><dt>Porte</dt><dd>{snapshot.size}</dd></div>
        <div><dt>Estrutura</dt><dd>{snapshot.structure}</dd></div>
        {snapshot.criticalEvent && <div><dt>Por que agora</dt><dd>{snapshot.criticalEvent}</dd></div>}
        {snapshot.momentBasis && <div><dt>Base da leitura</dt><dd>{snapshot.momentBasis}</dd></div>}
      </dl>
      {snapshot.paceAdaptation && <p className={styles.snapshotAdaptation}>{snapshot.paceAdaptation}</p>}
      {snapshot.sourceUrl && (
        <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">Ver fonte <ExternalLink size={12} /></a>
      )}
    </section>
  );
}

/**
 * Quem responde por pessoas na organização.
 *
 * Cada linha carrega a fonte e o selo de procedência porque isto é afirmação
 * sobre PESSOA: sem link, não vira frase de abertura. O aviso de "não dá para
 * revalidar" aparece na fonte de rede social, que o buscador leu pelo índice e
 * que a plataforma não consegue reabrir.
 */
function PeopleCard({ people }: { people: MeetingPerson[] }) {
  return (
    <section className={styles.peopleCard} aria-label="Quem responde por pessoas na organização">
      <div className={styles.peopleTop}>
        <span><UsersRound size={14} /> Quem responde por pessoas</span>
        <em>fonte pública · confira antes de citar</em>
      </div>
      <div className={styles.peopleGrid}>
        {people.map((person, index) => (
          <article key={`${person.name}-${index}`}>
            <header>
              <h4>{person.name}</h4>
              <span data-confidence={person.confidence}>{CONFIDENCE_LABELS[person.confidence]}</span>
            </header>
            <p className={styles.peopleRole}>{person.role || 'cargo não confirmado'}</p>
            {person.topics?.length ? (
              <ul className={styles.peopleTopics}>
                {person.topics.map((tema, posicao) => (
                  <li key={`${tema.topic}-${posicao}`}>
                    <span>{tema.topic}</span>
                    {tema.sourceUrl && (
                      <a href={tema.sourceUrl} target="_blank" rel="noreferrer">
                        onde disse{tema.publishedAt ? ` · ${tema.publishedAt}` : ''} <ExternalLink size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : person.publicStance
              ? <p className={styles.peopleStance}>{person.publicStance}</p>
              : person.sourceUrl
                ? <p className={styles.peopleStance}>Apenas o cargo foi confirmado.</p>
                : <p className={styles.peopleNothing}>Nada público encontrado. Abra pela empresa, não por ela.</p>}
            {person.sourceUrl && (
              <a href={person.sourceUrl} target="_blank" rel="noreferrer">
                Ver fonte <ExternalLink size={12} />
              </a>
            )}
            {!person.verifiable && <small><ShieldAlert size={11} /> Perfil de rede: só abre no navegador, não dá para revalidar aqui.</small>}
          </article>
        ))}
      </div>
    </section>
  );
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
          {play.fallbackGoal && <em>Se travar: {play.fallbackGoal}</em>}
        </div>
      </header>

      {play.anchorQuestion && (
        <div className={styles.playAnchor}>
          <span><MessageSquareQuote size={13} /> Precisa sair respondida</span>
          <strong>{play.anchorQuestion}</strong>
          <small>A resposta dele, nas palavras dele, alimenta o follow-up e o próximo planejamento.</small>
        </div>
      )}

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
      {play.anchorQuestion && (
        <div className={styles.livePlayAnchor}>
          <span>Precisa sair respondida</span>
          <strong>{play.anchorQuestion}</strong>
        </div>
      )}
      {reading.phase === 'engajar' && (
        <div className={styles.livePlayClose}>
          <span>Feche pedindo</span>
          <strong>{play.closeWith}</strong>
        </div>
      )}
    </aside>
  );
}

function LiveFocusCompass({ play, reading }: { play: CopilotPlay; reading: LiveReading }) {
  const discoveryProgress = Math.round((reading.covered.length / DISCOVERY_CHECKLIST.length) * 100);

  return (
    <aside className={styles.liveFocusCompass} aria-label="Direção da conversa">
      <div className={styles.liveFocusGoal}>
        <span><Target size={13} /> {reading.phase === 'engajar' ? 'Compromisso a pedir' : 'Objetivo desta hora'}</span>
        {/* `title` porque em coluna estreita o texto pode passar de tres linhas. */}
        <strong title={reading.phase === 'engajar' ? play.closeWith : play.goalThisHour}>
          {reading.phase === 'engajar' ? play.closeWith : play.goalThisHour}
        </strong>
      </div>
      <div className={styles.liveFocusProgress}>
        <span>{reading.covered.length}/{DISCOVERY_CHECKLIST.length} sinais</span>
        <div className={styles.liveFocusProgressTrack} aria-hidden="true"><i style={{ width: `${discoveryProgress}%` }} /></div>
        <ol aria-label="Perguntas essenciais do Play">
          {play.mustAsk.slice(0, 3).map((question, index) => {
            const covered = Boolean(question.discovery && reading.covered.includes(question.discovery));
            return <li key={`${question.text}-${index}`} className={covered ? styles.liveFocusCovered : ''} title={question.text}>{covered ? <Check size={11} /> : index + 1}</li>;
          })}
        </ol>
      </div>
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

      {plan.snapshot && <SnapshotCard snapshot={plan.snapshot} />}

      {!!plan.people?.length && <PeopleCard people={plan.people} />}

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
            <small>{plan.hooks?.length ? 'fato → implicação → pergunta' : 'Fato público ≠ hipótese'}</small>
          </div>
          {plan.hooks?.length ? (
            <div className={styles.hookRail}>
              {plan.hooks.map((hook, index) => {
                const fact = plan.facts[hook.factIndex];
                if (!fact) return null;
                return (
                  <article key={`${hook.askToTest}-${index}`} className={styles.hook}>
                    <b>F{hook.factIndex + 1}</b>
                    <div>
                      <div className={styles.evidenceTop}><h4>{fact.title}</h4>{fact.publishedAt && <time>{fact.publishedAt}</time>}</div>
                      <p>{fact.fact}</p>
                      <dl>
                        <dt>Implicação</dt><dd>{hook.implication}</dd>
                        {hook.hypothesis && <><dt>Hipótese</dt><dd>{hook.hypothesis}</dd></>}
                        <dt>Pergunte</dt><dd className={styles.hookAsk}>{hook.askToTest}</dd>
                        {hook.bridgeIfConfirmed && <><dt className={styles.hookBridge}>Só se confirmar</dt><dd>{hook.bridgeIfConfirmed}</dd></>}
                      </dl>
                      {fact.sourceUrl && <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Ver evidência <ExternalLink size={12} /></a>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : plan.facts.length ? (
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
          <div className={styles.blockTitle}><div><span>03</span><h3>{plan.valueMath?.length ? 'Aritmética do valor' : 'ROI para dimensionar'}</h3></div></div>
          {plan.valueMath?.length ? (
            <div className={styles.valueMath}>
              {plan.valueMath.map((formula, index) => (
                <article key={`${formula.name}-${index}`}>
                  <h4>{formula.name}</h4>
                  <code>{formula.formula}</code>
                  {!!formula.known.length && (
                    <ul className={styles.mathKnown}>
                      {formula.known.map((item, position) => (
                        <li key={`${item.variable}-${position}`}>
                          <span>{item.variable}</span><strong>{item.value}</strong>
                          <em data-confidence={item.confidence}>{CONFIDENCE_LABELS[item.confidence]}</em>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ul className={styles.mathOpen}>
                    {formula.open.map((item, position) => (
                      <li key={`${item.variable}-${position}`}>
                        <span>falta {item.variable}</span>
                        <strong>{item.ask}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
              <p className={styles.mathNote}>O total é do cliente. O copiloto não estima nenhum número aqui.</p>
            </div>
          ) : (
            <ul className={styles.plainList}>
              {plan.roiMetrics.map((item, index) => <li key={`${item.metric}-${index}`}><strong>{item.metric}</strong><span>{item.howToMeasure}</span></li>)}
              {!plan.roiMetrics.length && <li><span>Valide volume, frequência, tempo perdido e efeito sobre resultado durante a conversa.</span></li>}
            </ul>
          )}
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

        <section className={classNames(styles.dossierBlock, plan.objectionRoutes?.length ? styles.wideBlock : '')}>
          <div className={styles.blockTitle}>
            <div><span>05</span><h3>{plan.objectionRoutes?.length ? 'Rotas de objeção' : 'Objeções prováveis'}</h3></div>
            {!!plan.objectionRoutes?.length && <small>explore antes de responder</small>}
          </div>
          {plan.objectionRoutes?.length ? (
            <div className={styles.routeRail}>
              {plan.objectionRoutes.map((route, index) => (
                <article key={`${route.symptom}-${index}`} className={styles.route}>
                  <header>
                    <q>{route.symptom}</q>
                    <span>{route.seat}</span>
                  </header>
                  {route.cause && <p className={styles.routeCause}>Causa provável: {route.cause}</p>}
                  <ol>
                    {route.acknowledge && <li data-step="acolha">{route.acknowledge}</li>}
                    <li data-step="explore">{route.explore}</li>
                    <li data-step="prova" data-missing={route.evidence ? undefined : 'true'}>
                      {route.evidence || 'Não temos prova para esta objeção. Não invente uma na hora.'}
                    </li>
                    {route.alternative && <li data-step="alternativa">{route.alternative}</li>}
                    {route.advance && <li data-step="avance">{route.advance}</li>}
                  </ol>
                </article>
              ))}
            </div>
          ) : (
            <ul className={styles.plainList}>
              {plan.objections.map((item, index) => <li key={`${item.objection}-${index}`}><strong>{item.objection}</strong><span>Pergunte: {item.question}</span></li>)}
            </ul>
          )}
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
  userName, homeHref, opportunities, accounts, canCreateLeads, supernormalStatus,
}: {
  userName: string;
  homeHref: '/admin/dashboard' | '/representante';
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
  const [conversationGoal, setConversationGoal] = useState<ConversationGoal>('entender_momento');
  const [showSetupDetails, setShowSetupDetails] = useState(false);
  /** Conta para a qual o vendedor já decidiu seguir sem a trilha de redes. */
  const [semRedesConfirmadoPara, setSemRedesConfirmadoPara] = useState('');
  const [pedindoRedes, setPedindoRedes] = useState(false);
  /** Trilha opcional: descobre quem responde por pessoas na organização. */
  const [researchPeople, setResearchPeople] = useState(false);
  const [peopleProfiles, setPeopleProfiles] = useState('');
  const [peopleNotes, setPeopleNotes] = useState('');
  /**
   * Quem estará na conversa, com nome, cargo e perfil na MESMA linha.
   *
   * `audience` e `peopleProfiles` continuam existindo porque são o contrato com
   * o servidor e com os planos já salvos: eles são derivados daqui na hora de
   * enviar, nunca editados à mão.
   */
  const [linhasParticipantes, setLinhasParticipantes] = useState<LinhaParticipante[]>([
    { nome: '', cargo: '', perfil: '', notas: '' },
  ]);
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
  const [audioLevels, setAudioLevels] = useState({ system: 0, microphone: 0 });
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
  const ultimoNivelRef = useRef(0);
  const captureStartedAtRef = useRef(0);
  const meetingCompositionRef = useRef<MeetingComposition>('solo-vertho');
  const audienceRequestRef = useRef(0);
  // Site já varrido: sem isso o efeito de descoberta reexecuta a cada render e
  // um seed que já traz redes salvas dispararia uma busca que não muda nada.
  const siteVarridoRef = useRef('');
  const socialRequestRef = useRef(0);
  const socialProfilesRef = useRef('');
  const socialCampoRef = useRef<HTMLTextAreaElement | null>(null);

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
        if (typeof parsed?.audience === 'string' || typeof parsed?.peopleProfiles === 'string') {
          setLinhasParticipantes(linhasDeParticipantes(
            typeof parsed?.audience === 'string' ? parsed.audience : '',
            typeof parsed?.peopleProfiles === 'string' ? parsed.peopleProfiles : '',
            typeof parsed?.peopleNotes === 'string' ? parsed.peopleNotes : '',
          ));
        }
        if (Array.isArray(parsed?.audienceOptions)) {
          setAudienceOptions(parsed.audienceOptions.filter((item: unknown) => typeof item === 'string').slice(0, 20));
        }
        if (typeof parsed?.goalThisHour === 'string') setGoalThisHour(parsed.goalThisHour);
        if (normalizeConversationGoal(parsed?.conversationGoal)) setConversationGoal(parsed.conversationGoal);
        if (typeof parsed?.researchPeople === 'boolean') setResearchPeople(parsed.researchPeople);
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

  // As duas strings que o servidor consome saem SEMPRE da lista: editar uma
  // delas à mão em qualquer outro lugar voltaria a criar as duas verdades.
  useEffect(() => {
    setAudience(serializarAudience(linhasParticipantes));
    setPeopleProfiles(serializarPerfis(linhasParticipantes));
    setPeopleNotes(serializarNotas(linhasParticipantes));
  }, [linhasParticipantes]);

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

    // Medidor ao vivo dos dois canais. O aviso de "só ouço você" leva 10s para
    // aparecer e a reunião já começou: ver o canal do cliente parado no zero é o
    // que permite recompartilhar antes de perder a conversa inteira.
    const agora = Date.now();
    if (agora - ultimoNivelRef.current >= 200) {
      ultimoNivelRef.current = agora;
      setAudioLevels({ system: levels.system, microphone: levels.microphone });
    }
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
        setSocialDiscovery({
          status: 'vazio',
          host,
          motivo: data?.motivo === 'sem_resposta' ? 'sem_resposta' : 'nada_encontrado',
        });
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

  /**
   * O gate das redes roda ANTES da pesquisa, não depois.
   *
   * Sem perfis, uma das três trilhas não acontece, e isso só apareceria no fim,
   * no card "Nenhum perfil informado" — com os 90 segundos e o custo já gastos.
   * Aqui a tela para uma vez por conta e oferece as duas saídas.
   */
  async function generatePlan(event: FormEvent) {
    event.preventDefault();
    if (precisaPedirRedes({ company, site, perfisInformados: socialProfilesInformados, confirmadoPara: semRedesConfirmadoPara })) {
      setPedindoRedes(true);
      return;
    }
    await executarGeracao();
  }

  async function executarGeracao() {
    setPedindoRedes(false);
    setError(null);
    setPlanningSeconds(0);
    setPlanning(true);
    try {
      const res = await fetchAuth('/api/copiloto/planejamento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company, site, socialProfiles, context, offer, opportunityId, accountId,
          meetingKind, audience, goalThisHour, conversationGoal, researchPeople, peopleProfiles, peopleNotes,
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
              inputs: { company, site, socialProfiles, context, offer, meetingKind, audience, goalThisHour, conversationGoal },
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
          meetingKind, audience, audienceOptions, goalThisHour, conversationGoal, researchPeople, peopleProfiles, peopleNotes,
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
        if (primaryLabel) {
          setLinhasParticipantes((atual) => atual.some((linha) => linha.nome.trim()) ? atual : linhasDeParticipantes(primaryLabel, ''));
        }
      } catch {
        // O contato primário vindo da oportunidade continua disponível.
      }
    })();
  }

  /**
   * Abre "Dados usados" e põe o cursor no campo de redes.
   *
   * A leitura do site falha em qualquer empresa atrás de proteção anti-bot, e aí
   * a única saída é colar os perfis. O campo existia, mas dentro do recolhível:
   * quem não o abria não descobria que a trilha social ia ficar de fora.
   */
  function abrirCampoDeRedes() {
    setShowSetupDetails(true);
    window.setTimeout(() => {
      socialCampoRef.current?.focus();
      socialCampoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
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
      setPeopleProfiles('');
      esquecerVarreduraDeRedes();
      setLinhasParticipantes([{ nome: '', cargo: '', perfil: '', notas: '' }]);
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
      setLinhasParticipantes([{ nome: '', cargo: '', perfil: '', notas: '' }]);
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
    setLinhasParticipantes(linhasDeParticipantes(selected.primaryContact, ''));
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
    setLinhasParticipantes(linhasDeParticipantes(seed.audience, ''));
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
    setLinhasParticipantes(linhasDeParticipantes(
      seed.planning.inputs.audience || seed.planning.plan.play?.audience || seed.audience,
      '',
    ));
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

  function editarLinha(indice: number, campo: keyof LinhaParticipante, valor: string) {
    setLinhasParticipantes((atual) => atual.map((linha, i) => i === indice ? { ...linha, [campo]: valor } : linha));
  }

  function adicionarLinha() {
    setLinhasParticipantes((atual) => atual.length >= 8 ? atual : [...atual, { nome: '', cargo: '', perfil: '', notas: '' }]);
  }

  function removerLinha(indice: number) {
    setLinhasParticipantes((atual) => {
      const resto = atual.filter((_, i) => i !== indice);
      return resto.length ? resto : [{ nome: '', cargo: '', perfil: '', notas: '' }];
    });
  }

  /** Chip do CRM: entra na primeira linha vazia, ou cria uma. */
  function adicionarContato(option: string) {
    const virgula = option.indexOf(',');
    const nome = (virgula >= 0 ? option.slice(0, virgula) : option).trim();
    const cargo = virgula >= 0 ? option.slice(virgula + 1).trim() : '';
    setLinhasParticipantes((atual) => {
      if (atual.some((linha) => linha.nome.trim().toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) {
        return atual.filter((linha) => linha.nome.trim().toLocaleLowerCase('pt-BR') !== nome.toLocaleLowerCase('pt-BR'))
          .concat(atual.length === 1 ? [{ nome: '', cargo: '', perfil: '', notas: '' }] : []);
      }
      const vazia = atual.findIndex((linha) => !linha.nome.trim() && !linha.perfil.trim());
      if (vazia >= 0) return atual.map((linha, i) => i === vazia ? { nome, cargo, perfil: '', notas: '' } : linha);
      return atual.length >= 8 ? atual : [...atual, { nome, cargo, perfil: '', notas: '' }];
    });
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

    const requested = await requestLocalAsrStart({
      timeoutMs: 7_000,
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      asrActivationRef.current = null;
      return;
    }
    if (requested !== 'started') {
      asrActivationRef.current = null;
      setLocalAsrState('error');
      setError(requested === 'extension_missing'
        ? 'O complemento “Vertho Whisper Local” não está ativo no Chrome. Abra chrome://extensions e carregue a pasta indicada pelo instalador.'
        : 'O Chrome encontrou o complemento, mas não conseguiu iniciar o Whisper local. Execute novamente o instalador e tente de novo.');
      return;
    }

    const ready = await waitForLocalAsr(ASR_URL, {
      timeoutMs: 90_000,
      signal: controller.signal,
    });
    asrActivationRef.current = null;
    if (controller.signal.aborted) return;

    if (!ready) {
      setLocalAsrState('error');
      // Antes de culpar a rede, pergunte ao host por que o servidor não subiu: em
      // 04/09 a resposta estava no log ("Permission denied" no disco virtual do
      // antivírus) enquanto a tela mandava liberar acesso à rede local.
      const motivo = await readLocalAsrFailure();
      setError(motivo
        ? `O Whisper local iniciou e parou antes de ficar pronto. O que ele registrou: “${motivo}”. `
          + 'Se falar em permissão negada, um antivírus está bloqueando: libere a pasta '
          + 'AppData\\Local\\Vertho\\Whisper nas exceções dele.'
        : 'O host iniciou, mas o Chrome não alcançou o Whisper. Nas permissões de app.vertho.ai, '
          + 'libere “Acesso à rede local”; se já estiver permitido, reinstale o Whisper local.');
      return;
    }

    markLocalAsrReady(true);
    window.setTimeout(() => startCaptureButtonRef.current?.focus(), 0);
  }

  async function startCapture() {
    if (localAsrState !== 'ready') {
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

  /** Quantos perfis o servidor vai aceitar do que está no campo, não quantas linhas há. */
  const socialProfilesInformados = useMemo(
    () => parseOfficialSocialUrls(socialProfiles).length,
    [socialProfiles],
  );

  const recording = captureState === 'gravando';
  const focusMode = recording && tab === 'ao-vivo';
  const firstName = userName.split(' ')[0] || userName;
  // O remédio muda com a superfície escolhida, e "prefira a aba" é um beco quando a
  // reunião roda num aplicativo de desktop: ali a única saída é a tela inteira com o
  // áudio do sistema. Janela nunca carrega áudio no Chrome.
  const audioIssue = audioHealth === 'microphone-only'
    ? {
        title: 'Estou ouvindo apenas você.',
        detail: captureSurface === 'window'
          ? 'Você compartilhou uma janela, e janela nunca carrega áudio no Chrome. Recompartilhe: reunião no navegador, escolha a aba dela; reunião num aplicativo, escolha “Tela inteira” e marque “Compartilhar áudio do sistema”.'
          : captureSurface === 'monitor'
            ? 'A tela veio sem o som do sistema. Recompartilhe escolhendo “Tela inteira” e marque “Compartilhar áudio do sistema” na mesma janela de seleção.'
            : captureSurface === 'browser'
              ? 'O som da aba compartilhada não chegou. Confirme que escolheu a aba da reunião e ativou “Compartilhar áudio da guia” — se a reunião estiver noutra aba ou num aplicativo, o som não vem por aqui.'
              : 'O áudio dos participantes não chegou. Recompartilhe marcando a caixa de áudio na janela de seleção.',
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
  const visibleQuestions = focusMode ? reading.questions.slice(0, 2) : reading.questions;
  const visibleUtterances = focusMode ? utterances.slice(-3) : utterances.slice(-40);
  const localAsrCopy = localAsrState === 'ready'
    ? {
        title: localAsrReadyNotice ? 'Whisper pronto — falta compartilhar o áudio' : 'Whisper pronto nesta máquina',
        detail: localAsrReadyNotice
          ? 'Clique novamente em “Compartilhar áudio e iniciar” para escolher a aba da reunião.'
          : 'Reunião no navegador: escolha a aba dela e ative “Compartilhar áudio da guia”. Reunião em aplicativo (Teams, Zoom): escolha “Tela inteira” e marque “Compartilhar áudio do sistema”. Janela nunca carrega áudio.',
      }
    : localAsrState === 'starting'
      ? {
          title: 'Iniciando Whisper local…',
          detail: 'O Chrome acionou o host sob demanda. Se ele pedir “Acesso à rede local”, permita; o modelo está carregando na GPU.',
        }
      : localAsrState === 'error'
        ? {
            title: 'Não foi possível acionar o Whisper',
            detail: 'Confira se o complemento “Vertho Whisper Local” está ativo no Chrome e tente novamente.',
          }
        : localAsrState === 'checking'
          ? {
              title: 'Verificando o Whisper local…',
              detail: 'Isso leva apenas alguns segundos e não envia áudio para a internet.',
            }
          : {
              title: 'Whisper desligado — será iniciado sob demanda',
              detail: 'Clique em “Iniciar conversa”. O Chrome liga o modelo somente para a reunião; nada inicia no login do Windows.',
            };

  return (
    <main className={classNames(styles.page, focusMode && styles.liveFocusPage)}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href={homeHref} aria-label="Voltar"><ArrowLeft size={17} /></Link>
          <Image src="/logo-vertho.png" alt="Vertho" width={106} height={24} priority />
          <span>Copiloto comercial</span>
        </div>
        <div className={styles.topMeta}>
          <span className={recording ? styles.statusLive : styles.statusReady}><i /> {recording ? 'Ao vivo' : 'Pronto'}</span>
          <small>{focusMode ? audioStatus : firstName}</small>
          {focusMode && <button type="button" className={styles.focusStopButton} onClick={stopCapture}><Square size={13} fill="currentColor" /><span>Encerrar</span></button>}
        </div>
      </header>

      {!focusMode && (
        <>
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
        </>
      )}

      {error && <div className={styles.error}><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError(null)}>Fechar</button></div>}

      {tab === 'clientes' && (
        <ClientsWorkspace initialAccounts={accounts} canCreateLeads={canCreateLeads} onPrepare={prepareFromAccount} onOpenPlan={openSavedPlan} />
      )}

      {tab === 'planejamento' && (
        <div className={styles.workspace}>
          <form className={styles.setupPanel} onSubmit={generatePlan}>
            <header><span>01 · INPUT</span><h2>Que avanço esta conversa precisa produzir?</h2><p>A escolha decide o que a pesquisa prioriza, o que o Play enfatiza e qual compromisso é o padrão. O resto vem do CRM.</p></header>

            <div className={styles.goalDoors} role="radiogroup" aria-label="Avanço desta conversa">
              {CONVERSATION_GOALS.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  role="radio"
                  aria-checked={conversationGoal === item.key}
                  className={conversationGoal === item.key ? styles.goalDoorActive : ''}
                  onClick={() => setConversationGoal(item.key)}
                >
                  <span>{index + 1}</span>
                  <span><b>{item.label}</b><small>{item.hint}</small></span>
                </button>
              ))}
            </div>

            {!!opportunities.length && (
              <label>Oportunidade no CRM
                <select value={opportunityId} onChange={(event) => selectOpportunity(event.target.value)}>
                  <option value="">Preparação avulsa</option>
                  {opportunities.map((item) => <option key={item.id} value={item.id}>{item.accountName} · {item.name}</option>)}
                </select>
              </label>
            )}

            <fieldset className={styles.playSetup}>
              <legend><UsersRound size={14} /><span>Quem estará na conversa</span><small>nome, cargo e perfil na mesma linha</small></legend>

              <div className={styles.pessoasLista}>
                {linhasParticipantes.map((linha, indice) => (
                  <div key={indice} className={styles.pessoaLinha}>
                    <input
                      value={linha.nome}
                      onChange={(event) => editarLinha(indice, 'nome', event.target.value)}
                      placeholder="Nome"
                      aria-label={`Nome da pessoa ${indice + 1}`}
                      maxLength={160}
                    />
                    <input
                      value={linha.cargo}
                      onChange={(event) => editarLinha(indice, 'cargo', event.target.value)}
                      placeholder="Cargo"
                      aria-label={`Cargo da pessoa ${indice + 1}`}
                      maxLength={200}
                    />
                    <input
                      value={linha.perfil}
                      onChange={(event) => editarLinha(indice, 'perfil', event.target.value)}
                      placeholder="linkedin.com/in/…"
                      aria-label={`Perfil da pessoa ${indice + 1}`}
                      inputMode="url"
                      maxLength={320}
                    />
                    <button
                      type="button"
                      onClick={() => removerLinha(indice)}
                      aria-label={`Remover a pessoa ${indice + 1}`}
                      disabled={linhasParticipantes.length === 1 && !linha.nome && !linha.cargo && !linha.perfil}
                    >
                      <Ban size={13} />
                    </button>
                    {/*
                      O que a busca não alcança e o vendedor alcança: ele abre o
                      perfil com a conta dele e cola o que interessa. Só aparece
                      com o nome preenchido, para a linha vazia não pesar.
                    */}
                    {!!linha.nome.trim() && (
                      <textarea
                        className={styles.pessoaNotas}
                        value={linha.notas}
                        onChange={(event) => editarLinha(indice, 'notas', event.target.value)}
                        rows={2}
                        maxLength={4000}
                        placeholder={`O que você viu no perfil de ${linha.nome.trim().split(' ')[0]}: temas dos posts, o que ela defende, movimentos recentes`}
                        aria-label={`Anotações sobre ${linha.nome.trim()}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className={styles.pessoasAcoes}>
                <button type="button" onClick={adicionarLinha} disabled={linhasParticipantes.length >= 8}>
                  + Outra pessoa
                </button>
                <small><ShieldCheck size={12} /> O perfil confirma <b>de quem estamos falando</b> e não é lido como conteúdo: com ele, homônimo deixa de virar plano sobre outra pessoa.</small>
              </div>

              {!!audienceOptions.length && (
                <div className={styles.audienceChips} aria-label="Contatos desta empresa">
                  {audienceOptions.map((option) => {
                    const nome = (option.split(',')[0] || '').trim().toLocaleLowerCase('pt-BR');
                    const selected = linhasParticipantes.some((linha) => linha.nome.trim().toLocaleLowerCase('pt-BR') === nome);
                    return <button key={option} type="button" aria-pressed={selected} onClick={() => adicionarContato(option)}>{selected && <Check size={11} />}{option}</button>;
                  })}
                </div>
              )}

              <label className={styles.peopleToggle}>
                <input type="checkbox" checked={researchPeople} onChange={(event) => setResearchPeople(event.target.checked)} />
                <span>
                  <b>Pesquisar essas pessoas e quem responde por pessoas na empresa</b>
                  <small>Uma busca a mais, só em fonte pública: cargo, entrevista, palestra ou artigo assinado. Traz também a pessoa de cargo mais alto da área.</small>
                </span>
              </label>
            </fieldset>

            <div className={styles.twoFields}>
              <label>Empresa<input value={company} onChange={(event) => changeCompany(event.target.value)} placeholder="Ex.: Grupo Sinal" maxLength={200} /></label>
              <label>Site público<input value={site} onChange={(event) => setSite(event.target.value)} placeholder="empresa.com.br" inputMode="url" maxLength={320} /></label>
            </div>

            {/*
              O estado das redes sobe para a área visível porque ele decide se uma das
              três trilhas de pesquisa vai rodar. Campo vazio não é "sem sinal social":
              é busca social que não acontece (`social: not_requested` no audit).
            */}
            {!pedindoRedes && (!!socialProfilesInformados || socialDiscovery.status !== 'idle') && (
              <div className={styles.socialStatus} data-status={socialProfilesInformados ? 'ok' : socialDiscovery.status}>
                {socialDiscovery.status === 'buscando'
                  ? <><LoaderCircle size={15} className={styles.spin} /><p>Procurando os perfis oficiais em {hostVisivel(site)}…</p></>
                  : socialProfilesInformados
                    ? <><ShieldCheck size={15} /><p><b>{socialProfilesInformados} {socialProfilesInformados === 1 ? 'perfil oficial' : 'perfis oficiais'}</b> — a busca em redes vai rodar.</p>
                        <button type="button" onClick={abrirCampoDeRedes}>Revisar</button></>
                    : <><CircleAlert size={15} /><p>
                        {socialDiscovery.status === 'vazio' && socialDiscovery.motivo === 'sem_resposta'
                          ? <>Não consegui ler {socialDiscovery.host}: o site bloqueia leitura automática.</>
                          : socialDiscovery.status === 'vazio'
                            ? <>{socialDiscovery.host} não publica perfis oficiais nas páginas lidas.</>
                            : socialDiscovery.status === 'erro'
                              ? <>{socialDiscovery.mensagem}.</>
                              : <>Nenhum perfil oficial informado.</>}
                        {' '}Sem perfis, a trilha de redes não roda: <b>cole os links à mão</b>.
                      </p>
                      <button type="button" onClick={abrirCampoDeRedes}>Adicionar perfis</button></>}
              </div>
            )}

            {/*
              O compromisso observável e o briefing privado ficam FORA do recolhível.
              São os dois campos que mais mudam o Play: o primeiro é o resultado que a
              hora precisa produzir, o segundo é a única fonte que a busca pública não
              alcança. Ficavam dentro de "Dados usados", fechado por padrão, e o
              compromisso ainda vinha marcado como opcional.
            */}
            <label className={styles.hourGoalField}>O que precisa sair desta hora
              <textarea value={goalThisHour} onChange={(event) => setGoalThisHour(event.target.value)} rows={2} maxLength={1200} placeholder="Ex.: sair com o CFO e o RH validando o piloto de 3 cargos, com data até sexta." />
              <small><Target size={12} /> Verbo + pessoa + ação + prazo. Em branco, o Copiloto propõe um pelo avanço e pelo estágio, e você ajusta no Play.</small>
            </label>

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

            <details className={styles.setupDetails} open={showSetupDetails}
              onToggle={(event) => setShowSetupDetails((event.target as HTMLDetailsElement).open)}>
              <summary>Dados usados <small>tipo da reunião, redes oficiais e o que você vende</small></summary>

            <label>Tipo da reunião
              <select value={meetingKind} onChange={(event) => setMeetingKind(event.target.value as MeetingKind)}>
                {MEETING_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
              <small><Sparkles size={12} /> Inferido pelo estágio no CRM e pelo histórico da conta.</small>
            </label>

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
                ref={socialCampoRef}
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
                  {socialDiscovery.status === 'vazio' && (socialDiscovery.motivo === 'sem_resposta'
                    ? <>Não consegui ler {socialDiscovery.host}: ele bloqueia leitura automática. Cole os links à mão.</>
                    : <>{socialDiscovery.host} não publica perfis oficiais nas páginas lidas. Cole os links à mão.</>)}
                  {socialDiscovery.status === 'erro' && <>{socialDiscovery.mensagem}. Cole os links à mão ou tente de novo.</>}
                </small>
              )}
            </div>

            <label>O que você vende
              <textarea value={offer} onChange={(event) => setOffer(event.target.value)} rows={5} maxLength={12000} />
              <small><Sparkles size={12} /> Pré-preenchido com os serviços Vertho; ajuste para esta conversa.</small>
            </label>
            </details>

            {/*
              Derivado, não só o booleano: se a pessoa colar os perfis ou trocar de
              conta com o painel aberto, ele some sozinho, sem reset espalhado pelos
              quatro pontos que trocam de empresa.
            */}
            {pedindoRedes && precisaPedirRedes({ company, site, perfisInformados: socialProfilesInformados, confirmadoPara: semRedesConfirmadoPara }) ? (
              <div className={styles.askSocial} role="group" aria-label="Perfis oficiais antes de pesquisar">
                <div className={styles.askSocialTop}><Share2 size={16} /><strong>Nenhum perfil oficial para pesquisar</strong></div>
                <p>
                  {socialDiscovery.status === 'vazio' && socialDiscovery.motivo === 'sem_resposta'
                    ? <>Não consegui ler {socialDiscovery.host}: o site bloqueia leitura automática.</>
                    : socialDiscovery.status === 'vazio'
                      ? <>{socialDiscovery.host} não publica os perfis nas páginas que li.</>
                      : <>Ainda não há perfis oficiais no planejamento.</>}
                  {' '}A pesquisa vai rodar em <b>site e imprensa</b>, e a trilha de <b>redes oficiais</b> fica de fora.
                  Cole os links agora e ela entra junto: é uma das três fontes do Play.
                </p>
                <div className={styles.askSocialActions}>
                  <button type="button" className={styles.askSocialPrimary} onClick={abrirCampoDeRedes}>
                    <Search size={15} /> Incluir perfis manualmente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSemRedesConfirmadoPara(chaveDaConta(company, site));
                      void executarGeracao();
                    }}
                  >
                    Pesquisar sem redes
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.formActions}>
                <button type="submit" disabled={planning || (!company.trim() && !site.trim() && !socialProfiles.trim() && context.trim().length < 20)}>
                  {planning ? <><LoaderCircle size={17} className={styles.spin} /> Preparando o Play · {planningSeconds}s</> : <><Target size={17} /> Montar Play da reunião</>}
                </button>
                {plan && <button type="button" className={styles.secondaryButton} onClick={clearPlan}>Limpar</button>}
              </div>
            )}
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
            <div className={styles.privacyNote}><ShieldCheck size={17} /><p><strong>Fronteira de privacidade</strong>A busca recebe apenas nome, site, perfis sociais oficiais e o foco do avanço escolhido. Briefing, memória da conta e oferta entram somente na análise privada.</p></div>
          </aside>

          {plan && <div className={styles.fullRow}><PlanDossier plan={plan} onGoLive={() => setTab('ao-vivo')} persisted={planPersisted} /></div>}
        </div>
      )}

      {tab === 'ao-vivo' && (
        <section className={classNames(styles.liveWorkspace, focusMode && styles.liveFocusWorkspace)}>
          {!focusMode && <header className={styles.liveHeader}>
            <div><p className={styles.eyebrow}>Sala de comando</p><h2>Apoio ao vivo com Whisper local</h2><p>O áudio é transcrito na sua máquina. Somente trechos de texto seguem para a IA montar as sugestões.</p></div>
            <div className={styles.liveHeaderActions}>
              {!recording && utterances.length > 0 && accountId && <button className={styles.saveResultButton} onClick={() => void saveLiveResult()} disabled={resultSaving || resultSaved}>{resultSaving ? <><LoaderCircle size={16} className={styles.spin} /> Salvando…</> : resultSaved ? <><Check size={16} /> Resultado salvo</> : <><Save size={16} /> Salvar resultado</>}</button>}
              {localAsrState === 'starting' ? (
                <button className={styles.startButton} disabled>
                  <LoaderCircle size={17} className={styles.spin} /> Iniciando Whisper…
                </button>
              ) : localAsrState !== 'ready' ? (
                <button className={styles.startButton} onClick={() => void activateLocalAsr()}>
                  <Mic size={17} /> Iniciar conversa
                </button>
              ) : (
                <button ref={startCaptureButtonRef} className={styles.startButton} onClick={startCapture} disabled={captureState === 'conectando'}>
                  {captureState === 'conectando'
                    ? <><LoaderCircle size={17} className={styles.spin} /> Conectando…</>
                    : localAsrReadyNotice
                      ? <><Mic size={17} /> Compartilhar áudio e iniciar</>
                      : <><Mic size={17} /> Iniciar conversa</>}
                </button>
              )}
            </div>
          </header>}

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

          {recording && (
            <div className={styles.medidores} aria-label="Nível dos dois canais de áudio">
              {([
                { rotulo: 'Cliente (som da reunião)', valor: audioLevels.system, ok: audioEvidenceRef.current.systemHeard },
                { rotulo: 'Você (microfone)', valor: audioLevels.microphone, ok: audioEvidenceRef.current.microphoneHeard },
              ] as const).map((canal) => (
                <div key={canal.rotulo} className={styles.medidor} data-ok={canal.ok ? 'sim' : 'nao'}>
                  <span>{canal.rotulo}</span>
                  <div className={styles.medidorTrilho}>
                    {/* A escala é logarítmica porque fala normal fica em 0,01 a 0,1:
                        numa barra linear os dois canais pareceriam parados no zero. */}
                    <i style={{ width: `${Math.min(100, Math.round(Math.sqrt(canal.valor / 0.25) * 100))}%` }} />
                  </div>
                  <b>{canal.ok ? 'ouvindo' : 'sem som'}</b>
                </div>
              ))}
            </div>
          )}

          {recording && audioIssue && (
            <div className={styles.audioWarning} role="alert">
              <CircleAlert size={19} />
              <div><strong>{audioIssue.title}</strong><span>{audioIssue.detail}</span></div>
              <button type="button" onClick={() => void restartCapture()}>Recompartilhar áudio</button>
            </div>
          )}

          {!plan && !focusMode && <div className={styles.liveHint}><CircleAlert size={17} /><span>Você pode iniciar sem plano, mas o apoio melhora quando já conhece o objetivo e as três perguntas desta hora.</span><button onClick={() => setTab('planejamento')}>Planejar primeiro</button></div>}

          {plan?.play && (focusMode ? <LiveFocusCompass play={plan.play} reading={reading} /> : <LivePlayStrip play={plan.play} reading={reading} />)}

          <div className={classNames(styles.liveGrid, focusMode && styles.liveFocusGrid)}>
            <section className={classNames(styles.nextMove, focusMode && styles.liveFocusNext)} aria-live={focusMode ? 'polite' : undefined}>
              <div className={styles.liveLabel}>
                <Radio size={15} /> {focusMode ? 'Agora' : 'Próxima melhor intervenção'}
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
                {visibleQuestions.length ? visibleQuestions.map((question, index) => (
                  <article key={`${question.text}-${index}`}><span>0{index + 1}</span><p>{question.text}<small>{question.why}</small></p></article>
                )) : <div className={styles.listening}><AudioLines size={28} /><p>{recording ? 'Ouvindo a conversa…' : 'As perguntas sugeridas aparecem aqui.'}</p></div>}
              </div>
              {reading.alert && <p className={styles.liveAlert}><CircleAlert size={15} /> {reading.alert}</p>}
              {reading.objection && <p className={styles.liveObjection}><strong>Em aberto:</strong> {reading.objection}</p>}
            </section>

            {!focusMode && <aside className={styles.discoveryPanel}>
              <div className={styles.liveLabel}><Check size={15} /> Descoberta</div>
              <div className={styles.progress}><i style={{ width: `${Math.round((reading.covered.length / DISCOVERY_CHECKLIST.length) * 100)}%` }} /></div>
              <p>{reading.covered.length} de {DISCOVERY_CHECKLIST.length} pontos cobertos</p>
              <ul>{DISCOVERY_CHECKLIST.map((item) => <li key={item.key} className={reading.covered.includes(item.key) ? styles.covered : ''}><span>{reading.covered.includes(item.key) ? <Check size={12} /> : ''}</span>{item.label}</li>)}</ul>
            </aside>}

            <section className={classNames(styles.transcriptPanel, focusMode && styles.liveFocusTranscript)}>
              <div className={styles.liveLabel}><AudioLines size={15} /> {focusMode ? 'Últimas falas' : 'Transcrição local'} <span className={recording ? (audioHealth === 'ready' ? styles.connected : audioHealth === 'checking' ? styles.degraded : styles.failed) : ''}>{recording ? (audioHealth === 'checking' ? <LoaderCircle size={13} className={styles.spin} /> : audioHealth === 'ready' ? <Wifi size={13} /> : <CircleAlert size={13} />) : <WifiOff size={13} />}{audioStatus}</span></div>
              <div className={styles.transcript}>
                {!utterances.length && !partial && <p className={styles.transcriptEmpty}>A transcrição não é salva no servidor do Copiloto.</p>}
                {visibleUtterances.map((item, index) => <p key={`${item.at}-${index}`} data-channel={item.channel}><span title={item.channel === 'cliente' ? 'Áudio compartilhado da reunião' : 'Microfone deste computador'}>{item.channel === 'cliente' ? (meetingComposition === 'solo-vertho' ? 'Cliente(s)' : 'Reunião') : 'Vertho local'}</span>{item.text}</p>)}
                {partial && <p data-channel={partial.channel} className={styles.partial}><span title={partial.channel === 'cliente' ? 'Áudio compartilhado da reunião' : 'Microfone deste computador'}>{partial.channel === 'cliente' ? (meetingComposition === 'solo-vertho' ? 'Cliente(s)' : 'Reunião') : 'Vertho local'}</span>{partial.text}</p>}
              </div>
            </section>
          </div>

          {!focusMode && <footer className={styles.liveFooter}><ShieldCheck size={15} /><span>Avise os participantes de que você usa um assistente de transcrição e respeite a política de gravação da organização.</span><code>{ASR_URL}</code></footer>}
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
