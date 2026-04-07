'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { salvarPerfilComportamental } from './mapeamento-actions';
import { ArrowLeft, ChevronUp, ChevronDown, Loader2, Check, Star } from 'lucide-react';
import Image from 'next/image';

/* ───────────────────── DATA ───────────────────── */

const RANKING_GROUPS = [
  [{ l: 'Direcionador(a)', d: 'D' }, { l: 'Cativante', d: 'I' }, { l: 'Criterioso(a)', d: 'C' }, { l: 'Constante', d: 'S' }],
  [{ l: 'Acolhedor(a)', d: 'S' }, { l: 'Articulado(a)', d: 'I' }, { l: 'Incisivo(a)', d: 'D' }, { l: 'Minucioso(a)', d: 'C' }],
  [{ l: 'Racional', d: 'C' }, { l: 'Animado(a)', d: 'I' }, { l: 'Tolerante', d: 'S' }, { l: 'Firme', d: 'D' }],
  [{ l: 'Motivador(a)', d: 'I' }, { l: 'Metódico(a)', d: 'C' }, { l: 'Realizador(a)', d: 'D' }, { l: 'Resiliente', d: 'S' }],
  [{ l: 'Objetivo(a)', d: 'D' }, { l: 'Adaptável', d: 'I' }, { l: 'Equilibrado(a)', d: 'S' }, { l: 'Rigoroso(a)', d: 'C' }],
  [{ l: 'Estruturado(a)', d: 'C' }, { l: 'Sereno(a)', d: 'S' }, { l: 'Proativo(a)', d: 'D' }, { l: 'Vibrante', d: 'I' }],
  [{ l: 'Comunicativo(a)', d: 'I' }, { l: 'Analítico(a)', d: 'C' }, { l: 'Colaborativo(a)', d: 'S' }, { l: 'Decidido(a)', d: 'D' }],
  [{ l: 'Destemido(a)', d: 'D' }, { l: 'Cauteloso(a)', d: 'C' }, { l: 'Envolvente', d: 'I' }, { l: 'Perseverante', d: 'S' }],
];

const FORCED_PAIRS = [
  { a: 'Prefiro agir rápido e resolver', fa: 'D', b: 'Prefiro envolver as pessoas antes de agir', fb: 'I' },
  { a: 'Gosto de mudar o que não funciona', fa: 'D', b: 'Prefiro manter o que já está funcionando', fb: 'S' },
  { a: 'Tomo decisões com o que tenho disponível', fa: 'D', b: 'Analiso todos os dados antes de decidir', fb: 'C' },
  { a: 'Gosto de conhecer pessoas novas', fa: 'I', b: 'Prefiro aprofundar relações que já tenho', fb: 'S' },
  { a: 'Improviso bem quando o plano muda', fa: 'I', b: 'Me sinto melhor com uma rotina definida', fb: 'C' },
  { a: 'Priorizo o bem-estar da equipe', fa: 'S', b: 'Priorizo a qualidade da entrega', fb: 'C' },
];

const FORMATS = [
  { id: 'video_short', label: 'Vídeo curto (≤5 min)', icon: '🎬' },
  { id: 'video_long', label: 'Vídeo longo (aula/palestra)', icon: '🎥' },
  { id: 'text', label: 'Texto / artigo', icon: '📄' },
  { id: 'audio', label: 'Áudio / podcast', icon: '🎧' },
  { id: 'infographic', label: 'Infográfico / visual', icon: '📊' },
  { id: 'exercise', label: 'Exercício prático / simulação', icon: '🎯' },
  { id: 'mentor', label: 'Conversa com mentor (chat IA)', icon: '🤖' },
  { id: 'case', label: 'Estudo de caso', icon: '📋' },
];

const RANK_WEIGHTS = [10, 6, 3, 1];

