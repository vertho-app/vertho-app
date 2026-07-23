'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { salvarPerfilComportamental, verificarDisponibilidadeMapeamento } from './mapeamento-actions';
import { getColabByEmail } from '@/app/dashboard/colab-action';
import { ChevronUp, ChevronDown, Loader2, Check, Star, Play } from 'lucide-react';
import Image from 'next/image';
import VideoModal from '@/components/video-modal';
import BackButton from '@/components/back-button';
import { computeDiscCompetenciesNatural } from '@/lib/disc-competencias';

/* ───────────────────── DATA ───────────────────── */

const RANKING_GROUPS = [
  [{ k: 'driver', d: 'D' }, { k: 'captivating', d: 'I' }, { k: 'careful', d: 'C' }, { k: 'constant', d: 'S' }],
  [{ k: 'welcoming', d: 'S' }, { k: 'articulate', d: 'I' }, { k: 'incisive', d: 'D' }, { k: 'meticulous', d: 'C' }],
  [{ k: 'rational', d: 'C' }, { k: 'animated', d: 'I' }, { k: 'tolerant', d: 'S' }, { k: 'firm', d: 'D' }],
  [{ k: 'motivator', d: 'I' }, { k: 'methodical', d: 'C' }, { k: 'achiever', d: 'D' }, { k: 'resilient', d: 'S' }],
  [{ k: 'objective', d: 'D' }, { k: 'adaptable', d: 'I' }, { k: 'balanced', d: 'S' }, { k: 'rigorous', d: 'C' }],
  [{ k: 'structured', d: 'C' }, { k: 'calm', d: 'S' }, { k: 'proactive', d: 'D' }, { k: 'vibrant', d: 'I' }],
  [{ k: 'communicative', d: 'I' }, { k: 'analytical', d: 'C' }, { k: 'collaborative', d: 'S' }, { k: 'decisive', d: 'D' }],
  [{ k: 'fearless', d: 'D' }, { k: 'cautious', d: 'C' }, { k: 'engaging', d: 'I' }, { k: 'persevering', d: 'S' }],
];

const FORCED_PAIRS = [
  { a: 'actFast', fa: 'D', b: 'involvePeople', fb: 'I' },
  { a: 'changeBroken', fa: 'D', b: 'keepWorking', fb: 'S' },
  { a: 'decideAvailable', fa: 'D', b: 'analyzeAll', fb: 'C' },
  { a: 'meetPeople', fa: 'I', b: 'deepenRelations', fb: 'S' },
  { a: 'improvise', fa: 'I', b: 'routine', fb: 'C' },
  { a: 'teamWellbeing', fa: 'S', b: 'deliveryQuality', fb: 'C' },
];

const FORMATS = [
  { id: 'video_short', icon: '🎬' },
  { id: 'video_long', icon: '🎥' },
  { id: 'text', icon: '📄' },
  { id: 'audio', icon: '🎧' },
  { id: 'infographic', icon: '📊' },
  { id: 'exercise', icon: '🎯' },
  { id: 'mentor', icon: '🤖' },
  { id: 'case', icon: '📋' },
];

const RANK_WEIGHTS = [10, 6, 3, 1];

const COMP_GROUPS = {
  D: ['Ousadia', 'Comando', 'Objetividade', 'Assertividade'],
  I: ['Persuasão', 'Extroversão', 'Entusiasmo', 'Sociabilidade'],
  S: ['Empatia', 'Paciência', 'Persistência', 'Planejamento'],
  C: ['Organização', 'Detalhismo', 'Prudência', 'Concentração'],
};

// Paleta sem vermelho: D=amarelo, I=cinza, S=verde, C=azul
const DISC_COLORS = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };
const LEAD_LABELS = { Executivo: 'D', Motivador: 'I', Metódico: 'S', Sistemático: 'C' };

const TOTAL_STEPS = RANKING_GROUPS.length + FORCED_PAIRS.length + 1;

