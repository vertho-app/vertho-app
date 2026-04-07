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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

function computeCompetencies(disc, dA) {
  // Vetor usa valores ABSOLUTOS do adaptado (não deltas) — compatível com regressão GAS
  const vec = [1, disc.D, disc.I, disc.S, disc.C, dA.D, dA.I, dA.S, dA.C];
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
  const [rank1, setRank1] = useState(() => RANKING_GROUPS.map(g => shuffle([...g])));
  const [rank2, setRank2] = useState(() => RANKING_GROUPS.map(g => shuffle([...g])));

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
    const label = isNatural ? 'Natural' : 'Adaptado';

    // Drag state
    const handleDragStart = (e, idx) => { e.dataTransfer.setData('text/plain', idx); };
    const handleDragOver = (e) => { e.preventDefault(); };
    const handleDrop = (e, toIdx) => {
      e.preventDefault();
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      if (!isNaN(fromIdx) && fromIdx !== toIdx) moveItem(phaseKey, groupIdx, fromIdx, toIdx - fromIdx);
    };

    return (
      <div className="max-w-[480px] mx-auto px-4 py-6">
        {/* Progress header */}
        <div className="flex justify-between text-[11px] text-gray-500 font-medium mb-4">
          <span>{label} — Rankings</span>
          <span>{progressPct}%</span>
        </div>

        {/* Phase tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400 mb-1">{label}</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-2">Grupo {String(groupIdx + 1).padStart(2, '0')}</h1>

        {/* Dots */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={`w-[7px] h-[7px] rounded-full transition-all ${i < groupIdx ? 'bg-teal-500' : i === groupIdx ? 'bg-cyan-400 shadow-[0_0_8px_rgba(0,180,216,0.5)]' : 'bg-white/[0.08]'}`} />
          ))}
        </div>

        {/* Top label */}
        <p className="text-center text-sm font-semibold text-green-400 mb-3">👍 MAIS PARECIDO</p>

        {/* Ranking cards */}
        <div className="space-y-2 mb-3">
          {group.map((item, idx) => (
            <div
              key={item.l + idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, idx)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/[0.04] cursor-grab active:cursor-grabbing active:border-cyan-400/40 active:scale-[1.02] transition-all"
              style={{ background: '#182B48' }}
            >
              <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold flex-shrink-0"
                style={{ background: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>
                {idx + 1}
              </span>
              <span className="flex-1 text-[13px] text-white font-semibold">{item.l}</span>
              <div className="flex gap-1">
                <button
                  disabled={idx === 0}
                  onClick={() => moveItem(phaseKey, groupIdx, idx, -1)}
                  className="w-[38px] h-[38px] rounded-lg flex items-center justify-center text-gray-400 hover:bg-cyan-400 hover:text-[#0C1829] disabled:opacity-[0.15] transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronUp size={16} strokeWidth={3} />
                </button>
                <button
                  disabled={idx === 3}
                  onClick={() => moveItem(phaseKey, groupIdx, idx, 1)}
                  className="w-[38px] h-[38px] rounded-lg flex items-center justify-center text-gray-400 hover:bg-cyan-400 hover:text-[#0C1829] disabled:opacity-[0.15] transition-all active:scale-90"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <ChevronDown size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom label */}
        <p className="text-center text-sm font-semibold text-rose-400 mb-6">👎 MENOS PARECIDO</p>

        {/* Advance button */}
        <button
          onClick={() => nextRankGroup(phaseKey)}
          className="w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          AVANÇAR
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
    const label = isNatural ? 'Natural' : 'Adaptado';

    return (
      <div className="max-w-[480px] mx-auto px-4 py-6">
        {/* Progress header */}
        <div className="flex justify-between items-center text-[11px] text-gray-500 font-medium mb-1">
          <span>{label} — Pares</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-[3px] rounded-full overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2DD4BF, #FCD34D)' }} />
        </div>

        {/* Phase tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400 mb-1">{label} — ESCOLHA RÁPIDA</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-2">Par {pairIdx + 1}/6</h1>

        {/* Dots */}
        <div className="flex gap-1 mb-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`w-[7px] h-[7px] rounded-full transition-all ${i < pairIdx ? 'bg-teal-500' : i === pairIdx ? 'bg-cyan-400 shadow-[0_0_8px_rgba(0,180,216,0.5)]' : 'bg-white/[0.08]'}`} />
          ))}
        </div>

        {/* Question */}
        <p className="text-center text-sm font-semibold text-gray-300 mb-4">Qual te descreve melhor?</p>

        {/* Option A */}
        <button
          onClick={() => selectPair(phaseKey, pairIdx, pair.fa)}
          className="w-full text-center px-5 py-5 rounded-2xl border-2 transition-all mb-2"
          style={{
            background: selected === pair.fa ? 'rgba(45,212,191,0.08)' : '#182B48',
            borderColor: selected === pair.fa ? '#2DD4BF' : 'transparent',
            boxShadow: selected === pair.fa ? '0 0 16px rgba(45,212,191,0.15)' : 'none',
          }}
        >
          <span className="text-[14px] font-semibold text-white leading-relaxed">{pair.a}</span>
        </button>

        {/* OU */}
        <p className="text-center text-[12px] font-extrabold text-gray-500 tracking-[2px] py-1.5">OU</p>

        {/* Option B */}
        <button
          onClick={() => selectPair(phaseKey, pairIdx, pair.fb)}
          className="w-full text-center px-5 py-5 rounded-2xl border-2 transition-all"
          style={{
            background: selected === pair.fb ? 'rgba(45,212,191,0.08)' : '#182B48',
            borderColor: selected === pair.fb ? '#2DD4BF' : 'transparent',
            boxShadow: selected === pair.fb ? '0 0 16px rgba(45,212,191,0.15)' : 'none',
          }}
        >
          <span className="text-[14px] font-semibold text-white leading-relaxed">{pair.b}</span>
        </button>

        {/* Advance */}
        <button
          disabled={!selected}
          onClick={() => nextPair(phaseKey)}
          className="mt-5 w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase disabled:opacity-30 transition-all"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          AVANÇAR
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
          <span>Preferências de Aprendizagem</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-[3px] rounded-full overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #2DD4BF, #FCD34D)' }} />
        </div>

        {/* Tag + title */}
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400 mb-1">Última Etapa</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Como você aprende melhor?</h1>
        <p className="text-[13px] text-gray-400 mb-5">Dê de 1 a 5 estrelas para cada formato:</p>

        {/* Format rows */}
        <div className="space-y-2">
          {FORMATS.map(fmt => (
            <div key={fmt.id} className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{ background: '#182B48' }}>
              <span className="text-[12px] shrink-0">{fmt.icon}</span>
              <span className="flex-1 text-[12px] font-semibold text-white leading-snug">{fmt.label}</span>
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
          VER MEU PERFIL →
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
    const compEntries = Object.entries(comp).sort((a, b) => b[1] - a[1]);
    const strengths = compEntries.slice(0, 3);
    const gaps = compEntries.slice(-3).reverse();

    const Bar = ({ label, value, max, color }) => (
      <div className="mb-2">
        <div className="flex justify-between mb-0.5">
          <span className="text-[11px] font-semibold text-gray-200">{label}</span>
          <span className="text-[11px] font-extrabold" style={{ color }}>{Math.round(value)}</span>
        </div>
        <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, value / (max || 100) * 100)}%`, background: color }} />
        </div>
      </div>
    );

    const sortedPrefs = FORMATS.slice().sort((a, b) => (learnPrefs[b.id] || 0) - (learnPrefs[a.id] || 0));

    return (
      <div className="max-w-[480px] mx-auto px-4 py-6 space-y-3">
        {/* ── Header ── */}
        <div className="text-center py-4">
          <img src="/logo-vertho.png" alt="Vertho" className="h-7 mx-auto mb-3" />
          <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-cyan-400 mb-2">Seu Perfil Comportamental</p>
          <div className="text-[52px] font-black tracking-[5px] leading-none mb-1"
            style={{ fontFamily: "'Fraunces', Georgia, serif", background: 'linear-gradient(135deg, #2DD4BF, #FCD34D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {profile}
          </div>
          <p className="text-[11px] text-gray-500">{formName || userName}</p>
        </div>

        {saveError && <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">Erro ao salvar: {saveError}</div>}

        {/* ── Radar DISC ── */}
        <div className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-gray-500 mb-3">DISC</p>
          <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
            {[25, 50, 75, 100].map(r => (
              <polygon key={r} points={radarPoints(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            ))}
            {[[100, 0], [200, 100], [100, 200], [0, 100]].map(([x, y], i) => (
              <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            ))}
            <polygon points={discRadarPoints(disc)} fill="rgba(45,212,191,0.1)" stroke="#2DD4BF" strokeWidth="2" />
            <polygon points={discRadarPoints(dA)} fill="rgba(251,113,133,0.05)" stroke="#FB7185" strokeWidth="1.5" />
            {/* Dots */}
            {[{ f: 'D', x: 100, y: v => 100 - v }, { f: 'I', x: v => 100 + v, y: 100 }, { f: 'S', x: 100, y: v => 100 + v }, { f: 'C', x: v => 100 - v, y: 100 }].map(p => {
              const nv = disc[p.f], av = dA[p.f];
              const nx = typeof p.x === 'function' ? p.x(nv) : p.x, ny = typeof p.y === 'function' ? p.y(nv) : p.y;
              const ax = typeof p.x === 'function' ? p.x(av) : p.x, ay = typeof p.y === 'function' ? p.y(av) : p.y;
              return <g key={p.f}><circle cx={nx} cy={ny} r="3" fill="#2DD4BF" /><circle cx={ax} cy={ay} r="3" fill="#FB7185" /></g>;
            })}
            <text x="100" y="10" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">D</text>
            <text x="195" y="104" textAnchor="start" fill="#94A3B8" fontSize="10" fontWeight="600">I</text>
            <text x="100" y="198" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600">S</text>
            <text x="5" y="104" textAnchor="end" fill="#94A3B8" fontSize="10" fontWeight="600">C</text>
          </svg>
          <div className="flex justify-center gap-4 mt-2">
            <span className="text-[10px] font-bold"><span className="inline-block w-2 h-2 rounded-full bg-[#2DD4BF] mr-1" />Natural</span>
            <span className="text-[10px] font-bold"><span className="inline-block w-2 h-2 rounded-full bg-[#FB7185] mr-1" />Adaptado</span>
          </div>
        </div>

        {/* ── Forças / Desenvolvimento ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl p-4 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
            <p className="text-[9px] font-extrabold uppercase tracking-[1px] text-green-400 mb-2">Forças</p>
            {strengths.map(([name, val]) => (
              <p key={name} className="text-[11px] font-bold text-white mt-1">{name} <span className="text-green-400">{Math.round(val)}</span></p>
            ))}
          </div>
          <div className="rounded-2xl p-4 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
            <p className="text-[9px] font-extrabold uppercase tracking-[1px] text-rose-400 mb-2">Desenvolvimento</p>
            {gaps.map(([name, val]) => (
              <p key={name} className="text-[11px] font-bold text-white mt-1">{name} <span className="text-rose-400">{Math.round(val)}</span></p>
            ))}
          </div>
        </div>

        {/* ── DISC Natural ── */}
        <div className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-gray-500 mb-3">DISC Natural</p>
          {[['Dominância', disc.D, '#EF4444'], ['Influência', disc.I, '#FBBF24'], ['Estabilidade', disc.S, '#22C55E'], ['Conformidade', disc.C, '#3B82F6']].map(([l, v, c]) => (
            <Bar key={l} label={l} value={v} max={100} color={c} />
          ))}
        </div>

        {/* ── DISC Adaptado ── */}
        <div className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-rose-400 mb-1">DISC Adaptado</p>
          <p className="text-[10px] text-gray-500 mb-3">Como as pessoas esperam que você seja</p>
          {[['Dominância', dA.D, '#EF4444'], ['Influência', dA.I, '#FBBF24'], ['Estabilidade', dA.S, '#22C55E'], ['Conformidade', dA.C, '#3B82F6']].map(([l, v, c]) => (
            <Bar key={l} label={l} value={v} max={100} color={c} />
          ))}
        </div>

        {/* ── Liderança ── */}
        <div className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-cyan-400 mb-3">Liderança</p>
          {Object.entries(lead).map(([l, v]) => (
            <Bar key={l} label={l} value={v} max={50} color={DISC_COLORS[LEAD_LABELS[l]]} />
          ))}
        </div>

        {/* ── Competências por dimensão ── */}
        {Object.entries(COMP_GROUPS).map(([dim, names]) => (
          <div key={dim} className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
            <p className="text-[10px] font-extrabold uppercase tracking-[2px] mb-3" style={{ color: DISC_COLORS[dim] }}>
              Competências — {DISC_LABELS[dim]}
            </p>
            {names.map(name => (
              <Bar key={name} label={name} value={comp[name]} max={100} color={DISC_COLORS[dim]} />
            ))}
          </div>
        ))}

        {/* ── Preferências de Aprendizagem ── */}
        <div className="rounded-2xl p-4 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-[2px] text-amber-400 mb-3">Preferências de Aprendizagem</p>
          {sortedPrefs.map(f => {
            const stars = learnPrefs[f.id] || 0;
            const color = stars >= 4 ? '#FCD34D' : stars >= 3 ? '#94A3B8' : '#64748B';
            return (
              <div key={f.id} className="flex items-center gap-2 mb-1.5">
                <span className="text-[12px]">{f.icon}</span>
                <span className="flex-1 text-[12px] font-semibold text-white">{f.label}</span>
                <span className="text-[12px] tracking-[1px]" style={{ color }}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
              </div>
            );
          })}
        </div>

        {/* ── Actions ── */}
        <button
          onClick={() => router.push('/dashboard/perfil-comportamental')}
          className="w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          <span className="text-lg">📄</span> BAIXAR RELATÓRIO PDF
        </button>
        <p className="text-[11px] text-gray-500 text-center">Relatório completo personalizado</p>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 rounded-xl font-bold text-sm tracking-wide text-gray-300 hover:text-white transition-colors"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          Voltar para o app
        </button>

        <p className="text-[10px] text-gray-600 text-center pb-4">Vertho © 2026 — Instrumento Proprietário v1</p>
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