const COMPETENCY_COEFFICIENTS = {
  'Ousadia': [.0027, .48532, .38013, -.132, -.193, .150, .126, .152, .112],
  'Comando': [.003, .976, -.139, -.151, -.137, .151, .130, .130, .137],
  'Objetividade': [.003, .547, -.154, -.169, .360, .120, .182, .136, .145],
  'Assertividade': [.003, .418, -.136, -.179, .446, .138, .141, .148, .122],
  'Persuasão': [.003, -.126, .947, -.133, -.142, .154, .144, .135, .114],
  'Extroversão': [.003, -.138, .965, -.150, -.122, .120, .153, .138, .143],
  'Entusiasmo': [.003, -.138, .984, -.154, -.148, .130, .131, .138, .145],
  'Sociabilidade': [.003, -.162, .467, .357, -.108, .120, .167, .136, .131],
  'Empatia': [.003, -.172, .433, .404, -.110, .132, .143, .141, .138],
  'Paciência': [.003, -.153, -.136, .981, -.151, .096, .178, .093, .174],
  'Persistência': [.003, .401, -.117, .440, -.176, .177, .115, .171, .085],
  'Planejamento': [.003, -.116, -.144, .404, .430, .128, .138, .120, .186],
  'Organização': [.003, .176, -.130, .222, .287, .112, .140, .109, .195],
  'Detalhismo': [.003, .345, -.143, -.135, .499, .171, .121, .151, .124],
  'Prudência': [.003, -.171, -.142, .399, .462, .137, .133, .150, .128],
  'Concentração': [.003, .383, -.142, -.142, .449, .135, .145, .142, .125],
};

const COMP_GROUPS = {
  D: ['Ousadia', 'Comando', 'Objetividade', 'Assertividade'],
  I: ['Persuasão', 'Extroversão', 'Entusiasmo', 'Sociabilidade'],
  S: ['Empatia', 'Paciência', 'Persistência', 'Planejamento'],
  C: ['Organização', 'Detalhismo', 'Prudência', 'Concentração'],
};

const DISC_COLORS = { D: '#EF4444', I: '#F59E0B', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };
const LEAD_LABELS = { Executivo: 'D', Motivador: 'I', Metódico: 'S', Sistemático: 'C' };

// Total steps for progress: 8 rank groups * 2 + 6 pairs * 2 + 1 learning = 29
const TOTAL_STEPS = 29;

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
  return {
    D: Math.round(scores.D * factor * 10) / 10,
    I: Math.round(scores.I * factor * 10) / 10,
    S: Math.round(scores.S * factor * 10) / 10,
    C: Math.round(scores.C * factor * 10) / 10,
  };
}

function computeLeadership(disc) {
  return {
    Executivo: Math.round(disc.D / 2 * 10) / 10,
    Motivador: Math.round(disc.I / 2 * 10) / 10,
    Metódico: Math.round(disc.S / 2 * 10) / 10,
    Sistemático: Math.round(disc.C / 2 * 10) / 10,
  };
}

function computeCompetencies(disc, dA) {
  const deltaD = dA.D - disc.D;
  const deltaI = dA.I - disc.I;
  const deltaS = dA.S - disc.S;
  const deltaC = dA.C - disc.C;
  const vec = [1, disc.D, disc.I, disc.S, disc.C, deltaD, deltaI, deltaS, deltaC];
  const result = {};
  for (const [name, coefs] of Object.entries(COMPETENCY_COEFFICIENTS)) {
    let val = 0;
    for (let i = 0; i < coefs.length; i++) val += coefs[i] * vec[i];
    result[name] = Math.round(Math.max(0, Math.min(100, val)) * 10) / 10;
  }
  return result;
}

function deriveProfile(disc) {
  const entries = Object.entries(disc).filter(([, v]) => v >= 50).sort((a, b) => b[1] - a[1]);
  return entries.map(([k]) => k).join('') || 'S';
}

/* ───────────────── PHASES ───────────────── */

const PHASE = {
  ONBOARDING: 'onboarding',
  WELCOME: 'welcome',
  RANK1: 'rank1',
  PAIRS1: 'pairs1',
  RANK2: 'rank2',
  PAIRS2: 'pairs2',
  LEARNING: 'learning',
  CALCULATING: 'calculating',
  RESULTS: 'results',
};

/* ───────────────── COMPONENT ───────────────── */