// Vídeo de instruções do mapeamento (Bunny Stream, library 636615).
const BUNNY_LIBRARY = 636615;
// v3 HD (1232x720): mesma edição da v2, em 1500 kbps. Capa GLOBAL (sem município).
const INSTRUCTIONS_VIDEO_ID = 'ab190728-e2ae-4cd6-9080-174c2ed2a91e';
// Bump quando trocar o thumbnail no Bunny (busta o cache de edge da capa).
const INSTRUCTIONS_THUMB_V = '5';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function InstructionCard({ numero, titulo, descricao }) {
  return (
    <div className="flex gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm flex-shrink-0"
        style={{ background: 'rgba(0,180,216,0.15)', color: '#00B4D8' }}>
        {numero}
      </div>
      <div>
        <h3 className="text-sm font-bold text-white mb-1">{titulo}</h3>
        <p className="text-xs text-gray-400 leading-relaxed">{descricao}</p>
      </div>
    </div>
  );
}

function BlockContextHeader({ etapa, t }) {
  const block = {
    numero: '1',
    titulo: t('blocks.natural.title'),
    cor: '#2DD4BF',
    resumo: t('blocks.natural.summary'),
    reforco: t('blocks.natural.reinforcement'),
  };

  const etapaTexto = etapa === 'ranking'
    ? t('blocks.rankingInstruction')
    : t('blocks.pairsInstruction');

  return (
    <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
      <div className="flex gap-3">
        <div
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: block.cor, boxShadow: `0 0 12px ${block.cor}` }}
        />
        <div className="min-w-0">
          <h2 className="text-base font-black leading-snug" style={{ color: block.cor }}>
            {block.titulo}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">
            {block.resumo} <span className="text-slate-400">{block.reforco}</span>
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[1.6px]" style={{ color: block.cor }}>
            {etapaTexto}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────── SCORING ───────────────── */

function scoreRankings(rankings) {
  const scores = { D: 0, I: 0, S: 0, C: 0 };
  rankings.forEach(group => {
    group.forEach((item, idx) => {
      scores[item.d] += RANK_WEIGHTS[idx];
    });
  });
  return scores;
}

function scorePairs(pairsAnswers) {
  const bonus = { D: 0, I: 0, S: 0, C: 0 };
  pairsAnswers.forEach(factor => { if (factor) bonus[factor] += 1; });
  return bonus;
}

function normalize(scores, target = 200) {
  const total = scores.D + scores.I + scores.S + scores.C;
  if (total === 0) return { D: 50, I: 50, S: 50, C: 50 };
  const factor = target / total;
  const result = {
    D: Math.round(scores.D * factor),
    I: Math.round(scores.I * factor),
    S: Math.round(scores.S * factor),
    C: Math.round(scores.C * factor),
  };
  // Fix rounding to exactly target (match GAS behavior)
  const sum = result.D + result.I + result.S + result.C;
  if (sum !== target) {
    const dominant = Object.keys(result).sort((a, b) => result[b] - result[a])[0];
    result[dominant] += target - sum;
  }
  return result;
}

function computeLeadership(disc) {
  return {
    Executivo: Math.round(disc.D / 2 * 10) / 10,
    Motivador: Math.round(disc.I / 2 * 10) / 10,
    Metódico: Math.round(disc.S / 2 * 10) / 10,
    Sistemático: Math.round(disc.C / 2 * 10) / 10,
  };
}

function deriveProfile(disc: any) {
  const sorted = Object.entries(disc).sort((a: any, b: any) => b[1] - a[1]);
  const acima = sorted.filter(([, v]: [string, any]) => v >= 50).map(([k]) => k).join('');
  return acima || sorted[0][0];
}

/* ───────────────── PHASES ───────────────── */

const PHASE = {
  ONBOARDING: 'onboarding',
  WELCOME: 'welcome',
  NATURAL_INTRO: 'naturalIntro',
  RANK1: 'rank1',
  PAIRS1: 'pairs1',
  LEARNING: 'learning',
  CALCULATING: 'calculating',
  RESULTS: 'results',
};

/* ───────────────── COMPONENT ───────────────── */

