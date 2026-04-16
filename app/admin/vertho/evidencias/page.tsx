'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { ArrowLeft, Loader2, Sparkles, ChevronRight, X } from 'lucide-react';
import { listarEvidencias, loadEvidenciaDetalhe } from './actions';

const QUALIDADE_COR = {
  alta: 'text-emerald-300',
  media: 'text-amber-300',
  baixa: 'text-red-300',
};
const DESAFIO_COR = {
  sim: 'text-emerald-400',
  parcial: 'text-amber-400',
  nao: 'text-red-400',
};

export default function EvidenciasPage() {
  const router = useRouter();
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroQualidade, setFiltroQualidade] = useState('todos');
  const [empresaId, setEmpresaId] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEmpresaId(new URLSearchParams(window.location.search).get('empresa'));
  }, []);
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const r = await listarEvidencias({ qualidade: filtroQualidade, empresaId });
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroQualidade, empresaId]);

  async function abrir(id) {
    setLoadingDetalhe(true);
    setDetalhe({ id });
    const r = await loadEvidenciaDetalhe(id);
    setLoadingDetalhe(false);
    if (r.error) { setError(r.error); setDetalhe(null); return; }
    setDetalhe({ ...r.detalhe, id });
  }

  if (error && !rows.length) return <div className="min-h-screen flex items-center justify-center"><p className="text-red-400">{error}</p></div>;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}?fase=4` : '/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles size={20} className="text-purple-400" /> Evidências Semanais — Interna Vertho
          </h1>
          <p className="text-xs text-gray-500">Conversas socráticas das semanas 1-12 + extração estruturada por IA.</p>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card label="Total" valor={resumo.total} cor="text-white" />
          <Card label="Qualidade Alta" valor={resumo.alta} cor="text-emerald-300" />
          <Card label="Desafio Sim" valor={resumo.desafio_sim} cor="text-emerald-400" />
          <Card label="Desafio Não" valor={resumo.desafio_nao} cor="text-red-400" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'alta', 'media', 'baixa'].map(s => (
          <button key={s} onClick={() => setFiltroQualidade(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              filtroQualidade === s ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {s === 'todos' ? 'Todas' : `Qualidade ${s}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-cyan-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">Nenhuma evidência pra esse filtro.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <button key={r.id} onClick={() => abrir(r.id)}
              className="w-full text-left rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition-all">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-14 text-center">
                  <p className="text-[9px] uppercase text-gray-500 tracking-widest">Sem</p>
                  <p className="text-xl font-extrabold text-cyan-300">{r.semana}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{r.colaborador}</p>
                    <span className="text-[10px] text-gray-400">· {r.cargo}</span>
                    <span className="text-[10px] text-gray-500">· {r.empresa}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                    {r.competencia} · <span className="text-cyan-400">{r.descritor}</span>
                  </p>
                  <div className="flex gap-3 text-[10px] mt-1 flex-wrap">
                    {r.qualidade && <span>Qualidade: <b className={QUALIDADE_COR[r.qualidade]}>{r.qualidade}</b></span>}
                    {r.desafioRealizado && <span>Desafio: <b className={DESAFIO_COR[r.desafioRealizado]}>{r.desafioRealizado}</b></span>}
                  </div>
                  {r.insight && <p className="text-[11px] text-gray-300 mt-1 italic line-clamp-2">💡 {r.insight}</p>}
                </div>
                <ChevronRight size={14} className="text-gray-500 shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {detalhe && (
        <DetalheModal detalhe={detalhe} loading={loadingDetalhe} onClose={() => setDetalhe(null)} />
      )}
    </div>
  );
}

function Card({ label, valor, cor }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase text-gray-500 tracking-widest">{label}</p>
      <p className={`text-2xl font-extrabold ${cor}`}>{valor}</p>
    </div>
  );
}

function DetalheModal({ detalhe, loading, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">
            Evidência · Sem {detalhe.semana}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading || !detalhe.colaborador ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Contexto</p>
              <p className="text-white">{detalhe.colaborador} ({detalhe.cargo}) · {detalhe.empresa}</p>
              <p className="text-xs text-gray-400">
                {detalhe.competencia} · descritor <span className="text-cyan-400">{detalhe.descritor}</span> · DISC {detalhe.perfilDominante || '—'}
              </p>
            </section>

            {detalhe.desafio && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-amber-400 mb-1">Desafio da Semana</p>
                <p className="text-xs text-gray-300 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">{detalhe.desafio}</p>
              </section>
            )}

            <section>
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Extração Estruturada</p>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1 text-[11px]">
                {detalhe.extracao.desafio_realizado && (
                  <p><span className="text-gray-400">Desafio:</span> <b className={DESAFIO_COR[detalhe.extracao.desafio_realizado]}>{detalhe.extracao.desafio_realizado}</b></p>
                )}
                {detalhe.extracao.qualidade_reflexao && (
                  <p><span className="text-gray-400">Qualidade da reflexão:</span> <b className={QUALIDADE_COR[detalhe.extracao.qualidade_reflexao]}>{detalhe.extracao.qualidade_reflexao}</b></p>
                )}
                {detalhe.extracao.relato_resumo && <p className="text-gray-300">📝 {detalhe.extracao.relato_resumo}</p>}
                {detalhe.extracao.insight_principal && <p className="text-emerald-200">💡 {detalhe.extracao.insight_principal}</p>}
                {detalhe.extracao.compromisso_proxima && <p className="text-cyan-200">🎯 {detalhe.extracao.compromisso_proxima}</p>}
              </div>
            </section>

            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Transcript da Conversa ({detalhe.transcript.length} mensagens)</p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {detalhe.transcript.map((m, i) => (
                  <div key={i} className={`text-xs rounded-lg p-2.5 ${
                    m.role === 'user' ? 'bg-cyan-500/10 border border-cyan-500/20 ml-8' : 'bg-white/5 border border-white/10 mr-8'
                  }`}>
                    <p className="text-[9px] uppercase text-gray-500 mb-1">{m.role === 'user' ? 'Colab' : 'IA'}{m.turn && ` · turn ${m.turn}`}</p>
                    <p className="text-gray-200 whitespace-pre-wrap">{m.content}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
