'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import { loadPerfilCIS } from './perfil-cis-actions';

const DISC_DIMENSIONS = [
  {
    key: 'd_natural',
    label: 'D',
    fullName: 'Dominancia',
    color: '#EF4444',
    description: 'Foco em resultados, assertividade, tomada de decisao rapida. Pessoas com D alto sao diretas, competitivas e orientadas a desafios.',
  },
  {
    key: 'i_natural',
    label: 'I',
    fullName: 'Influencia',
    color: '#F59E0B',
    description: 'Foco em pessoas, comunicacao, entusiasmo. Pessoas com I alto sao sociaveis, persuasivas e otimistas.',
  },
  {
    key: 's_natural',
    label: 'S',
    fullName: 'Estabilidade',
    color: '#10B981',
    description: 'Foco em cooperacao, paciencia, consistencia. Pessoas com S alto sao calmas, leais e boas ouvintes.',
  },
  {
    key: 'c_natural',
    label: 'C',
    fullName: 'Conformidade',
    color: '#3B82F6',
    description: 'Foco em qualidade, precisao, analise. Pessoas com C alto sao detalhistas, sistematicas e valorizam padroes.',
  },
];

export default function PerfilCISPage() {
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
      if (result.error) { setError(result.error); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error) return <div className="p-6 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const { colaborador } = data;
  const hasDISC = colaborador.perfil_dominante && (colaborador.d_natural || colaborador.i_natural || colaborador.s_natural || colaborador.c_natural);

  if (!hasDISC) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <AlertCircle size={40} className="text-gray-500 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Perfil nao disponivel</p>
          <p className="text-sm text-gray-400">Seu mapeamento comportamental ainda nao foi realizado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Back */}
      <button onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-white">Perfil Comportamental</h1>
        <p className="text-sm text-gray-400 mt-1">{colaborador.nome_completo}</p>
        <span className="inline-block mt-2 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-cyan-400/15 text-cyan-400">
          {colaborador.perfil_dominante}
        </span>
      </div>

      {/* DISC Bars */}
      <div className="rounded-xl p-5 border border-white/[0.06] space-y-4" style={{ background: '#0F2A4A' }}>
        {DISC_DIMENSIONS.map(dim => {
          const value = colaborador[dim.key] || 0;
          return (
            <div key={dim.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: dim.color }}>{dim.label}</span>
                  <span className="text-sm text-gray-300">{dim.fullName}</span>
                </div>
                <span className="text-sm font-bold text-white">{value}%</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ background: '#1F2937' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${value}%`, background: dim.color }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Dimension explanations */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-300">Sobre cada dimensao</h2>
        {DISC_DIMENSIONS.map(dim => {
          const value = colaborador[dim.key] || 0;
          const isHigh = value >= 50;
          return (
            <div key={dim.key} className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: dim.color }}>
                  {dim.label}
                </div>
                <span className="text-sm font-bold text-white">{dim.fullName}</span>
                {isHigh && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ color: dim.color, background: dim.color + '15' }}>Alto</span>}
              </div>
              <p className="text-[12px] text-gray-400 leading-relaxed">{dim.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