export default function MapeamentoPage() {
  const router = useRouter();
  const supabase = getSupabase();

  // Auth
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [authReady, setAuthReady] = useState(false);

  // Flow
  const [phase, setPhase] = useState(PHASE.RANK1);
  const [groupIdx, setGroupIdx] = useState(0);
  const [pairIdx, setPairIdx] = useState(0);

  // Welcome form
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGender, setFormGender] = useState('');

  // Rankings: arrays of [group][position] = item
  const [rank1, setRank1] = useState(() => RANKING_GROUPS.map(g => [...g]));
  const [rank2, setRank2] = useState(() => RANKING_GROUPS.map(g => [...g]));

  // Pairs answers: array of chosen factor per pair
  const [pairs1, setPairs1] = useState(() => Array(6).fill(null));
  const [pairs2, setPairs2] = useState(() => Array(6).fill(null));

  // Learning preferences
  const [learnPrefs, setLearnPrefs] = useState(() => Object.fromEntries(FORMATS.map(f => [f.id, 0])));

  // Results
  const [results, setResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Load auth + nome do colaborador
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserEmail(user.email || '');
      setFormEmail(user.email || '');
      // Buscar nome do colaborador no Supabase
      const { data: colab } = await supabase.from('colaboradores')
        .select('nome_completo')
        .eq('email', user.email)
        .single();
      const name = colab?.nome_completo || user.user_metadata?.name || '';
      setUserName(name);
      setFormName(name);
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
      case PHASE.RANK2: return 14 + groupIdx;
      case PHASE.PAIRS2: return 22 + pairIdx;
      case PHASE.LEARNING: return 28;
      case PHASE.CALCULATING:
      case PHASE.RESULTS: return 29;
      default: return 0;
    }
  }, [phase, groupIdx, pairIdx]);

  const progressPct = Math.round((currentStep / TOTAL_STEPS) * 100);

  /* ─── Ranking reorder ─── */
  const moveItem = useCallback((phaseKey, gIdx, fromIdx, direction) => {
    const setter = phaseKey === 'rank1' ? setRank1 : setRank2;
    setter(prev => {
      const next = prev.map(g => [...g]);
      const toIdx = fromIdx + direction;
      if (toIdx < 0 || toIdx > 3) return prev;
      [next[gIdx][fromIdx], next[gIdx][toIdx]] = [next[gIdx][toIdx], next[gIdx][fromIdx]];
      return next;
    });
  }, []);

  /* ─── Pairs select ─── */
  const selectPair = useCallback((phaseKey, idx, factor) => {
    const setter = phaseKey === 'pairs1' ? setPairs1 : setPairs2;
    setter(prev => {
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

    // Score adapted
    const rankScores2 = scoreRankings(rank2);
    const pairBonus2 = scorePairs(pairs2);
    const raw2 = { D: rankScores2.D + pairBonus2.D, I: rankScores2.I + pairBonus2.I, S: rankScores2.S + pairBonus2.S, C: rankScores2.C + pairBonus2.C };
    const dA = normalize(raw2);

    const lead = computeLeadership(disc);
    const comp = computeCompetencies(disc, dA);
    const profile = deriveProfile(disc);

    const resultData = {
      disc, dA, lead, comp, profile, learnPrefs,
      rawData: { rank1, rank2, pairs1, pairs2, formName, formGender },
    };

    setResults(resultData);

    // Save
    setSaving(true);
    try {
      const res = await salvarPerfilComportamental(formEmail, resultData);
      if (!res.success) setSaveError(res.error || 'Erro ao salvar');
    } catch (e) {
      setSaveError(e.message);
    }
    setSaving(false);

    // Delay for spinner effect
    setTimeout(() => setPhase(PHASE.RESULTS), 1800);
  }, [rank1, rank2, pairs1, pairs2, learnPrefs, formEmail, formName, formGender]);

  /* ─── Navigation helpers ─── */
  const nextRankGroup = (phaseKey) => {
    if (groupIdx < 7) {
      setGroupIdx(groupIdx + 1);
    } else {
      setGroupIdx(0);
      setPairIdx(0);
      setPhase(phaseKey === 'rank1' ? PHASE.PAIRS1 : PHASE.PAIRS2);
    }
  };

  const nextPair = (phaseKey) => {
    if (pairIdx < 5) {
      setPairIdx(pairIdx + 1);
    } else {
      setPairIdx(0);
      setGroupIdx(0);
      if (phaseKey === 'pairs1') {
        setPhase(PHASE.RANK2);
      } else {
        setPhase(PHASE.LEARNING);
      }
    }
  };

  /* ─── Render helpers ─── */
  const showProgress = ![PHASE.ONBOARDING, PHASE.WELCOME, PHASE.RESULTS].includes(phase);

  if (!authReady) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  /* ═══════════════════ ONBOARDING ═══════════════════ */
  if (phase === PHASE.ONBOARDING) {
    return (
      <div className="max-w-[440px] mx-auto px-4 py-10 flex flex-col items-center text-center min-h-[80dvh] justify-center">
        <Image src="/logo-vertho.png" alt="Vertho" width={140} height={48} className="mb-6" />
        <h1 className="text-2xl font-bold text-white mb-2">Mapeamento de Perfil Comportamental</h1>
        <p className="text-sm text-gray-400 mb-8">Descubra seu perfil DISC, estilo de liderança e competências-chave.</p>
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {['Perfil DISC', 'Pares rápidos', '16 Competências'].map(chip => (
            <span key={chip} className="text-xs font-medium px-3 py-1.5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">
              {chip}
            </span>
          ))}
        </div>
        <button
          onClick={() => setPhase(PHASE.WELCOME)}
          className="w-full max-w-[280px] py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all"
          style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)' }}
        >
          COMEÇAR
        </button>
      </div>
    );
  }

  /* ═══════════════════ WELCOME ═══════════════════ */
  if (phase === PHASE.WELCOME) {
    const canStart = formName.trim() && formEmail.trim() && formGender;
    return (
      <div className="max-w-[440px] mx-auto px-4 py-8">
        <button onClick={() => setPhase(PHASE.ONBOARDING)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-6">
          <ArrowLeft size={16} /> Voltar
        </button>
        <h2 className="text-xl font-bold text-white mb-1">Bem-vindo(a)!</h2>
        <p className="text-sm text-gray-400 mb-6">Confirme seus dados para iniciar.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Nome completo</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">E-mail</label>
            <input
              type="email"
              value={formEmail}
              onChange={e => setFormEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Gênero</label>
            <select
              value={formGender}
              onChange={e => setFormGender(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-cyan-400/50 appearance-none"
            >
              <option value="" className="bg-[#091D35]">Selecione...</option>
              <option value="M" className="bg-[#091D35]">Masculino</option>
              <option value="F" className="bg-[#091D35]">Feminino</option>
              <option value="O" className="bg-[#091D35]">Outro / Prefiro não informar</option>
            </select>
          </div>
        </div>

        <button
          disabled={!canStart}
          onClick={() => { setGroupIdx(0); setPhase(PHASE.RANK1); }}
          className="mt-8 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-all disabled:opacity-40"
          style={{ background: canStart ? 'linear-gradient(135deg, #00B4D8, #0D9488)' : '#374151' }}
        >
          INICIAR MAPEAMENTO
        </button>
      </div>
    );
  }

  /* ═══════════════════ PROGRESS BAR WRAPPER ═══════════════════ */
  const ProgressBar = () => (
    <div className="mb-4">
      <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
        <span>Progresso</span>
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
  if (phase === PHASE.RANK1 || phase === PHASE.RANK2) {
    const isNatural = phase === PHASE.RANK1;
    const phaseKey = isNatural ? 'rank1' : 'rank2';
    const currentRank = isNatural ? rank1 : rank2;
    const group = currentRank[groupIdx];
    const title = isNatural ? 'Como eu realmente sou' : 'Como os outros esperam que eu seja';
    const subtitle = isNatural
      ? 'Ordene as palavras de "mais parecido comigo" (topo) a "menos parecido" (base).'
      : 'Agora pense em como os outros esperam que você se comporte.';

    return (
      <div className="max-w-[440px] mx-auto px-4 py-6">
        <ProgressBar />
        <PhaseDots count={8} current={groupIdx} />

        <div className="text-center mb-5">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2"
            style={{ background: isNatural ? 'rgba(0,180,216,0.12)' : 'rgba(13,148,136,0.12)', color: isNatural ? '#00B4D8' : '#0D9488' }}>
            {isNatural ? 'Natural' : 'Adaptado'} &middot; Grupo {groupIdx + 1}/8
          </span>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        </div>

        <div className="space-y-0">
          {/* Top label */}
          <div className="text-[10px] text-cyan-400 font-medium mb-1 text-center">Mais parecido comigo</div>
          <div className="space-y-2 mb-1">
            {group.map((item, idx) => (
              <div
                key={item.l}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/[0.08] transition-all"
                style={{ background: '#0F2A4A' }}
              >
                <span className="text-xs font-bold text-gray-500 w-5 text-center">{idx + 1}</span>
                <span className="flex-1 text-sm text-white font-medium">{item.l}</span>
                <div className="flex flex-col gap-0.5">
                  <button
                    disabled={idx === 0}
                    onClick={() => moveItem(phaseKey, groupIdx, idx, -1)}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp size={16} className="text-gray-300" />
                  </button>
                  <button
                    disabled={idx === 3}
                    onClick={() => moveItem(phaseKey, groupIdx, idx, 1)}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown size={16} className="text-gray-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-500 font-medium text-center">Menos parecido comigo</div>
        </div>

        <button
          onClick={() => nextRankGroup(phaseKey)}
          className="mt-6 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide"
          style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)' }}
        >
          {groupIdx < 7 ? 'PRÓXIMO GRUPO' : 'AVANÇAR'}
        </button>
      </div>
    );
  }

  /* ═══════════════════ PAIRS PHASE ═══════════════════ */
  if (phase === PHASE.PAIRS1 || phase === PHASE.PAIRS2) {
    const isNatural = phase === PHASE.PAIRS1;
    const phaseKey = isNatural ? 'pairs1' : 'pairs2';
    const currentPairs = isNatural ? pairs1 : pairs2;
    const pair = FORCED_PAIRS[pairIdx];
    const selected = currentPairs[pairIdx];
    const title = isNatural ? 'O que combina mais comigo' : 'O que os outros esperam de mim';

    return (
      <div className="max-w-[440px] mx-auto px-4 py-6">
        <ProgressBar />
        <PhaseDots count={6} current={pairIdx} />

        <div className="text-center mb-5">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2"
            style={{ background: isNatural ? 'rgba(0,180,216,0.12)' : 'rgba(13,148,136,0.12)', color: isNatural ? '#00B4D8' : '#0D9488' }}>
            {isNatural ? 'Natural' : 'Adaptado'} &middot; Par {pairIdx + 1}/6
          </span>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="text-xs text-gray-400 mt-1">Escolha a opção que mais se aplica.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => selectPair(phaseKey, pairIdx, pair.fa)}
            className="w-full text-left px-4 py-4 rounded-xl border transition-all"
            style={{
              background: selected === pair.fa ? 'rgba(0,180,216,0.12)' : '#0F2A4A',
              borderColor: selected === pair.fa ? '#00B4D8' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: selected === pair.fa ? '#00B4D8' : 'rgba(255,255,255,0.2)' }}>
                {selected === pair.fa && <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />}
              </div>
              <span className="text-sm text-white">{pair.a}</span>
            </div>
          </button>

          <div className="text-center text-[10px] text-gray-600 font-bold tracking-widest">OU</div>

          <button
            onClick={() => selectPair(phaseKey, pairIdx, pair.fb)}
            className="w-full text-left px-4 py-4 rounded-xl border transition-all"
            style={{
              background: selected === pair.fb ? 'rgba(13,148,136,0.12)' : '#0F2A4A',
              borderColor: selected === pair.fb ? '#0D9488' : 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{ borderColor: selected === pair.fb ? '#0D9488' : 'rgba(255,255,255,0.2)' }}>
                {selected === pair.fb && <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />}
              </div>
              <span className="text-sm text-white">{pair.b}</span>
            </div>
          </button>
        </div>

        <button
          disabled={!selected}
          onClick={() => nextPair(phaseKey)}
          className="mt-6 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide disabled:opacity-40 transition-all"
          style={{ background: selected ? 'linear-gradient(135deg, #00B4D8, #0D9488)' : '#374151' }}
        >
          {pairIdx < 5 ? 'PRÓXIMO PAR' : 'AVANÇAR'}
        </button>
      </div>
    );
  }

  /* ═══════════════════ LEARNING PREFERENCES ═══════════════════ */
  if (phase === PHASE.LEARNING) {
    const allRated = Object.values(learnPrefs).every(v => v > 0);
    return (
      <div className="max-w-[440px] mx-auto px-4 py-6">
        <ProgressBar />

        <div className="text-center mb-5">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2"
            style={{ background: 'rgba(0,180,216,0.12)', color: '#00B4D8' }}>
            Preferências de Aprendizagem
          </span>
          <h2 className="text-lg font-bold text-white">Como você prefere aprender?</h2>
          <p className="text-xs text-gray-400 mt-1">Avalie cada formato de 1 a 5 estrelas.</p>
        </div>

        <div className="space-y-3">
          {FORMATS.map(fmt => (
            <div key={fmt.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <span className="text-lg">{fmt.icon}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-white">{fmt.label}</span>
              </div>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onClick={() => setLearnPrefs(prev => ({ ...prev, [fmt.id]: star }))}
                    className="p-0.5 transition-colors"
                  >
                    <Star
                      size={18}
                      className={learnPrefs[fmt.id] >= star ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          disabled={!allRated}
          onClick={calculate}
          className="mt-6 w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide disabled:opacity-40 transition-all"
          style={{ background: allRated ? 'linear-gradient(135deg, #00B4D8, #0D9488)' : '#374151' }}
        >
          CALCULAR RESULTADOS
        </button>
      </div>
    );
  }

  /* ═══════════════════ CALCULATING ═══════════════════ */
  if (phase === PHASE.CALCULATING) {
    return (
      <div className="flex flex-col items-center justify-center h-[70dvh] text-center px-4">
        <Loader2 size={48} className="animate-spin text-cyan-400 mb-4" />
        <h2 className="text-lg font-bold text-white mb-1">Calculando seu perfil...</h2>
        <p className="text-sm text-gray-400">Analisando suas respostas e gerando competências.</p>
      </div>
    );
  }

  /* ═══════════════════ RESULTS ═══════════════════ */
  if (phase === PHASE.RESULTS && results) {
    const { disc, dA, lead, comp, profile } = results;

    // Sort competencies for strengths / gaps
    const compEntries = Object.entries(comp).sort((a, b) => b[1] - a[1]);
    const strengths = compEntries.slice(0, 3);
    const gaps = compEntries.slice(-3).reverse();

    const DISCBar = ({ label, natural, adapted, color }) => (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color }}>{label}</span>
            <span className="text-xs text-gray-400">{DISC_LABELS[label]}</span>
          </div>
          <div className="text-xs text-gray-400">
            <span className="font-bold text-white">{Math.round(natural)}</span>
            <span className="mx-1">/</span>
            <span className="text-gray-500">{Math.round(adapted)}</span>
          </div>
        </div>
        {/* Natural bar */}
        <div className="h-2.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, natural)}%`, background: color }} />
        </div>
        {/* Adapted bar (lighter) */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="h-full rounded-full transition-all duration-700 opacity-50" style={{ width: `${Math.min(100, adapted)}%`, background: color }} />
        </div>
      </div>
    );

    return (
      <div className="max-w-[500px] mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-1">Seu Perfil Comportamental</h1>
          <p className="text-sm text-gray-400">{formName}</p>
          <span className="inline-block mt-2 text-sm font-bold uppercase tracking-widest px-5 py-2 rounded-full"
            style={{ background: 'linear-gradient(135deg, rgba(0,180,216,0.15), rgba(13,148,136,0.15))', color: '#00B4D8' }}>
            {profile}
          </span>
        </div>

        {saveError && (
          <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
            Erro ao salvar: {saveError}
          </div>
        )}

        {/* DISC Scores */}
        <div className="rounded-xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white">Dimensões DISC</h3>
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white inline-block" /> Natural</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/30 inline-block" /> Adaptado</span>
            </div>
          </div>
          {['D', 'I', 'S', 'C'].map(f => (
            <DISCBar key={f} label={f} natural={disc[f]} adapted={dA[f]} color={DISC_COLORS[f]} />
          ))}
        </div>

        {/* SVG Radar Chart */}
        <div className="rounded-xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <h3 className="text-sm font-bold text-white mb-3 text-center">Radar DISC</h3>
          <svg viewBox="0 0 200 200" className="w-full max-w-[240px] mx-auto">
            {/* Grid */}
            {[20, 40, 60, 80, 100].map(r => (
              <polygon key={r} points={radarPoints(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            ))}
            {/* Axes */}
            {[[100, 0], [200, 100], [100, 200], [0, 100]].map(([x, y], i) => (
              <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            ))}
            {/* Natural polygon */}
            <polygon
              points={discRadarPoints(disc)}
              fill="rgba(0,180,216,0.15)"
              stroke="#00B4D8"
              strokeWidth="1.5"
            />
            {/* Adapted polygon */}
            <polygon
              points={discRadarPoints(dA)}
              fill="rgba(13,148,136,0.08)"
              stroke="#0D9488"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
            {/* Labels */}
            <text x="100" y="12" textAnchor="middle" fill="#EF4444" fontSize="11" fontWeight="bold">D</text>
            <text x="192" y="104" textAnchor="start" fill="#F59E0B" fontSize="11" fontWeight="bold">I</text>
            <text x="100" y="198" textAnchor="middle" fill="#10B981" fontSize="11" fontWeight="bold">S</text>
            <text x="8" y="104" textAnchor="end" fill="#3B82F6" fontSize="11" fontWeight="bold">C</text>
          </svg>
        </div>

        {/* Leadership */}
        <div className="rounded-xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <h3 className="text-sm font-bold text-white mb-3">Estilo de Liderança</h3>
          {Object.entries(lead).map(([label, value]) => (
            <div key={label} className="mb-2">
              <div className="flex justify-between mb-0.5">
                <span className="text-xs text-gray-300">{label}</span>
                <span className="text-xs font-bold text-white">{Math.round(value)}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full" style={{
                  width: `${Math.min(100, value)}%`,
                  background: DISC_COLORS[LEAD_LABELS[label]],
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* Competencies by DISC dimension */}
        <div className="rounded-xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <h3 className="text-sm font-bold text-white mb-4">16 Competências</h3>
          {Object.entries(COMP_GROUPS).map(([dim, names]) => (
            <div key={dim} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: DISC_COLORS[dim] }}>
                  {dim}
                </span>
                <span className="text-xs font-medium text-gray-400">{DISC_LABELS[dim]}</span>
              </div>
              <div className="space-y-1.5">
                {names.map(name => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-24 flex-shrink-0">{name}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div className="h-full rounded-full" style={{ width: `${comp[name]}%`, background: DISC_COLORS[dim] }} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 w-7 text-right">{Math.round(comp[name])}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Strengths & Gaps */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <h3 className="text-xs font-bold text-emerald-400 mb-2 flex items-center gap-1">
              <Check size={14} /> Top 3 Forças
            </h3>
            <ol className="space-y-1">
              {strengths.map(([name, val], i) => (
                <li key={name} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500">{i + 1}.</span>
                  <span className="text-xs text-white">{name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{Math.round(val)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
            <h3 className="text-xs font-bold text-amber-400 mb-2">Top 3 Desenvolvimento</h3>
            <ol className="space-y-1">
              {gaps.map(([name, val], i) => (
                <li key={name} className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500">{i + 1}.</span>
                  <span className="text-xs text-white">{name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{Math.round(val)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => router.push('/dashboard/perfil-comportamental')}
            className="flex-1 py-3 rounded-xl font-bold text-white text-sm tracking-wide"
            style={{ background: 'linear-gradient(135deg, #00B4D8, #0D9488)' }}
          >
            VER MEU PERFIL
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 py-3 rounded-xl font-bold text-sm tracking-wide border border-white/10 text-gray-300 hover:text-white transition-colors"
          >
            DASHBOARD
          </button>
        </div>
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