export default function MapeamentoPage() {
  const t = useTranslations('BehavioralMapping');
  const router = useRouter();
  const supabase = getSupabase();

  // Auth
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [colabId, setColabId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Vídeo de instruções (capa clicável → modal com tracking)
  const [showVideo, setShowVideo] = useState(false);

  // Flow — começa na tela de instruções (ONBOARDING)
  const [phase, setPhase] = useState(PHASE.ONBOARDING);
  const [groupIdx, setGroupIdx] = useState(0);
  const [pairIdx, setPairIdx] = useState(0);

  // Welcome form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGender, setFormGender] = useState('');

  // Rankings: arrays of [group][position] = item
  const [rank1, setRank1] = useState(() => RANKING_GROUPS.map(g => shuffle([...g])));

  // Pairs answers: array of chosen factor per pair
  const [pairs1, setPairs1] = useState(() => Array(6).fill(null));

  // Learning preferences
  const [learnPrefs, setLearnPrefs] = useState(() => Object.fromEntries(FORMATS.map(f => [f.id, 0])));

  // Results
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load auth + nome do colaborador
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const disponibilidade = await verificarDisponibilidadeMapeamento();
      if (!disponibilidade.permitido) {
        router.replace(disponibilidade.redirectTo || '/dashboard/perfil-comportamental');
        return;
      }
      setUserEmail(user.email || '');
      setFormEmail(user.email || '');
      // Buscar nome + id do colaborador via server action (tenant-aware)
      const colab = await getColabByEmail('id, nome_completo');
      const name = colab?.nome_completo || user.user_metadata?.name || '';
      setUserName(name);
      setFormName(name);
      setColabId(colab?.id || null);
      setAuthReady(true);
    })();
  }, []);

  /* ─── Progress ─── */
  const currentStep = useMemo(() => {
    switch (phase) {
      case PHASE.ONBOARDING: return 0;
      case PHASE.WELCOME: return 0;
      case PHASE.RANK1: return groupIdx;
      case PHASE.PAIRS1: return 8 + pairIdx;
      case PHASE.LEARNING: return RANKING_GROUPS.length + FORCED_PAIRS.length;
      case PHASE.CALCULATING:
      case PHASE.RESULTS: return TOTAL_STEPS;
      default: return 0;
    }
  }, [phase, groupIdx, pairIdx]);

  const progressPct = Math.round((currentStep / TOTAL_STEPS) * 100);

  /* ─── Ranking reorder ─── */
  const moveItem = useCallback((gIdx, fromIdx, direction) => {
    setRank1(prev => {
      const next = prev.map(g => [...g]);
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx > 3) return prev;
      [next[gIdx][fromIdx], next[gIdx][toIdx]] = [next[gIdx][toIdx], next[gIdx][fromIdx]];
      return next;
    });
  }, []);

  /* ─── Pairs select ─── */
  const selectPair = useCallback((idx, factor) => {
    setPairs1(prev => {
      const next = [...prev];
      next[idx] = factor;
      return next;
    });
  }, []);

  /* ─── Calculate results ─── */
  const calculate = useCallback(async () => {
    setPhase(PHASE.CALCULATING);

    // Score natural
    const rankScores1 = scoreRankings(rank1);
    const pairBonus1 = scorePairs(pairs1);
    const raw1 = { D: rankScores1.D + pairBonus1.D, I: rankScores1.I + pairBonus1.I, S: rankScores1.S + pairBonus1.S, C: rankScores1.C + pairBonus1.C };
    const disc = normalize(raw1);

    const lead = computeLeadership(disc);
    const comp = computeDiscCompetenciesNatural(disc);
    const profile = deriveProfile(disc);

    const resultData = {
      disc, lead, comp, profile, learnPrefs,
      rawData: { rank1, pairs1, formName, formGender },
    };

    // Save
    setSaving(true);
    try {
      const res = await salvarPerfilComportamental(resultData);
      if (!res.success) setSaveError(res.error || t('errors.save'));
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);

    // Pequeno delay pra garantir que a gravação terminou de propagar, então
    // REDIRECIONA pra tela consolidada. replace evita voltar pra essa tela.
    setTimeout(() => router.replace('/dashboard/perfil-comportamental'), 800);
  }, [rank1, pairs1, learnPrefs, formName, formGender, router, t]);

  /* ─── Navigation helpers ─── */
  const nextRankGroup = () => {
    if (groupIdx < 7) {
      setGroupIdx(groupIdx + 1);
    } else {
      setGroupIdx(0);
      setPairIdx(0);
      setPhase(PHASE.PAIRS1);
    }
  };

  const nextPair = () => {
    if (pairIdx < 5) {
      setPairIdx(pairIdx + 1);
    } else {
      setPairIdx(0);
      setGroupIdx(0);
      setPhase(PHASE.LEARNING);
    }
  };

  /* ─── Render helpers ─── */
  const showProgress = ![PHASE.ONBOARDING, PHASE.WELCOME, PHASE.RESULTS].includes(phase);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    );
  }

  /* ═══════════════════ ONBOARDING (Instruções) ═══════════════════ */
  if (phase === PHASE.ONBOARDING) {
    // Se colab já está logado (tem email), pula WELCOME (já temos os dados)
    const pularWelcome = !!userEmail;
    const irPra = pularWelcome ? PHASE.NATURAL_INTRO : PHASE.WELCOME;
    return (
      <div className="max-w-[560px] mx-auto px-4 py-8">
        <BackButton href="/dashboard/perfil-comportamental" className="mb-6" />

        <Image src="/logo-vertho.png" alt="Vertho" width={120} height={40} className="mb-5" />

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('onboarding.title')}</h1>
        <p className="text-sm text-gray-400 mb-6">{t.rich('onboarding.subtitle', { strong: (chunks) => <b>{chunks}</b> })}</p>

        <div className="flex flex-wrap gap-2 mb-8">
          {['discProfile', 'leadershipStyle', 'learningPreferences'].map(chip => (
            <span key={chip} className="text-xs font-medium px-3 py-1.5 rounded-full bg-brand-400/10 text-brand-400 border border-brand-400/20">
              {t(`onboarding.chips.${chip}`)}
            </span>
          ))}
        </div>

        {/* Vídeo de instruções — capa clicável → modal (com tracking de view) */}
        <button
          onClick={() => setShowVideo(true)}
          className="group relative block w-full aspect-video rounded-2xl overflow-hidden border border-white/10 mb-8 active:scale-[0.99] transition-transform"
          aria-label={t('onboarding.watchVideo')}
        >
          <img
            src={`/api/bunny-thumb/${INSTRUCTIONS_VIDEO_ID}?v=${INSTRUCTIONS_THUMB_V}`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/10" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"
              style={{ background: 'rgba(0,180,216,0.92)' }}>
              <Play size={24} className="text-white translate-x-0.5" fill="currentColor" />
            </span>
          </div>
          <span className="absolute bottom-3 left-4 right-4 text-left text-sm font-semibold text-white drop-shadow">
            {t('onboarding.watchVideo')}
          </span>
        </button>

        <div className="space-y-4 mb-8">
          <InstructionCard
            numero={1}
            titulo={<span className="text-teal-400">{t('blocks.natural.title')}</span>}
            descricao={t.rich('onboarding.naturalDescription', { strong: (chunks) => <b>{chunks}</b> })}
          />
          <InstructionCard
            numero={2}
            titulo={t('onboarding.learningTitle')}
            descricao={t.rich('onboarding.learningDescription', { strong: (chunks) => <b>{chunks}</b> })}
          />
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-4 mb-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand-400 mb-2">{t('onboarding.howQuestionsWork')}</p>
          <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
            <p>{t.rich('onboarding.rankingHelp', { strong: (chunks) => <b>{chunks}</b>, most: (chunks) => <span className="text-emerald-400 font-bold">{chunks}</span>, least: (chunks) => <span className="text-red-400 font-bold">{chunks}</span> })}</p>
            <p>{t.rich('onboarding.pairsHelp', { strong: (chunks) => <b>{chunks}</b> })}</p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 mb-6">
          <p className="text-xs text-amber-200 leading-relaxed">
            {t.rich('onboarding.tip', { strong: (chunks) => <b>{chunks}</b> })}
          </p>
        </div>

        <button
          onClick={() => setPhase(irPra)}
          className="w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)' }}
        >
          {t('onboarding.start')}
        </button>

        {showVideo && (
          <VideoModal
            libraryId={BUNNY_LIBRARY}
            videoId={INSTRUCTIONS_VIDEO_ID}
            title={t('onboarding.watchVideo')}
            colaboradorId={colabId}
            onClose={() => setShowVideo(false)}
          />
        )}
      </div>
    );
  }

  /* ═══════════════════ WELCOME ═══════════════════ */
  if (phase === PHASE.WELCOME) {
    const canStart = formName.trim() && formEmail.trim() && formGender;
    return (
      <div className="max-w-[440px] mx-auto px-4 py-8">
        <BackButton onClick={() => setPhase(PHASE.ONBOARDING)} className="mb-6" />
        <h2 className="text-xl font-bold text-white mb-1">{t('welcome.title')}</h2>
        <p className="text-sm text-gray-400 mb-6">{t('welcome.subtitle')}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('welcome.fullName')}</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-400/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('welcome.email')}</label>
            <input
              type="email"
              value={formEmail}
              onChange={e => setFormEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-400/50"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">{t('welcome.gender')}</label>
            <select
              value={formGender}
              onChange={e => setFormGender(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-400/50 appearance-none"
            >
              <option value="" className="bg-[#091D35]">{t('welcome.select')}</option>
              <option value="M" className="bg-[#091D35]">{t('welcome.masculine')}</option>
              <option value="F" className="bg-[#091D35]">{t('welcome.feminine')}</option>
              <option value="O" className="bg-[#091D35]">{t('welcome.other')}</option>
            </select>
          </div>
        </div>

        <button
          disabled={!canStart}
          onClick={() => setPhase(PHASE.NATURAL_INTRO)}
          className="mt-8 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all disabled:opacity-40"
          style={{ background: canStart ? 'linear-gradient(135deg, #00B4D8, #0D9488)' : '#374151' }}
        >
          {t('welcome.start')}
        </button>
      </div>
    );
  }

  /* ═══════════════════ ABERTURA DO BLOCO NATURAL ═══════════════════ */
  if (phase === PHASE.NATURAL_INTRO) {
    return (
      <div className="max-w-[520px] mx-auto px-4 py-10">
        <BackButton onClick={() => setPhase(PHASE.ONBOARDING)} className="mb-8" />

        <div className="flex items-center gap-2 mb-4">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#2DD4BF', boxShadow: '0 0 14px rgba(45,212,191,0.7)' }} />
          <span className="text-xs font-bold uppercase tracking-[3px] text-teal-400">{t('blocks.natural.title')}</span>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-white leading-snug mb-5">{t('naturalIntro.title')}</h1>

        <div className="space-y-4 text-sm md:text-[15px] text-gray-300 leading-relaxed">
          <p>{t('naturalIntro.p1')}</p>
          <p>{t('naturalIntro.p2')}</p>
          <div>
            <p className="mb-2">{t('naturalIntro.listIntro')}</p>
            <ul className="space-y-1.5">
              {['li1', 'li2', 'li3'].map((li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-0.5 text-teal-400">•</span>
                  <span>{t(`naturalIntro.${li}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-gray-400">{t('naturalIntro.p3')}</p>
        </div>

        <button
          onClick={() => { setGroupIdx(0); setPhase(PHASE.RANK1); }}
          className="mt-8 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all hover:opacity-90 active:scale-[0.99]"
          style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)' }}
        >
          {t('naturalIntro.start')}
        </button>
      </div>
    );
  }

  /* ═══════════════════ PROGRESS BAR WRAPPER ═══════════════════ */
  const ProgressBar = () => (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>{t('progress')}</span>
        <span>{currentStep}/{TOTAL_STEPS}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-white/5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #00B4D8, #0D9488)' }}
        />
      </div>
    </div>
  );

  /* ─── Phase dots ─── */
  const PhaseDots = ({ count, current }) => (
    <div className="flex justify-center gap-1.5 mb-4">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full transition-all"
          style={{
            background: i < current ? '#00B4D8' : i === current ? '#0D9488' : 'rgba(255,255,255,0.1)',
            transform: i === current ? 'scale(1.3)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );

  /* ═══════════════════ RANKING PHASE ═══════════════════ */
  if (phase === PHASE.RANK1) {
    const group = rank1[groupIdx];
    const label = t('labels.natural');

    // Drag state
    const handleDragStart = (e, idx) => { e.dataTransfer.setData('text/plain', idx); };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDrop = (e, toIdx) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      if (!isNaN(fromIdx) && fromIdx !== toIdx) moveItem(groupIdx, fromIdx, toIdx - fromIdx);
    };

    return (
      <div className="max-w-[560px] mx-auto px-4 py-6">
        {/* Progress header */}
        <div className="flex justify-between text-[11px] text-gray-500 font-medium mb-4">
          <span>{label} — Rankings</span>
          <span>{progressPct}%</span>
        </div>

        <BlockContextHeader etapa="ranking" t={t} />

        {/* Phase tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-400 mb-1">{label}</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-2">{t('ranking.group', { number: String(groupIdx + 1).padStart(2, '0') })}</h1>

        {/* Dots */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`w-[7px] h-[7px] rounded-full transition-all ${i < groupIdx ? 'bg-teal-500' : i === groupIdx ? 'bg-brand-400 shadow-[0_0_8px_rgba(0,180,216,0.5)]' : 'bg-white/[0.08]'}`} />
          ))}
        </div>

        {/* Top label */}
        <p className="text-center text-[15px] font-semibold text-green-400 mb-3">{t('ranking.mostSimilar')}</p>

        {/* Ranking cards */}
        <div className="space-y-2 mb-3">
          {group.map((item, idx) => (
            <div
              key={item.k + idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/[0.04] cursor-grab active:cursor-grabbing active:border-brand-400/40 active:scale-[1.02] transition-all"
              style={{ background: '#182B48' }}
            >
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-extrabold flex-shrink-0"
                style={{ background: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>
                {idx + 1}
              </span>
              <span className="flex-1 text-[16px] text-white font-semibold">{t(`ranking.words.${item.k}`)}</span>
              <div className="flex gap-1">
                <button
                  disabled={idx === 0}
                  onClick={() => moveItem(groupIdx, idx, -1)}
                  className="w-[38px] h-[38px] rounded-lg flex items-center justify-center text-gray-400 hover:bg-brand-400 hover:text-[#0C1829] disabled:opacity-[0.15] transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronUp size={16} strokeWidth={3} />
                </button>
                <button
                  disabled={idx === 3}
                  onClick={() => moveItem(groupIdx, idx, 1)}
                  className="w-[38px] h-[38px] rounded-lg flex items-center justify-center text-gray-400 hover:bg-brand-400 hover:text-[#0C1829] disabled:opacity-[0.15] transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronDown size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom label */}
        <p className="text-center text-[15px] font-semibold text-amber-400 mb-6">{t('ranking.leastSimilar')}</p>

        {/* Advance button */}
        <button
          onClick={nextRankGroup}
          className="w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          {t('next')}
        </button>
      </div>
    );
  }

  /* ═══════════════════ PAIRS PHASE ═══════════════════ */
  if (phase === PHASE.PAIRS1) {
    const pair = FORCED_PAIRS[pairIdx];
    const selected = pairs1[pairIdx];
    const label = t('labels.natural');

    return (
      <div className="max-w-[560px] mx-auto px-4 py-6">
        {/* Progress header */}
        <div className="flex justify-between items-center text-[11px] text-gray-500 font-medium mb-1">
          <span>{label} — Pares</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-[3px] rounded-full overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2DD4BF, #FCD34D)' }} />
        </div>

        <BlockContextHeader etapa="pares" t={t} />

        {/* Phase tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-400 mb-1">{label} — {t('pairs.quickChoice')}</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-2">{t('pairs.pair', { current: pairIdx + 1, total: 6 })}</h1>

        {/* Dots */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`w-[7px] h-[7px] rounded-full transition-all ${i < pairIdx ? 'bg-teal-500' : i === pairIdx ? 'bg-brand-400 shadow-[0_0_8px_rgba(0,180,216,0.5)]' : 'bg-white/[0.08]'}`} />
          ))}
        </div>

        {/* Question */}
        <p className="text-center text-[15px] font-semibold text-gray-300 mb-4">{t('pairs.question')}</p>

        {/* Option A */}
        <button
          onClick={() => selectPair(pairIdx, pair.fa)}
          className="w-full text-center px-5 py-5 rounded-2xl border-2 transition-all mb-2"
          style={{
            background: selected === pair.fa ? 'rgba(45,212,191,0.08)' : '#182B48',
            borderColor: selected === pair.fa ? '#2DD4BF' : 'transparent',
            boxShadow: selected === pair.fa ? '0 0 16px rgba(45,212,191,0.15)' : 'none',
          }}
        >
          <span className="text-[16px] font-semibold text-white leading-relaxed">{t(`pairs.options.${pair.a}`)}</span>
        </button>

        {/* OU */}
        <p className="text-center text-[13px] font-extrabold text-gray-500 tracking-[2px] py-1.5">{t('pairs.or')}</p>

        {/* Option B */}
        <button
          onClick={() => selectPair(pairIdx, pair.fb)}
          className="w-full text-center px-5 py-5 rounded-2xl border-2 transition-all"
          style={{
            background: selected === pair.fb ? 'rgba(45,212,191,0.08)' : '#182B48',
            borderColor: selected === pair.fb ? '#2DD4BF' : 'transparent',
            boxShadow: selected === pair.fb ? '0 0 16px rgba(45,212,191,0.15)' : 'none',
          }}
        >
          <span className="text-[16px] font-semibold text-white leading-relaxed">{t(`pairs.options.${pair.b}`)}</span>
        </button>

        {/* Advance */}
        <button
          disabled={!selected}
          onClick={nextPair}
          className="mt-5 w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase disabled:opacity-30 transition-all"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          {t('next')}
        </button>
      </div>
    );
  }

  /* ═══════════════════ LEARNING PREFERENCES ═══════════════════ */
  if (phase === PHASE.LEARNING) {
    const allRated = Object.values(learnPrefs).every(v => v > 0);
    return (
      <div className="max-w-[480px] mx-auto px-4 py-6">
        {/* Progress header */}
        <div className="flex justify-between items-center text-[11px] text-gray-500 font-medium mb-1">
          <span>{t('learning.progressTitle')}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-[3px] rounded-full overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2DD4BF, #FCD34D)' }} />
        </div>

        {/* Tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-400 mb-1">{t('learning.lastStep')}</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{t('learning.title')}</h1>
        <p className="text-[14px] text-gray-400 mb-5">{t('learning.subtitle')}</p>

        {/* Format rows */}
        <div className="space-y-2">
          {FORMATS.map(fmt => (
            <div key={fmt.id} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: '#182B48' }}>
              <span className="text-[18px] shrink-0">{fmt.icon}</span>
              <span className="flex-1 text-[14px] font-semibold text-white leading-snug">{t(`learning.formats.${fmt.id}`)}</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setLearnPrefs(prev => ({ ...prev, [fmt.id]: star }))}
                    className="w-8 h-8 rounded-md flex items-center justify-center text-base transition-all"
                    style={{
                      background: learnPrefs[fmt.id] >= star ? 'rgba(252,211,77,0.15)' : 'rgba(255,255,255,0.04)',
                      color: learnPrefs[fmt.id] >= star ? '#FCD34D' : '#64748B',
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          disabled={!allRated}
          onClick={calculate}
          className="mt-5 w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase disabled:opacity-30 transition-all"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          {t('learning.viewProfile')}
        </button>
      </div>
    );
  }

  /* ═══════════════════ CALCULATING ═══════════════════ */
  if (phase === PHASE.CALCULATING) {
    return (
      <div className="flex flex-col items-center justify-center h-[70dvh] text-center px-4">
        <Loader2 size={48} className="animate-spin text-brand-400 mb-4" />
        <h2 className="text-lg font-bold text-white mb-1">{t('calculating.title')}</h2>
        <p className="text-sm text-gray-400">{t('calculating.subtitle')}</p>
      </div>
    );
  }


  return null;
}

/* ─── SVG Radar helpers ─── */
function radarPoints(pct) {
  // D=top, I=right, S=bottom, C=left
  const r = pct;
  const cx = 100, cy = 100;
  return [
    `${cx},${cy - r}`,       // D (top)
    `${cx + r},${cy}`,       // I (right)
    `${cx},${cy + r}`,       // S (bottom)
    `${cx - r},${cy}`,       // C (left)
  ].join(' ');
}

function discRadarPoints(disc) {
  const cx = 100, cy = 100;
  const scale = (v) => Math.min(100, Math.max(0, v));
  return [
    `${cx},${cy - scale(disc.D)}`,
    `${cx + scale(disc.I)},${cy}`,
    `${cx},${cy + scale(disc.S)}`,
    `${cx - scale(disc.C)},${cy}`,
  ].join(' ');
}
