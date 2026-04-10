'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ArrowLeft, AlertCircle, Download, RefreshCw, Sparkles } from 'lucide-react';
import {
  loadBehavioralReport,
  regenerarRelatorioComportamental,
  baixarRelatorioComportamentalPdf,
} from './relatorio-actions';

const NAVY = '#0F2B54';
const TEAL = '#0D9488';
const DISC = {
  D: { bar: '#EAB308', bg: 'rgba(234,179,8,0.10)', text: '#FDE68A' },
  I: { bar: '#F59E0B', bg: 'rgba(245,158,11,0.10)', text: '#FCD34D' },
  S: { bar: '#10B981', bg: 'rgba(16,185,129,0.10)', text: '#6EE7B7' },
  C: { bar: '#3B82F6', bg: 'rgba(59,130,246,0.10)', text: '#93C5FD' },
};

function DiscBars({ scores, mutedColor }) {
  return (
    <div className="space-y-2">
      {['D', 'I', 'S', 'C'].map(d => {
        const v = Math.max(0, Math.min(100, scores[d] || 0));
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-4 text-xs font-extrabold text-gray-400">{d}</span>
            <div className="flex-1 h-3 rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: mutedColor || DISC[d].bar }} />
            </div>
            <span className="w-7 text-right text-[11px] font-bold text-gray-300">{Math.round(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function QuadrantCard({ letter, title, n, a, traco, descricao, adaptacao }) {
  const c = DISC[letter];
  return (
    <div className="rounded-xl p-4 border" style={{ background: c.bg, borderColor: 'rgba(255,255,255,0.08)', borderLeft: `4px solid ${c.bar}` }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
          <p className="text-base font-extrabold text-white mt-0.5">{traco || '—'}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-[9px] text-gray-500">Natural</p>
          <p className="text-xl font-black" style={{ color: c.text }}>{Math.round(n)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{descricao}</p>
      {adaptacao && (
        <p className="text-[10px] text-gray-400 italic mt-2 pt-2 border-t border-white/10">
          Adaptado {Math.round(a)} — {adaptacao}
        </p>
      )}
    </div>
  );
}

export default function RelatorioComportamentalPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setUserEmail(user.email);
      const result = await loadBehavioralReport(user.email);
      if (result.error) setError(result.error);
      else setData(result);
      setLoading(false);
    }
    init();
  }, []);

  async function handleRegenerar() {
    if (!userEmail) return;
    setRegenerating(true);
    setError('');
    const result = await regenerarRelatorioComportamental(userEmail);
    setRegenerating(false);
    if (result.error) setError(result.error);
    else setData(result);
  }

  async function handleDownload() {
    if (!userEmail) return;
    setDownloading(true);
    setError('');
    const result = await baixarRelatorioComportamentalPdf(userEmail);
    setDownloading(false);
    if (result.error) { setError(result.error); return; }
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-cyan-400" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl p-6 border border-white/[0.06] text-center" style={{ background: '#0F2A4A' }}>
          <AlertCircle size={40} className="text-cyan-400 mx-auto mb-3" />
          <p className="text-lg font-bold text-white mb-1">Relatório indisponível</p>
          <p className="text-sm text-gray-400 mb-4">{error}</p>
          <button onClick={() => router.push('/dashboard/perfil-comportamental/mapeamento')}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            Iniciar mapeamento
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { raw, texts } = data;

  return (
    <div className="max-w-[760px] mx-auto px-5 py-6 space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handleRegenerar} disabled={regenerating}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-300 px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50">
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Regerar textos
          </button>
          <button onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-1.5 text-xs font-extrabold text-white px-4 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2 border border-red-400/30 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div className="text-center py-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[3px] text-cyan-400 mb-1">
          Relatório Comportamental
        </p>
        <h1 className="text-2xl font-extrabold text-white">{raw.nome}</h1>
        <p className="text-xs text-gray-500 mt-1">
          Realizado em {new Date(raw.data_realizacao).toLocaleDateString('pt-BR')}
        </p>
        {data.cached && (
          <p className="text-[10px] text-gray-500 mt-1">
            <Sparkles size={10} className="inline mb-0.5" /> Texto interpretativo em cache
          </p>
        )}
      </div>

      {/* Síntese */}
      <div className="rounded-2xl p-5 border border-cyan-400/20" style={{ background: 'rgba(13,148,136,0.08)' }}>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 mb-2">Síntese do perfil</p>
        <p className="text-sm text-gray-200 leading-relaxed">{texts.sintese_perfil}</p>
      </div>

      {/* Snapshot DISC */}
      <div className="rounded-2xl p-5 border border-white/[0.06] grid grid-cols-2 gap-5" style={{ background: '#0F2A4A' }}>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-3 text-center">
            Natural — quem você é
          </p>
          <DiscBars scores={raw.disc_natural} />
        </div>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400 mb-3 text-center">
            Adaptado — exigência do ambiente
          </p>
          <DiscBars scores={raw.disc_adaptado} mutedColor="#94A3B8" />
        </div>
      </div>

      {/* 4 quadrantes */}
      <div>
        <h2 className="text-base font-extrabold text-white mb-3">Como Você Funciona</h2>
        <div className="grid grid-cols-2 gap-3">
          <QuadrantCard letter="D" title="Como lida com desafios"
            n={raw.disc_natural.D} a={raw.disc_adaptado.D}
            traco={texts.quadrante_D?.titulo_traco} descricao={texts.quadrante_D?.descricao} adaptacao={texts.quadrante_D?.adaptacao} />
          <QuadrantCard letter="I" title="Como lida com pessoas"
            n={raw.disc_natural.I} a={raw.disc_adaptado.I}
            traco={texts.quadrante_I?.titulo_traco} descricao={texts.quadrante_I?.descricao} adaptacao={texts.quadrante_I?.adaptacao} />
          <QuadrantCard letter="S" title="Como dita o ritmo"
            n={raw.disc_natural.S} a={raw.disc_adaptado.S}
            traco={texts.quadrante_S?.titulo_traco} descricao={texts.quadrante_S?.descricao} adaptacao={texts.quadrante_S?.adaptacao} />
          <QuadrantCard letter="C" title="Como lida com regras"
            n={raw.disc_natural.C} a={raw.disc_adaptado.C}
            traco={texts.quadrante_C?.titulo_traco} descricao={texts.quadrante_C?.descricao} adaptacao={texts.quadrante_C?.adaptacao} />
        </div>
      </div>

      {/* Top 5 forças/desenvolver */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mb-3">5 maiores forças</p>
          <div className="space-y-2">
            {(texts.top5_forcas || []).map((f, i) => {
              const comp = raw.competencias.find(c => c.nome === f.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-emerald-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{f.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{f.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl p-4 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-3">5 oportunidades</p>
          <div className="space-y-2">
            {(texts.top5_desenvolver || []).map((d, i) => {
              const comp = raw.competencias.find(c => c.nome === d.competencia);
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-base font-black text-amber-400 w-7 text-right">
                    {comp ? Math.round(comp.natural) : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">{d.competencia}</p>
                    <p className="text-[10px] text-gray-400 leading-relaxed">{d.frase}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Liderança */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <h2 className="text-sm font-extrabold text-white mb-3">Estilo de Liderança</h2>
        <p className="text-sm text-gray-300 leading-relaxed mb-3">{texts.lideranca_sintese}</p>
        <div className="rounded-lg p-3 border-l-2 border-amber-400" style={{ background: 'rgba(245,158,11,0.08)' }}>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-1">Oportunidades</p>
          <p className="text-xs text-gray-300">{texts.lideranca_trabalhar}</p>
        </div>
      </div>

      {/* Pontos sob pressão */}
      <div className="rounded-2xl p-5 border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
        <h2 className="text-sm font-extrabold text-white mb-1">Pontos a desenvolver sob pressão</h2>
        <p className="text-[10px] text-gray-500 mb-3">
          Comportamentos que perfis {raw.perfil_dominante} podem apresentar em momentos de estresse
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(texts.pontos_desenvolver_pressao || []).map((p, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-md" style={{ background: 'rgba(15,42,74,0.6)' }}>
              <div className="w-3 h-3 rounded-sm border-2 border-amber-400 mt-0.5 shrink-0" />
              <span className="text-[11px] text-gray-200 leading-relaxed">{p}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-center pt-2 pb-6">
        <button onClick={handleDownload} disabled={downloading}
          className="px-6 py-3 rounded-xl text-sm font-extrabold text-white inline-flex items-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
          {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Baixar relatório completo (PDF)
        </button>
      </div>
    </div>
  );
}
