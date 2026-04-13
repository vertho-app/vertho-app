'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, AlertCircle, FileText, ArrowRight } from 'lucide-react';
import { loadPerfilCIS } from './perfil-comportamental-actions';

const COMP_GROUPS = {
  D: [
    { label: 'Ousadia', key: 'comp_ousadia' },
    { label: 'Comando', key: 'comp_comando' },
    { label: 'Objetividade', key: 'comp_objetividade' },
    { label: 'Assertividade', key: 'comp_assertividade' },
  ],
  I: [
    { label: 'Persuasão', key: 'comp_persuasao' },
    { label: 'Extroversão', key: 'comp_extroversao' },
    { label: 'Entusiasmo', key: 'comp_entusiasmo' },
    { label: 'Sociabilidade', key: 'comp_sociabilidade' },
  ],
  S: [
    { label: 'Empatia', key: 'comp_empatia' },
    { label: 'Paciência', key: 'comp_paciencia' },
    { label: 'Persistência', key: 'comp_persistencia' },
    { label: 'Planejamento', key: 'comp_planejamento' },
  ],
  C: [
    { label: 'Organização', key: 'comp_organizacao' },
    { label: 'Detalhismo', key: 'comp_detalhismo' },
    { label: 'Prudência', key: 'comp_prudencia' },
    { label: 'Concentração', key: 'comp_concentracao' },
  ],
};

// Paleta sem vermelho: D=amarelo, I=cinza, S=verde, C=azul
const DISC_COLORS = { D: '#EAB308', I: '#94A3B8', S: '#10B981', C: '#3B82F6' };
const DISC_LABELS = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };

