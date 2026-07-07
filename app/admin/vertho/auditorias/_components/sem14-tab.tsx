'use client';

// Tab "Sem 14" do workspace de auditorias — conteúdo extraído da antiga
// /admin/vertho/auditoria-sem14 (Reorganização do admin, Fase 3).
// As actions permanecem no diretório original.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle2, ChevronRight, X, RefreshCw } from 'lucide-react';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  listarAuditoriasSem14, loadAuditoriaSem14Detalhe, regerarScoringComFeedback,
  iniciarReavaliacaoLote, statusReavaliacaoLote,
} from '@/app/admin/vertho/auditoria-sem14/actions';
import { REAVALIACAO_LOTE_CAP } from '@/app/admin/vertho/auditoria-sem14/constants';

// Bandas de nota de check (auditoria.nota_auditoria 0-100). 'sem_nota' = sem
// auditoria registrada (checkbox desabilitado — regerar exige auditoria anterior).
type NotaBanda = 'todos' | 'alto' | 'medio' | 'baixo' | 'critico' | 'sem_nota';
function notaBanda(n: number | null | undefined): NotaBanda {
  if (n == null) return 'sem_nota';
  const x = Number(n);
  if (!Number.isFinite(x)) return 'sem_nota';
  if (x >= 80) return 'alto';
  if (x >= 60) return 'medio';
  if (x >= 40) return 'baixo';
  return 'critico';
}
const NOTA_BANDAS: NotaBanda[] = ['todos', 'alto', 'medio', 'baixo', 'critico', 'sem_nota'];

const STATUS_COR = {
  aprovado: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', icon: CheckCircle2, label: 'Aprovado' },
  revisar: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', icon: AlertTriangle, label: 'Revisar' },
  sem_auditoria: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20', icon: X, label: 'Sem auditoria' },
};

