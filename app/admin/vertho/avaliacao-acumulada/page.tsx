'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, ChevronRight, X, RefreshCw } from 'lucide-react';
import { listarAvaliacoesAcumuladas, loadAvaliacaoAcumuladaDetalhe, regerarAvaliacaoAcumulada } from './actions';

const STATUS_COR = {
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', icon: CheckCircle2, label: 'Aprovado' },
  revisar: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', icon: AlertTriangle, label: 'Revisar' },
  sem_auditoria: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: X, label: 'Sem auditoria' },
  nao_gerado: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', icon: RefreshCw, label: 'Não gerado' },
};

export default function AvaliacaoAcumuladaPage() {
  const router = useRouter();
  const sb = getSupabase();
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [empresaId, setEmpresaId] = useState(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEmpresaId(new URLSearchParams(window.location.search).get('empresa'));
  }, []);
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [regerando, setRegerando] = useState(null);

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const r = await listarAvaliacoesAcumuladas({ status: filtroStatus, empresaId });
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroStatus, empresaId]);

  async function abrirDetalhe(id) {
    setLoadingDetalhe(true);
    setDetalhe({ id });
    const r = await loadAvaliacaoAcumuladaDetalhe(id);
    setLoadingDetalhe(false);
    if (r.error) { setError(r.error); setDetalhe(null); return; }
    setDetalhe({ ...r.detalhe, id });
  }

  async function reger(trilhaId) {
    setRegerando(trilhaId);
    const r = await regerarAvaliacaoAcumulada(trilhaId);
    setRegerando(null);
    if (r.error) alert(r.error);
    else { await carregar(); if (detalhe?.trilhaId === trilhaId) await abrirDetalhe(detalhe.id); }
  }

  if (error && !rows.length) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-red-400">{error}</p></div>;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}?fase=4` : '/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-purple-400" /> Avaliação Acumulada — Interna Vertho
          </h1>
          <p className="text-xs text-gray-500">Nota por descritor gerada pela 1ª IA ao fim da sem 13, auditada pela 2ª.</p>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <Card label="Total" valor={resumo.total} cor="text-white" />
          <Card label="Aprovadas" valor={resumo.aprovado} cor="text-emerald-300" />
          <Card label="Revisar" valor={resumo.revisar} cor="text-amber-300" />
          <Card label="Sem auditoria" valor={resumo.semAuditoria} cor="text-gray-400" />
          <Card label="Não gerado" valor={resumo.naoGerado} cor="text-blue-400" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'aprovado', 'revisar', 'sem_auditoria', 'nao_gerado'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              filtroStatus === s ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {s === 'todos' ? 'Todos' : STATUS_COR[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={28} className="animate-spin text-cyan-400" /></div>
      ) : rows.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">Nenhuma avaliação pra esse filtro.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const cfg = STATUS_COR[r.auditoriaStatus] || STATUS_COR.sem_auditoria;
            const Icon = cfg.icon;
            return (
              <div key={r.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icon size={18} className={cfg.text} />
                  <button onClick={() => abrirDetalhe(r.id)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.colaborador}</p>
                      <span className="text-[10px] text-gray-400">· {r.cargo}</span>
                      <span className="text-[10px] text-gray-500">· {r.empresa}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {r.competencia} · T{r.temporada}
                      {r.notaMedia != null && <> · Média <span className="text-cyan-400 font-bold">{Number(r.notaMedia).toFixed(2)}</span></>}
                      {r.auditoriaNota != null && <> · Auditoria <span className={cfg.text + ' font-bold'}>{r.auditoriaNota}/100</span></>}
                    </p>
                    {r.alertas.length > 0 && (
                      <p className="text-[10px] text-amber-300 mt-1 truncate">⚠ {r.alertas.slice(0, 2).map(a => typeof a === 'string' ? a : (a.detalhe || a.descricao || a.tipo || '')).join(' · ')}</p>
                    )}
                  </button>
                  <button onClick={() => reger(r.trilhaId)} disabled={regerando === r.trilhaId}
                    className="text-[10px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white disabled:opacity-50">
                    {regerando === r.trilhaId ? <Loader2 size={10} className="animate-spin" /> : 'Regerar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detalhe && (
        <DetalheModal detalhe={detalhe} loading={loadingDetalhe} onClose={() => setDetalhe(null)} onRegerar={() => reger(detalhe.trilhaId)} />
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

function DetalheModal({ detalhe, loading, onClose, onRegerar }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">Avaliação Acumulada</h2>
          <div className="flex gap-2">
            {detalhe.trilhaId && (
              <button onClick={onRegerar}
                className="text-[10px] px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white">Regerar</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
          </div>
        </div>

        {loading || !detalhe.colaborador ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Contexto</p>
              <p className="text-white">{detalhe.colaborador} ({detalhe.cargo}) · {detalhe.empresa}</p>
              <p className="text-xs text-gray-400">Competência: <span className="text-cyan-400">{detalhe.competencia}</span> · DISC: {detalhe.perfilDominante || '—'}</p>
              {detalhe.geradoEm && <p className="text-[10px] text-gray-500 mt-1">Gerado em {new Date(detalhe.geradoEm).toLocaleString('pt-BR')}</p>}
            </section>

            {!detalhe.primaria ? (
              <p className="text-xs text-gray-500 italic">Ainda não gerada. Clique em Regerar.</p>
            ) : (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">1ª IA — Nota Acumulada por Descritor</p>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-xs">Média: <b className="text-emerald-300">{detalhe.primaria.nota_media_acumulada}</b></p>
                  {detalhe.primaria.avaliacao_acumulada?.map((d, i) => {
                    const inicial = detalhe.notasIniciais?.[d.descritor];
                    return (
                      <div key={i} className="text-[11px] border-t border-white/5 pt-2">
                        <p className="font-bold text-white">
                          {d.descritor} — {inicial != null && <>inicial <span className="text-gray-400">{inicial}</span> → </>}
                          acumulada <span className="text-emerald-300">{d.nota_acumulada ?? '—'}</span>
                          <span className="text-[10px] text-gray-400"> ({d.nivel_rubrica}, tendência {d.tendencia}, {d.quantidade_referencias} semana(s))</span>
                        </p>
                        <p className="text-gray-400 mt-0.5">{d.justificativa}</p>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-300 italic border-t border-white/5 pt-2">{detalhe.primaria.resumo_geral}</p>
                </div>
              </section>
            )}

            {detalhe.auditoria ? (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-purple-400 mb-1">2ª IA — Auditoria</p>
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                  <p className="text-xs">Nota: <b className="text-purple-300">{detalhe.auditoria.nota_auditoria}/100</b> · Status: <b className="text-purple-300">{detalhe.auditoria.status}</b></p>
                  {detalhe.auditoria.resumo_auditoria && <p className="text-xs text-gray-300">{detalhe.auditoria.resumo_auditoria}</p>}
                  {detalhe.auditoria.alertas?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-400 font-bold mt-2">Alertas:</p>
                      <ul className="text-[11px] text-amber-200 list-disc pl-4 space-y-1">
                        {detalhe.auditoria.alertas.map((a, i) => {
                          if (typeof a === 'string') return <li key={i}>{a}</li>;
                          return <li key={i}>{a.descritor && <span className="text-amber-400 font-bold">[{a.descritor}] </span>}{a.detalhe || a.descricao || a.tipo || JSON.stringify(a)}</li>;
                        })}
                      </ul>
                    </div>
                  )}
                  {detalhe.auditoria.ajustes_sugeridos?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-400 font-bold mt-2">Ajustes sugeridos:</p>
                      <ul className="text-[11px] text-gray-300 list-disc pl-4">
                        {detalhe.auditoria.ajustes_sugeridos.map((a, i) => <li key={i}>{a.descritor}: {a.nota_acumulada_sugerida} — {a.motivo}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            ) : detalhe.primaria ? (
              <p className="text-xs text-gray-500 italic">Avaliação primária gerada, mas auditoria não (falha na 2ª IA ou rodada antes do check).</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
