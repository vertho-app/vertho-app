'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import { loadTrilhaAtual, registrarEvidencia } from '../praticar-actions';

export default function EvidenciaPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [texto, setTexto] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }

      const result = await loadTrilhaAtual(user.email);
      if (result.error) { setError(result.error); }
      else if (!result.semAtiva) { setError('Nenhuma trilha ativa'); }
      else { setData(result); }
      setLoading(false);
    }
    init();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!texto.trim() || submitting) return;

    setSubmitting(true);
    setError('');

    const result = await registrarEvidencia(
      data.colaborador.id,
      data.colaborador.empresa_id,
      data.semanaAtual,
      texto
    );

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      setSuccess(true);
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;
  if (error && !data) return <div className="p-6 text-center text-gray-400">{error}</div>;

  if (success) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <div className="rounded-xl p-6 border border-emerald-500/30 text-center" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
          <CheckCircle2 size={48} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Evidencia registrada!</p>
          <p className="text-sm text-gray-400 mb-4">Parabens! Voce ganhou 5 pontos por esta semana.</p>
          <button onClick={() => router.push('/dashboard/praticar')}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
            style={{ background: '#0D9488' }}>
            Voltar para Praticar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 py-6 space-y-4">
      {/* Back */}
      <button onClick={() => router.push('/dashboard/praticar')}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Registrar Evidencia</h1>
        <p className="text-sm text-gray-400 mt-1">Semana {data.semanaAtual} de {data.totalSemanas}</p>
      </div>

      {/* Week info */}
      <div className="rounded-xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <p className="text-sm text-gray-300">
          Descreva o que voce praticou ou implementou esta semana com base no conteudo da pilula.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            O que voce praticou esta semana?
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Descreva aqui suas acoes, aprendizados e resultados..."
            rows={6}
            className="w-full rounded-xl p-4 text-sm text-white placeholder-gray-500 border border-white/[0.06] focus:border-cyan-400/50 focus:outline-none resize-none transition-colors"
            style={{ background: '#0F2A4A' }}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button type="submit" disabled={!texto.trim() || submitting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ background: '#0D9488' }}>
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {submitting ? 'Enviando...' : 'Enviar Evidencia'}
        </button>
      </form>
    </div>
  );
}