export default function Sem14Tab({ empresaId }: { empresaId: string | null }) {
  const router = useRouter();
  const t = useTranslations('AdminWeek14Audit');
  const locale = useLocale();
  const sb = getSupabase();
  const confirmDialog = useConfirm();
  const [rows, setRows] = useState([]);
  const [resumo, setResumo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroNota, setFiltroNota] = useState<NotaBanda>('todos');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState<{ loteId: string; status: string; total: number; processados: number; erros: any[] } | null>(null);
  const [loteBusy, setLoteBusy] = useState(false);
  const [detalheId, setDetalheId] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  // Filtragem por nota é client-side (rows já vêm com auditoriaNota). Combina
  // com o filtro de status (que a action já aplica, mas mantemos por segurança).
  const filtrados = rows.filter(r => filtroNota === 'todos' || notaBanda(r.auditoriaNota) === filtroNota);

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { router.replace('/login'); return; }
    const r = await listarAuditoriasSem14({ status: filtroStatus, empresaId });
    if (r.error) setError(r.error);
    else { setRows(r.rows); setResumo(r.resumo); }
    setLoading(false);
  }

  useEffect(() => { carregar(); }, [filtroStatus, empresaId]);

  // Limpa seleção ao trocar filtros (uma row pode sair do conjunto visível).
  useEffect(() => { setSelecionados(new Set()); }, [filtroStatus, filtroNota, empresaId]);

  function toggleSel(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleTodos() {
    setSelecionados(prev => {
      const elegiveis = filtrados.filter(r => r.auditoriaNota != null).map(r => r.id);
      const todosSel = elegiveis.length > 0 && elegiveis.every(id => prev.has(id));
      return todosSel ? new Set() : new Set(elegiveis);
    });
  }

  const lotePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!lote?.loteId) return;
    const tick = async () => {
      try {
        const r = await statusReavaliacaoLote(lote.loteId);
        if (!('ok' in r)) return; // erro transiente — mantém polling
        setLote({ loteId: lote.loteId, status: r.status, total: r.total, processados: r.processados, erros: r.erros || [] });
        if (r.status === 'done') {
          if (lotePollRef.current) { clearInterval(lotePollRef.current); lotePollRef.current = null; }
          setLoteBusy(false);
          const ok = r.total - (r.erros?.length || 0);
          if (r.erros?.length) toast.warning(t('bulk.done', { ok, errors: r.erros.length }));
          else toast.success(t('bulk.done', { ok, errors: 0 }));
          setSelecionados(new Set());
          await carregar();
        }
      } catch { /* transiente — próxima tick tenta de novo */ }
    };
    tick(); // dispara imediatamente
    lotePollRef.current = setInterval(tick, 5000);
    return () => { if (lotePollRef.current) { clearInterval(lotePollRef.current); lotePollRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote?.loteId]);

  async function iniciarLote() {
    const ids = [...selecionados];
    if (!ids.length) return;
    const ok = await confirmDialog({
      title: t('bulk.confirm.title'),
      message: t('bulk.confirm.message', { count: ids.length }),
      severity: 'danger',
      scopeNote: t('bulk.scopeNote', { count: ids.length }),
    });
    if (!ok) return;
    setLoteBusy(true);
    const r = await iniciarReavaliacaoLote(ids, empresaId);
    if (r.error) {
      setLoteBusy(false);
      toast.error(t('errorPrefix', { error: r.error }));
      return;
    }
    setLote({ loteId: r.loteId, status: 'processing', total: ids.length, processados: 0, erros: [] });
    toast.success(t('bulk.queued', { count: ids.length }));
  }

  async function abrirDetalhe(id) {
    setDetalheId(id);
    setLoadingDetalhe(true);
    const r = await loadAuditoriaSem14Detalhe(id);
    setLoadingDetalhe(false);
    if (r.error) { setError(r.error); setDetalheId(null); return; }
    setDetalhe(r.detalhe);
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle size={32} className="mx-auto text-red-400 mb-3" />
          <p className="text-red-400">{error}</p>
          <button onClick={() => router.push(empresaId ? `/admin/empresas/${empresaId}?fase=4` : '/admin/dashboard')}
            className="mt-4 text-xs text-cyan-400 hover:underline">{t('backToAdmin')}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-purple-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card label={t('summary.total')} valor={resumo.total} cor="text-white" />
          <Card label={t('summary.approved')} valor={resumo.aprovado} cor="text-emerald-300" />
          <Card label={t('summary.review')} valor={resumo.revisar} cor="text-amber-300" />
          <Card label={t('summary.noAudit')} valor={resumo.semAuditoria} cor="text-gray-400" />
        </div>
      )}

      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">{t('filters.statusLabel')}</span>
        {['todos', 'aprovado', 'revisar', 'sem_auditoria'].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filtroStatus === s
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {s === 'todos' ? t('filters.all') : t(`status.${s}`) || STATUS_COR[s]?.label || s}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1">{t('filters.noteLabel')}</span>
        {NOTA_BANDAS.map(b => (
          <button key={b} onClick={() => setFiltroNota(b)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filtroNota === b
                ? 'bg-purple-500/20 border-purple-400/50 text-purple-300'
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}>
            {t(`filters.note.${b}`)}
          </button>
        ))}
      </div>

      {/* Barra de lote — aparece quando há seleção ou lote em andamento. */}
      {(selecionados.size > 0 || lote) && (
        <div className="sticky top-0 z-20 mb-4 rounded-xl border border-cyan-500/30 bg-[#0a0e1a]/95 backdrop-blur p-3 flex items-center gap-3 flex-wrap">
          {lote ? (
            <>
              <Loader2 size={16} className="animate-spin text-cyan-400" />
              <span className="text-xs text-white font-bold">
                {lote.status === 'done'
                  ? t('bulk.done', { ok: lote.total - (lote.erros?.length || 0), errors: lote.erros?.length || 0 })
                  : t('bulk.running', { atual: lote.processados, total: lote.total })}
              </span>
              {lote.erros?.length > 0 && lote.status === 'done' && (
                <span className="text-[10px] text-amber-300">
                  {lote.erros.map((e: any) => `${e.colaborador || e.progressoId}: ${e.error}`).slice(0, 3).join(' · ')}
                  {lote.erros.length > 3 ? ` +${lote.erros.length - 3}` : ''}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-xs text-white font-bold">{t('bulk.selected', { count: selecionados.size })}</span>
              <button onClick={toggleTodos} className="text-[10px] text-cyan-400 hover:underline">
                {t('bulk.selectAll')}
              </button>
              <button onClick={() => setSelecionados(new Set())} className="text-[10px] text-gray-400 hover:underline">
                {t('bulk.clear')}
              </button>
              <div className="flex-1" />
              <button onClick={iniciarLote} disabled={loteBusy || selecionados.size === 0 || selecionados.size > REAVALIACAO_LOTE_CAP}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-xs font-bold flex items-center gap-2">
                {loteBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('bulk.reavaliar', { count: selecionados.size })}
              </button>
            </>
          )}
        </div>
      )}
      {selecionados.size > REAVALIACAO_LOTE_CAP && !lote && (
        <p className="text-[10px] text-amber-300 mb-3">{t('bulk.capWarn', { cap: REAVALIACAO_LOTE_CAP })}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={28} className="animate-spin text-cyan-400" />
        </div>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-12 text-sm text-gray-500">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          {filtrados.map(r => {
            const cfg = STATUS_COR[r.auditoriaStatus] || STATUS_COR.sem_auditoria;
            const Icon = cfg.icon;
            const sel = selecionados.has(r.id);
            const semAuditoria = r.auditoriaNota == null;
            return (
              <div key={r.id}
                onClick={() => abrirDetalhe(r.id)}
                className={`w-full text-left rounded-xl border ${cfg.border} ${cfg.bg} hover:brightness-110 transition-all p-4 flex items-center gap-3 cursor-pointer ${sel ? 'ring-1 ring-cyan-400/60' : ''}`}>
                <input type="checkbox"
                  checked={sel}
                  disabled={semAuditoria}
                  title={semAuditoria ? t('bulk.noAudit') : ''}
                  onClick={e => e.stopPropagation()}
                  onChange={() => toggleSel(r.id)}
                  className="accent-cyan-500 w-4 h-4 shrink-0 disabled:opacity-30" />
                <Icon size={18} className={cfg.text + ' shrink-0'} />
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
          t={t}
          locale={locale}
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

function BotaoRegerar({ progressoId, onRevisado, t }) {
  const confirmDialog = useConfirm();
  const [busy, setBusy] = useState(false);
  return (
    <button onClick={async () => {
      const ok = await confirmDialog({
        title: t('regenerateWithFeedback'),
        message: t('confirm.regenerate'),
        severity: 'danger',
        scopeNote: 'Operação cara de IA — regera o scoring da semana 14 com o feedback',
      });
      if (!ok) return;
      setBusy(true);
      const r = await regerarScoringComFeedback(progressoId);
      setBusy(false);
      if (r.error) toast.error(t('errorPrefix', { error: r.error }));
      else { toast.success(t('regenerated', { score: r.novaNota, status: r.novoStatus })); onRevisado?.(); }
    }} disabled={busy}
      className="mt-3 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-sm font-bold flex items-center justify-center gap-2">
      {busy ? <><Loader2 size={14} className="animate-spin" /> {t('regenerating')}</> : t('regenerateWithFeedback')}
    </button>
  );
}

function DetalheModal({ detalhe, loading, onClose, onRevisado, t, locale }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}>
      <div className="max-w-3xl w-full bg-[#0a0e1a] border border-white/10 rounded-2xl my-8"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-white/10 bg-[#0a0e1a] rounded-t-2xl">
          <h2 className="text-sm font-bold text-white">{t('modal.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={18} /></button>
        </div>

        {loading || !detalhe ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
        ) : !detalhe.colaborador ? (
          <div className="p-5 text-sm text-red-400">Erro ao carregar detalhe. Dados incompletos.</div>
        ) : (
          <div className="p-5 space-y-4 text-sm">
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{t('modal.context')}</p>
              <p className="text-white">{detalhe.colaborador} ({detalhe.cargo}) · {detalhe.empresa}</p>
              <p className="text-xs text-gray-400">{t('modal.competency')}: <span className="text-cyan-400">{detalhe.competencia}</span> · Perfil DISC: {detalhe.perfilDominante || t('modal.notMapped')}</p>
            </section>

            {detalhe.avaliacaoPrimaria && (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">{t('modal.primary')}</p>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                  <div className="flex gap-4 text-xs flex-wrap">
                    <span>Pré: <b>{detalhe.avaliacaoPrimaria.nota_media_pre}</b></span>
                    <span>Acumulada: <b className="text-cyan-300">{(() => {
                      const acum = detalhe.acumulada || [];
                      const notas = acum.map(a => a.nota_acumulada).filter(n => n != null);
                      return notas.length ? (notas.reduce((a,b) => a+b, 0) / notas.length).toFixed(2) : '—';
                    })()}</b></span>
                    <span>{t('modal.scenario')}: <b className="text-amber-300">{detalhe.avaliacaoPrimaria.nota_media_cenario || '—'}</b></span>
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
                        <p className={`text-[10px] ${corVsPre(d.nota_pos)} mt-0.5`}>
                          {d.classificacao} ({d.consistencia_com_acumulado || '—'})
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{d.justificativa}</p>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-300 italic border-t border-white/5 pt-2">{typeof detalhe.avaliacaoPrimaria.resumo_avaliacao === 'object' ? detalhe.avaliacaoPrimaria.resumo_avaliacao.mensagem_geral : detalhe.avaliacaoPrimaria.resumo_avaliacao}</p>
                </div>
              </section>
            )}

            {detalhe.auditoria ? (
              <section>
                <p className="text-[10px] uppercase tracking-widest text-purple-400 mb-1">{t('modal.audit')}</p>
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                  <p className="text-xs">
                    Nota: <b className="text-purple-300">{detalhe.auditoria.nota_auditoria}/100</b>
                    {' · '}Status: <b className={`${detalhe.auditoria.status === 'aprovado' ? 'text-emerald-300' : detalhe.auditoria.status === 'aprovado_com_ajustes' ? 'text-amber-300' : 'text-red-300'}`}>{detalhe.auditoria.status}</b>
                    {detalhe.auditoria.erro_grave && <span className="text-red-400 ml-2 text-[10px]">ERRO GRAVE</span>}
                  </p>
                  {detalhe.auditoria.resumo_auditoria && (
                    <p className="text-xs text-gray-300">{detalhe.auditoria.resumo_auditoria}</p>
                  )}
                  {detalhe.auditoria.ponto_mais_confiavel && <p className="text-[10px] text-emerald-400/70">Mais confiável: {detalhe.auditoria.ponto_mais_confiavel}</p>}
                  {detalhe.auditoria.ponto_mais_fragil && <p className="text-[10px] text-red-400/70">Mais frágil: {detalhe.auditoria.ponto_mais_fragil}</p>}
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
                  {(detalhe.auditoria.status === 'revisar' || detalhe.auditoria.status === 'aprovado_com_ajustes') && (
                    <BotaoRegerar progressoId={detalhe.id} onRevisado={onRevisado} t={t} />
                  )}
                  {detalhe.auditoria.regerado_com_feedback && (
                    <p className="text-[10px] text-gray-500 mt-2 italic">Regenerada com feedback da auditoria em {new Date(detalhe.auditoria.regerado_em || '').toLocaleString(locale)}</p>
                  )}
                </div>
              </section>
            ) : (
              <p className="text-xs text-gray-500 italic">Esta avaliação foi feita antes da implementação do check — sem auditoria registrada.</p>
            )}

            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{t('modal.scenario')}</p>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-gray-300 whitespace-pre-wrap">{detalhe.cenario}</div>
            </section>
            <section>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{t('modal.collaboratorAnswer')}</p>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-gray-300 whitespace-pre-wrap">{detalhe.resposta}</div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
