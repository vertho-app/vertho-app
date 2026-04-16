'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase-browser';
import { ArrowLeft, Loader2, ShieldCheck, AlertTriangle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { listarAuditoriasSem14, loadAuditoriaSem14Detalhe, regerarScoringComFeedback } from './actions';

const STATUS_COR = {
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', icon: CheckCircle2, label: 'Aprovado' },
  revisar: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', icon: AlertTriangle, label: 'Revisar' },
  sem_auditoria: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: X, label: 'Sem auditoria' },
};

export default function AuditoriaSem14Page() {
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
  const [detalheId, setDetalheId] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const r = await listarAuditoriasSem14(user.email, { status: filtroStatus, empresaId });
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroStatus, empresaId]);

  async function abrirDetalhe(id) {
    setDetalheId(id);
    setLoadingDetalhe(true);
    const { data: { user } } = await sb.auth.getUser();
    const r = await loadAuditoriaSem14Detalhe(user.email, id);
    setLoadingDetalhe(false);
    if (r.error) { setError(r.error); setDetalheId(null); return; }
    setDetalhe(r.detalhe);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-400">{error}</p>
          <button onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}?fase=4` : '/admin/dashboard')}
            className="mt-4 text-xs text-cyan-400 hover:underline">← Voltar ao admin</button>
        </div>
      </div>
    );
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
            <ShieldCheck size={20} className="text-purple-400" /> Auditoria Sem 14 — Interna Vertho
          </h1>
          <p className="text-xs text-gray-500">Revisão de avaliações finais de temporada feitas pela 2ª IA.</p>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card label="Total" valor={resumo.total} cor="text-white" />
          <Card label="Aprovadas" valor={resumo.aprovado} cor="text-emerald-300" />
          <Card label="Revisar" valor={resumo.revisar} cor="text-amber-300" />
          <Card label="Sem auditoria" valor={resumo.semAuditoria} cor="text-gray-400" />
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['todos', 'aprovado', 'revisar', 'sem_auditoria'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filtroStatus === s
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {s === 'todos' ? 'Todos' : STATUS_COR[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">Nenhuma auditoria pra esse filtro.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const cfg = STATUS_COR[r.auditoriaStatus] || STATUS_COR.sem_auditoria;
            const Icon = cfg.icon;
            return (
              <button key={r.id} onClick={() => abrirDetalhe(r.id)}
                className={`w-full text-left rounded-xl border ${cfg.border} ${cfg.bg} hover:brightness-110 transition-all p-4`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <Icon size={18} className={cfg.text} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-white truncate">{r.colaborador}</p>
                      <span className="text-[10px] text-gray-400">· {r.cargo}</span>
                      <span className="text-[10px] text-gray-500">· {r.empresa}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {r.competencia} · T{r.temporada}
                      {r.deltaMedio != null && <> · Δ médio <span className="text-cyan-400 font-bold">{Number(r.deltaMedio).toFixed(2)}</span></>}
                      {r.auditoriaNota != null && <> · Auditoria <span className={cfg.text + ' font-bold'}>{r.auditoriaNota}/100</span></>}
                    </p>
                    {r.auditoriaAlertas.length > 0 && (
                      <p className="text-[10px] text-amber-300 mt-1 truncate">
                        ⚠ {r.auditoriaAlertas.slice(0, 2).map(a => typeof a === 'string' ? a : (a.detalhe || a.descricao || a.tipo || '')).join(' · ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-gray-500 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalheId && (
        <DetalheModal
          detalhe={detalhe ? { ...detalhe, id: detalheId } : null}
          loading={loadingDetalhe}
          onClose={() => { setDetalheId(null); setDetalhe(null); }}
          onRevisado={async () => { await carregar(); if (detalheId) await abrirDetalhe(detalheId); }}
        />
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

function BotaoRegerar({ progressoId, onRevisado }) {
  const sb = getSupabase();
  const [busy, setBusy] = useState(false);
  return (
    <button onClick={async () => {
      if (!confirm('Regerar scoring com os feedbacks da auditoria? A IA vai corrigir os problemas apontados.')) return;
      setBusy(true);
      const { data: { user } } = await sb.auth.getUser();
      const r = await regerarScoringComFeedback(user.email, progressoId);
      setBusy(false);
      if (r.error) alert('Erro: ' + r.error);
      else { alert(`Regenerado! Nova nota de auditoria: ${r.novaNota}/100 (${r.novoStatus})`); onRevisado?.(); }
    }} disabled={busy}
      className="mt-3 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2">
      {busy ? <><Loader2 size={14} className="animate-spin" /> Regenerando...</> : 'Regerar com feedback da auditoria'}
    </button>
  );
}

function DetalheModal({ detalhe, loading, onClose, onRevisado }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">Detalhe da Auditoria</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading || !detalhe ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : !detalhe.colaborador ? (
          <div className="p-5 text-sm text-red-400">Erro ao carregar detalhe. Dados incompletos.</div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Contexto</p>
              <p className="text-white">{detalhe.colaborador} ({detalhe.cargo}) · {detalhe.empresa}</p>
              <p className="text-xs text-gray-400">Competência: <span className="text-cyan-400">{detalhe.competencia}</span> · Perfil DISC: {detalhe.perfilDominante || 'não mapeado'}</p>
            </section>

            {detalhe.avaliacaoPrimaria && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Avaliação Primária</p>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex gap-4 text-xs flex-wrap">
                    <span>Pré: <b>{detalhe.avaliacaoPrimaria.nota_media_pre}</b></span>
                    <span>Acumulada: <b className="text-cyan-300">{(() => {
                      const acum = detalhe.acumulada || [];
                      const notas = acum.map(a => a.nota_acumulada).filter(n => n != null);
                      return notas.length ? (notas.reduce((a,b) => a+b, 0) / notas.length).toFixed(2) : '—';
                    })()}</b></span>
                    <span>Cenário: <b className="text-amber-300">{detalhe.avaliacaoPrimaria.nota_media_cenario || '—'}</b></span>
                    <span>Final: <b className="text-emerald-300">{detalhe.avaliacaoPrimaria.nota_media_pos}</b></span>
                    <span>Δ: <b className={Number(detalhe.avaliacaoPrimaria.delta_medio) >= 0 ? 'text-emerald-300' : 'text-red-400'}>{detalhe.avaliacaoPrimaria.delta_medio}</b></span>
                  </div>
                  {/* Header tabela de notas */}
                  <div className="grid grid-cols-7 gap-1 text-[9px] uppercase tracking-widest text-gray-500 pb-1 border-b border-white/10">
                    <span className="col-span-2">Descritor</span>
                    <span className="text-center">Pré</span>
                    <span className="text-center">Acumul.</span>
                    <span className="text-center">Cenário</span>
                    <span className="text-center">Final</span>
                    <span className="text-center">Δ</span>
                  </div>
                  {detalhe.avaliacaoPrimaria.avaliacao_por_descritor?.map((d, i) => {
                    const acum = (detalhe.acumulada || []).find(a => a.descritor === d.descritor);
                    const pre = Number(d.nota_pre) || 0;
                    const pos = Number(d.nota_pos) || 0;
                    const delta = !isNaN(Number(d.delta)) ? Number(d.delta) : (pos - pre);
                    const corVsPre = (v) => { const n = Number(v); if (!v || isNaN(n)) return 'text-gray-400'; return n > pre ? 'text-emerald-300' : n < pre ? 'text-red-400' : 'text-gray-300'; };
                    const corDelta = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-400' : 'text-gray-400';
                    return (
                      <div key={i} className="border-t border-white/5 pt-2">
                        <div className="grid grid-cols-7 gap-1 items-center">
                          <p className="col-span-2 text-[11px] font-bold text-white truncate" title={d.descritor}>{d.descritor}</p>
                          <p className="text-center text-[11px] text-gray-400">{d.nota_pre}</p>
                          <p className={`text-center text-[11px] font-bold ${corVsPre(acum?.nota_acumulada)}`}>{acum?.nota_acumulada ?? '—'}</p>
                          <p className={`text-center text-[11px] font-bold ${corVsPre(d.nota_cenario)}`}>{d.nota_cenario ?? '—'}</p>
                          <p className={`text-center text-[11px] font-bold ${corVsPre(d.nota_pos)}`}>{d.nota_pos}</p>
                          <p className={`text-center text-[11px] font-bold ${corDelta}`}>{isNaN(delta) ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`}</p>
                        </div>
                        <p className={`text-[10px] ${corFinal} mt-0.5`}>
                          {d.classificacao} ({d.consistencia_com_acumulado || '—'})
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{d.justificativa}</p>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-300 italic border-t border-white/5 pt-2">{detalhe.avaliacaoPrimaria.resumo_avaliacao}</p>
                </div>
              </section>
            )}

            {detalhe.auditoria ? (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-purple-400 mb-1">Auditoria 2ª IA</p>
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                  <p className="text-xs">
                    Nota: <b className="text-purple-300">{detalhe.auditoria.nota_auditoria}/100</b>
                    {' · '}Status: <b className="text-purple-300">{detalhe.auditoria.status}</b>
                  </p>
                  {detalhe.auditoria.resumo_auditoria && (
                    <p className="text-xs text-gray-300">{detalhe.auditoria.resumo_auditoria}</p>
                  )}
                  {detalhe.auditoria.alertas?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-400 font-bold mt-2">Alertas:</p>
                      <ul className="text-[11px] text-amber-200 list-disc pl-4 space-y-1">
                        {detalhe.auditoria.alertas.map((a, i) => {
                          if (typeof a === 'string') return <li key={i}>{a}</li>;
                          return (
                            <li key={i}>
                              {a.descritor && <span className="text-amber-400 font-bold">[{a.descritor}] </span>}
                              {a.tipo && <span className="text-[10px] text-amber-500 mr-1">{a.tipo}:</span>}
                              {a.detalhe || a.descricao || a.mensagem || JSON.stringify(a)}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {detalhe.auditoria.ajustes_sugeridos?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-400 font-bold mt-2">Ajustes sugeridos:</p>
                      <ul className="text-[11px] text-gray-300 list-disc pl-4">
                        {detalhe.auditoria.ajustes_sugeridos.map((a, i) => (
                          <li key={i}>{a.descritor}: {a.nota_pos_sugerida} — {a.motivo}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detalhe.auditoria.status === 'revisar' && (
                    <BotaoRegerar progressoId={detalhe.id} onRevisado={onRevisado} />
                  )}
                  {detalhe.auditoria.regerado_com_feedback && (
                    <p className="text-[10px] text-gray-500 mt-2 italic">Regenerada com feedback da auditoria em {new Date(detalhe.auditoria.regerado_em || '').toLocaleString('pt-BR')}</p>
                  )}
                </div>
              </section>
            ) : (
              <p className="text-xs text-gray-500 italic">Esta avaliação foi feita antes da implementação do check — sem auditoria registrada.</p>
            )}

            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Cenário</p>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-gray-300 whitespace-pre-wrap">{detalhe.cenario}</div>
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Resposta do Colaborador</p>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-gray-300 whitespace-pre-wrap">{detalhe.resposta}</div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}