function Bar({ label, value, max, color }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm font-semibold text-gray-200">{label}</span>
        <span className="text-sm font-extrabold" style={{ color }}>{Math.round(value || 0)}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(100, (value || 0) / (max || 100) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function radarPoints(pct) {
  const r = pct, cx = 100, cy = 100;
  return [
    `${cx},${cy - r}`,
    `${cx + r},${cy}`,
    `${cx},${cy + r}`,
    `${cx - r},${cy}`,
  ].join(' ');
}

function discRadarPoints(disc) {
  const cx = 100, cy = 100;
  const scale = v => Math.min(100, Math.max(0, v || 0));
  return [
    `${cx},${cy - scale(disc.D)}`,
    `${cx + scale(disc.I)},${cy}`,
    `${cx},${cy + scale(disc.S)}`,
    `${cx - scale(disc.C)},${cy}`,
  ].join(' ');
}

export default function PerfilComportamentalPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadPerfilCIS(user.email);
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador: c } = data;
  const hasDISC = c.perfil_dominante && (c.d_natural || c.i_natural || c.s_natural || c.c_natural);

  if (!hasDISC) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <AlertCircle size={40} className="text-cyan-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Mapeamento Comportamental</p>
          <p className="text-sm text-gray-400 mb-4">Seu perfil comportamental ainda não foi mapeado. Leva cerca de 8 minutos.</p>
          <button onClick={() => router.push('/dashboard/perfil-comportamental/mapeamento')}
            className="px-6 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            Iniciar Mapeamento
          </button>
        </div>
      </div>
    );
  }

  // Montar estruturas a partir das colunas planas
  const disc = { D: c.d_natural || 0, I: c.i_natural || 0, S: c.s_natural || 0, C: c.c_natural || 0 };
  const dA = { D: c.d_adaptado || 0, I: c.i_adaptado || 0, S: c.s_adaptado || 0, C: c.c_adaptado || 0 };
  const lead = [
    { label: 'Executivo', value: c.lid_executivo || 0, color: DISC_COLORS.D },
    { label: 'Motivador', value: c.lid_motivador || 0, color: DISC_COLORS.I },
    { label: 'Metódico', value: c.lid_metodico || 0, color: DISC_COLORS.S },
    { label: 'Sistemático', value: c.lid_sistematico || 0, color: DISC_COLORS.C },
  ];

  // Flatten das 16 competências para forças/desenvolvimento
  const allComps = Object.entries(COMP_GROUPS).flatMap(([dim, arr]) =>
    arr.map(({ label, key }) => ({ name: label, value: c[key] || 0, dim }))
  );
  const sortedComps = [...allComps].sort((a, b) => b.value - a.value);
  const strengths = sortedComps.slice(0, 3);
  const gaps = sortedComps.slice(-3).reverse();

  return (
    <div className="max-w-[640px] mx-auto px-5 py-8 space-y-4">
      {/* ── Back ── */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-base text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={18} /> Voltar
      </button>

      {/* ── Header ── */}
      <div className="text-center py-6">
        <img src="/logo-vertho.png" alt="Vertho" className="h-11 mx-auto mb-5" />
        <p className="text-base font-extrabold uppercase tracking-[3px] text-cyan-400 mb-4">Seu Perfil Comportamental</p>
        <div className="text-[140px] font-black tracking-[4px] leading-none mb-3"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #FCD34D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          {c.perfil_dominante}
        </div>
        <p className="text-lg text-gray-300">{c.nome_completo}</p>
      </div>

      {/* ── CTA Relatório Completo ── */}
      <button onClick={() => router.push('/dashboard/perfil-comportamental/relatorio')}
        className="w-full rounded-2xl p-4 border border-cyan-400/30 text-left hover:border-cyan-400/60 transition-all"
        style={{ background: 'rgba(6,182,212,0.08)' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'rgba(13,148,136,0.18)' }}>
              <FileText size={18} className="text-cyan-300" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-white">Relatório Completo (5 páginas)</p>
              <p className="text-[11px] text-gray-400">Análise interpretativa do seu perfil + plano de ação. Disponível para baixar em PDF.</p>
            </div>
          </div>
          <ArrowRight size={18} className="text-cyan-300 shrink-0" />
        </div>
      </button>

      {/* ── Radar DISC ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC</p>
        <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto">
          {[25, 50, 75, 100].map(r => (
            <polygon key={r} points={radarPoints(r)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          ))}
          {[[100, 0], [200, 100], [100, 200], [0, 100]].map(([x, y], i) => (
            <line key={i} x1="100" y1="100" x2={x} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          ))}
          <polygon points={discRadarPoints(disc)} fill="rgba(45,212,191,0.12)" stroke="#2DD4BF" strokeWidth="2" />
          <polygon points={discRadarPoints(dA)} fill="rgba(252,211,77,0.08)" stroke="#FCD34D" strokeWidth="1.5" />
          {[{ f: 'D', x: 100, y: v => 100 - v }, { f: 'I', x: v => 100 + v, y: 100 }, { f: 'S', x: 100, y: v => 100 + v }, { f: 'C', x: v => 100 - v, y: 100 }].map(p => {
            const nv = disc[p.f], av = dA[p.f];
            const nx = typeof p.x === 'function' ? p.x(nv) : p.x, ny = typeof p.y === 'function' ? p.y(nv) : p.y;
            const ax = typeof p.x === 'function' ? p.x(av) : p.x, ay = typeof p.y === 'function' ? p.y(av) : p.y;
            return <g key={p.f}><circle cx={nx} cy={ny} r="3.5" fill="#2DD4BF" /><circle cx={ax} cy={ay} r="3.5" fill="#FCD34D" /></g>;
          })}
          <text x="100" y="10" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">D</text>
          <text x="195" y="105" textAnchor="start" fill="#CBD5E1" fontSize="13" fontWeight="700">I</text>
          <text x="100" y="199" textAnchor="middle" fill="#CBD5E1" fontSize="13" fontWeight="700">S</text>
          <text x="5" y="105" textAnchor="end" fill="#CBD5E1" fontSize="13" fontWeight="700">C</text>
        </svg>
        <div className="flex justify-center gap-5 mt-3">
          <span className="text-xs font-bold text-gray-300"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#2DD4BF] mr-1.5" />Natural</span>
          <span className="text-xs font-bold text-gray-300"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FCD34D] mr-1.5" />Adaptado</span>
        </div>
      </div>

      {/* ── Forças / Desenvolvimento ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-green-400 mb-3">Forças</p>
          {strengths.map(s => (
            <p key={s.name} className="text-sm font-bold text-white mt-1.5">{s.name} <span className="text-green-400">{Math.round(s.value)}</span></p>
          ))}
        </div>
        <div className="rounded-2xl p-5 border border-white/[0.04] text-center" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[1.5px] text-amber-400 mb-3">Desenvolvimento</p>
          {gaps.map(g => (
            <p key={g.name} className="text-sm font-bold text-white mt-1.5">{g.name} <span className="text-amber-400">{Math.round(g.value)}</span></p>
          ))}
        </div>
      </div>

      {/* ── DISC Natural ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-gray-400 mb-4">DISC Natural</p>
        {[['Dominância', disc.D, DISC_COLORS.D], ['Influência', disc.I, DISC_COLORS.I], ['Estabilidade', disc.S, DISC_COLORS.S], ['Conformidade', disc.C, DISC_COLORS.C]].map(([l, v, col]) => (
          <Bar key={l} label={l} value={v} max={100} color={col} />
        ))}
      </div>

      {/* ── DISC Adaptado ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-amber-400 mb-1">DISC Adaptado</p>
        <p className="text-xs text-gray-400 mb-4">Como as pessoas esperam que você seja</p>
        {[['Dominância', dA.D, DISC_COLORS.D], ['Influência', dA.I, DISC_COLORS.I], ['Estabilidade', dA.S, DISC_COLORS.S], ['Conformidade', dA.C, DISC_COLORS.C]].map(([l, v, col]) => (
          <Bar key={l} label={l} value={v} max={100} color={col} />
        ))}
      </div>

      {/* ── Liderança ── */}
      <div className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
        <p className="text-xs font-extrabold uppercase tracking-[2px] text-cyan-400 mb-4">Liderança</p>
        {lead.map(l => (
          <Bar key={l.label} label={l.label} value={l.value} max={50} color={l.color} />
        ))}
      </div>

      {/* ── Competências por dimensão ── */}
      {Object.entries(COMP_GROUPS).map(([dim, comps]) => (
        <div key={dim} className="rounded-2xl p-5 border border-white/[0.04]" style={{ background: 'rgba(17,31,54,0.85)' }}>
          <p className="text-xs font-extrabold uppercase tracking-[2px] mb-4" style={{ color: DISC_COLORS[dim] }}>
            Competências — {DISC_LABELS[dim]}
          </p>
          {comps.map(({ label, key }) => (
            <Bar key={key} label={label} value={c[key] || 0} max={100} color={DISC_COLORS[dim]} />
          ))}
        </div>
      ))}
    </div>
  );
}
