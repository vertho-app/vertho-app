'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { ChevronRight, ChevronDown, BookOpen, Target, Sparkles, Video, FileText, Headphones, FileType, Pause, Play, Archive, RefreshCw, Eye, X, Unlock, Download, CalendarDays } from 'lucide-react';
import BackButton from '@/components/back-button';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import { listarTemporadasEmpresa, pausarRetomarTemporada, arquivarTemporada, regerarSemana, loadProgressoDetalhado, anteciparInicioTemporada, prepararEntregasJornada, gerarTemporada, verificarProntidaoPiloto } from '@/actions/temporadas';
import { simularUmaSemanaSimulacao } from '@/actions/simulador-temporada';
import { getSupabase } from '@/lib/supabase-browser';

const STATUS_COLORS = {
  ativa: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  pausada: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  arquivada: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  concluida: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

const FORMAT_ICON = { video: Video, audio: Headphones, texto: FileText, case: BookOpen, pdf: FileType };
const FORMAT_COLOR = { video: '#06B6D4', audio: '#A78BFA', texto: '#10B981', case: '#F59E0B', pdf: '#94A3B8' };

const TIPO_COLOR = { conteudo: '#3B82F6', aplicacao: '#F59E0B', avaliacao: '#A78BFA' };
export default function TemporadasAdminPage() {
  const t = useTranslations('AdminSeasons');
  const confirmDialog = useConfirm();
  const { empresaId } = useEmpresaContexto();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [statusFiltro, setStatusFiltro] = useState('ativa');
  const [busy, setBusy] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [semanaDet, setSemanaDet] = useState(null); // { t, semana } — entregas da semana (plano já vem pós-overlay + anotado)

  async function handleVerDetalhe(trilhaId) {
    setBusy(true);
    const r = await loadProgressoDetalhado(trilhaId);
    setBusy(false);
    if (r.success) setDetalhe(r);
  }

  async function recarregar() {
    setLoading(true);
    const r = await listarTemporadasEmpresa(empresaId);
    setItems(r.items || []);
    setLoading(false);
  }

  async function handlePausar(trilhaId) {
    setBusy(true);
    await pausarRetomarTemporada({ trilhaId });
    await recarregar();
    setBusy(false);
  }

  async function handleRegerarTemporada(colaboradorId, nome) {
    const ok = await confirmDialog({
      title: 'Regerar temporada inteira',
      message: `Regerar a temporada inteira de ${nome || 'colaborador'}? Reaplica o modo atual (DUO/single) e sobrescreve o plano.`,
      severity: 'danger',
      scopeNote: 'Operação cara de IA — regenera a temporada inteira',
    });
    if (!ok) return;
    setBusy(true);
    const r = await gerarTemporada({ colaboradorId });
    setBusy(false);
    if (r.error) toast.error(r.error);
    else toast.success(`Temporada regerada: ${(r as any).competencias?.join(' + ') || (r as any).competencia} · ${(r as any).semanas} semanas · modo ${(r as any).modo || 'single'}`);
    await recarregar();
  }

  async function handlePreparar(colaboradorId, nome) {
    if (!empresaId) { toast.warning('Selecione uma empresa (filtro do topo ou ?empresa=...).'); return; }
    const ok = await confirmDialog({
      title: 'Pré-gerar entregas',
      message: `Pré-gerar as entregas (PDF/áudio personalizados) das semanas já liberadas de ${nome || 'colaborador'}? Abre instantâneo depois.`,
      severity: 'normal',
    });
    if (!ok) return;
    setBusy(true);
    const r = await prepararEntregasJornada({ empresaId, colaboradorId });
    setBusy(false);
    if (!r.success) toast.error(r.error);
    else toast.success(`Entregas: ${r.data.preparadas} geradas · ${r.data.jaProntas} já prontas · ${r.data.falhas} falhas (${r.data.semanas} semana(s) liberada(s))`);
  }

  async function handleLiberar(trilhaId, nome) {
    const ok = await confirmDialog({
      title: 'Liberar semanas agora',
      message: `Liberar todas as semanas já liberáveis de ${nome || 'colaborador'} agora? (antecipa o início para esta segunda — uso em teste/demo)`,
      severity: 'normal',
    });
    if (!ok) return;
    setBusy(true);
    const r = await anteciparInicioTemporada({ trilhaId });
    if (!r.success) toast.error(r.error);
    await recarregar();
    setBusy(false);
  }

  async function handleArquivar(trilhaId, nome) {
    const ok = await confirmDialog({
      title: t('card.archive'),
      message: t('confirm.archive', { name: nome || t('fallback.collaborator') }),
      severity: 'normal',
    });
    if (!ok) return;
    setBusy(true);
    await arquivarTemporada({ trilhaId });
    await recarregar();
    setBusy(false);
  }

  async function handleRegerar(trilhaId, semana) {
    const ok = await confirmDialog({
      title: t('card.regenerateWeek', { week: semana }),
      message: t('confirm.regenerateWeek', { week: semana }),
      severity: 'danger',
      scopeNote: 'Operação cara de IA — regenera a semana e apaga o progresso dela',
    });
    if (!ok) return;
    setBusy(true);
    const r = await regerarSemana({ trilhaId, semana });
    if (!r.success) toast.error(r.error);
    await recarregar();
    setBusy(false);
  }

  const [simProgress, setSimProgress] = useState(null); // { semana, total, erros }
  const [prontidao, setProntidao] = useState(null); // resultado do check do piloto

  async function handleProntidaoPiloto() {
    if (!empresaId) { toast.warning('Selecione uma empresa (filtro do topo ou ?empresa=...).'); return; }
    setBusy(true);
    const r = await verificarProntidaoPiloto({ empresaId });
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    setProntidao(r.data);
  }

  async function handleSimular(trilhaId: any, nome: string) {
    const perfil = prompt(
      t('simulation.prompt', { name: nome }),
      '2'
    );
    if (!perfil) return;
    const mapa = { 1: 'evolucao_confirmada', 2: 'evolucao_parcial', 3: 'estagnacao', 4: 'regressao' };
    const perfilEvolucao = mapa[perfil.trim()] || 'evolucao_parcial';
    const ok = await confirmDialog({
      title: t('card.simulateTitle'),
      message: t('simulation.confirmProfile', { profile: perfilEvolucao }),
      severity: 'danger',
      scopeNote: 'Operação cara de IA — simula as 14 semanas e apaga o progresso existente',
    });
    if (!ok) return;

    setBusy(true);
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    const erros = [];
    setSimProgress({ semana: 0, total: 14, erros: [] });

    for (let sem = 1; sem <= 14; sem++) {
      setSimProgress({ semana: sem, total: 14, erros: [...erros] });
      const r = await simularUmaSemanaSimulacao(user.email, { trilhaId, semana: sem, perfilEvolucao });
      if (r?.error) erros.push(t('simulation.weekError', { week: sem, error: r.error }));
    }

    setSimProgress(null);
    setBusy(false);
    await recarregar();
    if (erros.length) toast.error(t('simulation.finishedWithErrors', { count: erros.length, errors: erros.join('\n') }));
    else toast.success(t('simulation.finished'));
  }

  useEffect(() => { recarregar(); }, [empresaId]);

  const itemsFiltrados = statusFiltro === 'todas'
    ? items
    : items.filter(t => (t.status || 'ativa') === statusFiltro);

  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">
        <BackButton />
        <AdminPageHeader
          icon={CalendarDays}
          title={t('title')}
          subtitle={<>{empresaId ? t('scope.company') : t('scope.allCompanies')} · {itemsFiltrados.length}/{items.length}</>}
          actions={
            <>
              {empresaId && (
                <button onClick={handleProntidaoPiloto} disabled={busy}
                  title="Piloto: verifica formato-core dos top-4 descritores + Cenário B do cargo ANTES de liberar"
                  className="bg-white/5 border border-white/10 hover:border-cyan-400/40 rounded-lg px-3 py-1.5 text-xs text-cyan-300 disabled:opacity-50">
                  Prontidão piloto
                </button>
              )}
              <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white">
                <option value="ativa" className="bg-[#0d1426]">{t('filters.active')}</option>
                <option value="pausada" className="bg-[#0d1426]">{t('filters.paused')}</option>
                <option value="concluida" className="bg-[#0d1426]">{t('filters.completed')}</option>
                <option value="arquivada" className="bg-[#0d1426]">{t('filters.archived')}</option>
                <option value="todas" className="bg-[#0d1426]">{t('filters.all')}</option>
              </select>
            </>
          }
        />

        {prontidao && (
          <div className="mb-6 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-cyan-300">
                Prontidão do piloto — {prontidao.prontos}/{prontidao.total} colaborador(es) prontos
              </p>
              <button onClick={() => setProntidao(null)} className="text-xs text-gray-400 hover:text-white">fechar ✕</button>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {prontidao.resultados.map((r, i) => (
                <div key={i} className={`rounded-lg border p-2.5 ${r.pronto ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-red-500/30 bg-red-500/[0.05]'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs font-bold text-white">
                      {r.pronto ? '✅' : '⛔'} {r.colaborador}
                      {r.cargo && <span className="text-gray-400 font-normal"> · {r.cargo}</span>}
                    </p>
                    {r.competencia && <p className="text-[10px] text-gray-400">{r.competencia}</p>}
                  </div>
                  {r.descritores?.length > 0 && (
                    <p className="text-[10px] text-gray-500 mt-1">Top-4: {r.descritores.join(' · ')}</p>
                  )}
                  {r.bloqueadores?.map((b, j) => (
                    <p key={j} className="text-[11px] text-red-300 mt-1">⛔ {b}</p>
                  ))}
                  {r.avisos?.map((a, j) => (
                    <p key={j} className="text-[11px] text-amber-300/80 mt-1">⚠ {a}</p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">{t('loading')}</div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            {statusFiltro !== 'todas' ? t('empty.withStatus', { status: t(`status.${statusFiltro}`) }) : t('empty.generated')}
          </div>
        ) : (
          <div className="space-y-3">
            {itemsFiltrados.map(t => (
              <TemporadaCard key={t.id} t={t}
                expanded={expanded === t.id}
                onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
                onVerSemana={(semana) => setSemanaDet({ t, semana })}
                onPausar={() => handlePausar(t.id)}
                onLiberar={() => handleLiberar(t.id, t.colab?.nome_completo)}
                onPreparar={() => handlePreparar(t.colaborador_id, t.colab?.nome_completo)}
                onRegerarTemporada={() => handleRegerarTemporada(t.colaborador_id, t.colab?.nome_completo)}
                onArquivar={() => handleArquivar(t.id, t.colab?.nome_completo)}
                onRegerar={(semana) => handleRegerar(t.id, semana)}
                onSimular={() => handleSimular(t.id, t.colab?.nome_completo || t('fallback.collaborator'))}
                onVerDetalhe={() => handleVerDetalhe(t.id)}
                busy={busy} />
            ))}
          </div>
        )}
      </div>

      {detalhe && <DetalheModal detalhe={detalhe} onClose={() => setDetalhe(null)} />}
      {semanaDet && <SemanaModal det={semanaDet} onClose={() => setSemanaDet(null)} />}

      {simProgress && (
        <div className="fixed bottom-4 right-4 z-40 rounded-xl border border-purple-500/30 bg-[#0a0e1a]/95 backdrop-blur p-4 shadow-xl min-w-[260px]">
          <p className="text-xs font-bold text-purple-300 mb-2">{t('simulation.progressTitle')}</p>
          <p className="text-sm text-white">
            {t.rich('simulation.progressWeek', {
              week: simProgress.semana,
              total: simProgress.total,
              strong: chunks => <span className="text-purple-300 font-bold">{chunks}</span>,
            })}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-purple-400 transition-all" style={{ width: `${(simProgress.semana / simProgress.total) * 100}%` }} />
          </div>
          {simProgress.erros.length > 0 && (
            <p className="text-[10px] text-red-300 mt-2">⚠ {t('simulation.errorCount', { count: simProgress.erros.length })}</p>
          )}
        </div>
      )}
    </div>
  );
}

function TemporadaCard({ t, expanded, onToggle, onPausar, onLiberar, onPreparar, onRegerarTemporada, onArquivar, onRegerar, onSimular, onVerDetalhe, onVerSemana, busy }) {
  const tr = useTranslations('AdminSeasons');
  const colab = t.colab || {};
  const semanas = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
  const descritores = Array.isArray(t.descritores_selecionados) ? t.descritores_selecionados : [];
  const statusKey = t.status || 'ativa';
  const statusCls = STATUS_COLORS[statusKey] || STATUS_COLORS.ativa;

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 pr-3 hover:bg-white/[0.02]">
        <button onClick={onToggle} className="flex-1 px-4 py-3 flex items-center gap-3 text-left">
          {expanded ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}
          <div className="flex-1">
            <div className="text-sm font-bold text-white">{colab.nome_completo || '—'}</div>
            <div className="text-[11px] text-gray-400">{tr('card.meta', { role: colab.cargo || '—', season: t.numero_temporada, focus: formatCompetencias(t) })}</div>
          </div>
          <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${statusCls}`}>{tr(`status.${statusKey}`)}</span>
        </button>
        <button onClick={onVerDetalhe} disabled={busy} title={tr('card.viewProgress')}
          className="p-1.5 rounded hover:bg-white/10 text-cyan-400 disabled:opacity-50">
          <Eye size={14} />
        </button>
        <button onClick={onRegerarTemporada} disabled={busy} title="Regerar temporada inteira (reaplica DUO/single)"
          className="p-1.5 rounded hover:bg-white/10 text-purple-400 disabled:opacity-50">
          <Sparkles size={14} />
        </button>
        <button onClick={onSimular} disabled={busy} title={tr('card.simulateTitle')}
          className="p-1.5 rounded hover:bg-white/10 text-purple-400 disabled:opacity-50 text-[10px] font-bold">
          {tr('card.simulateShort')}
        </button>
        {statusKey !== 'arquivada' && (
          <>
            <button onClick={onLiberar} disabled={busy} title="Liberar semanas agora (antecipa o início — teste/demo)"
              className="p-1.5 rounded hover:bg-white/10 text-emerald-400 disabled:opacity-50">
              <Unlock size={14} />
            </button>
            <button onClick={onPreparar} disabled={busy} title="Pré-gerar entregas (PDF/áudio) das semanas liberadas — abre instantâneo"
              className="p-1.5 rounded hover:bg-white/10 text-cyan-400 disabled:opacity-50">
              <Download size={14} />
            </button>
            <button onClick={onPausar} disabled={busy} title={statusKey === 'pausada' ? tr('card.resume') : tr('card.pause')}
              className="p-1.5 rounded hover:bg-white/10 text-amber-400 disabled:opacity-50">
              {statusKey === 'pausada' ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={onArquivar} disabled={busy} title={tr('card.archive')}
              className="p-1.5 rounded hover:bg-white/10 text-gray-400 disabled:opacity-50">
              <Archive size={14} />
            </button>
          </>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-4">
          {/* Descritores */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 mb-2">{tr('card.selectedDescriptors')}</div>
            <div className="flex flex-wrap gap-2">
              {descritores.map((d, i) => (
                <div key={i} className="text-[11px] px-2 py-1 rounded bg-white/5 border border-white/10">
                  <span className="text-white font-semibold">{d.descritor}</span>
                  <span className="text-gray-400 ml-2">{tr('card.descriptorMeta', { score: d.nota_atual, gap: d.gap?.toFixed(1), weeks: d.semanas_alocadas })}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline 14 semanas */}
          <div>
            <div className="text-[10px] uppercase text-gray-500 mb-2">{tr('card.planTitle')}</div>
            <div className="grid grid-cols-7 gap-2">
              {semanas.map(s => {
                const Icon = s.tipo === 'aplicacao' ? Target : s.tipo === 'avaliacao' ? Sparkles : (FORMAT_ICON[s.conteudo?.formato_core] || BookOpen);
                const cor = TIPO_COLOR[s.tipo];
                return (
                  <div key={s.semana}
                    onClick={() => onVerSemana?.(s.semana)}
                    role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onVerSemana?.(s.semana); } }}
                    title="Ver o que foi entregue nesta semana"
                    className="rounded-lg bg-white/5 border border-white/10 p-2 cursor-pointer hover:bg-white/10 hover:border-cyan-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-gray-400">{tr('week.short', { week: s.semana })}</span>
                      <Icon size={12} style={{ color: cor }} />
                    </div>
                    <div className="text-[10px] text-white font-semibold truncate" title={s.descritor || tr(`types.${s.tipo}`)}>
                      {s.descritor || tr(`types.${s.tipo}`)}
                    </div>
                    <div className="flex items-center justify-between">
                      {s.conteudo?.formato_core && (
                        <div className="text-[9px] text-gray-500 mt-0.5">
                          {s.conteudo.formato_core}{s.conteudo.fallback_gerado ? tr('card.fallbackSuffix') : ''}
                        </div>
                      )}
                      {s.tipo !== 'avaliacao' && (
                        <button onClick={(e) => { e.stopPropagation(); onRegerar(s.semana); }} disabled={busy}
                          title={tr('card.regenerateWeek', { week: s.semana })}
                          className="p-0.5 rounded hover:bg-white/10 text-purple-400 disabled:opacity-50 ml-auto">
                          <RefreshCw size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sample do desafio da semana 1 */}
          {semanas[0]?.conteudo?.desafio_texto && (
            <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3">
              <div className="text-[10px] uppercase text-cyan-400 mb-1">{tr('card.weekOneChallenge')}</div>
              <div className="text-xs text-gray-300 italic">"{semanas[0].conteudo.desafio_texto}"</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DISC_CLS = {
  D: 'bg-red-500/15 text-red-300 border-red-500/30',
  I: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  S: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  C: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
};

/**
 * O que a pessoa REALMENTE recebe numa semana: as 2 pílulas do DUO (a timeline mostra
 * só o label derivado), o conteúdo servido pós-overlay do Kit e o desafio efetivo.
 * Sinaliza quando o conteúdo foi escrito pra OUTRO perfil DISC.
 */
function SemanaModal({ det, onClose }) {
  const { t, semana } = det;
  const plano = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
  const s = plano.find(x => Number(x.semana) === Number(semana)) || {};
  const disc = String(t.colab?.perfil_dominante || '').charAt(0).toUpperCase();
  const entregas = (Array.isArray(s.conteudos_dia) && s.conteudos_dia.length)
    ? s.conteudos_dia
    : (s.conteudo ? [{ competencia: t.competencia_foco, descritor: s.descritor, conteudo: s.conteudo }] : []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="bg-[#12131a] border border-white/10 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#12131a] border-b border-white/10 px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-sm font-bold text-white">Semana {semana} · o que foi entregue</div>
            <div className="text-[11px] text-gray-400">
              {t.colab?.nome_completo || '—'}
              {disc && <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded border ${DISC_CLS[disc] || ''}`}>perfil {disc}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/10 text-gray-400"><X size={16} /></button>
        </div>

        {!entregas.length ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            Semana de {s.tipo === 'aplicacao' ? 'aplicação (missão)' : s.tipo === 'avaliacao' ? 'avaliação' : 'sem entregas'} — não há pílulas de conteúdo.
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {entregas.map((e, i) => {
              const c = e.conteudo || {};
              const vaza = !!c.vaza_disc;
              const doKit = !!c.kit_id;
              // Espelha o week page (ConteudoViewer L644): o snapshot NÃO carrega vídeo —
              // ele é resolvido ao vivo por célula (mb × cargo × DISC), aqui pré-anotado.
              const formatos = [...Object.keys(c.formatos_disponiveis || {}).filter(f => f !== 'video'), ...(c.tem_video ? ['video'] : [])];
              return (
                <div key={i} className={`rounded-lg border p-4 ${vaza ? 'border-red-500/50 bg-red-500/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">Pílula {i + 1}</span>
                    {c.formato_core && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-gray-300">{c.formato_core}</span>}
                    {doKit && !vaza && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">kit do perfil {disc}</span>}
                    {vaza && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500 text-white">
                        ⚠ conteúdo escrito p/ o perfil {c.disc_do_conteudo} — esta pessoa é {disc}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white font-semibold">{e.descritor || '—'}</div>
                  {e.competencia && <div className="text-[11px] text-gray-500">{e.competencia}</div>}
                  {c.core_titulo && <div className="text-xs text-gray-400 italic mt-1">“{c.core_titulo}”</div>}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-[10px] text-gray-500">recebe:</span>
                    {formatos.length ? formatos.map(f => {
                      const FIcon = FORMAT_ICON[f] || FileText;
                      const fid = c.formatos_disponiveis?.[f]?.id || (f === c.formato_core ? c.core_id : null);
                      // texto/case → PDF; audio → podcast; video → player Bunny. Mesmas rotas do week page.
                      // audio → rota ADMIN (gated), que serve o mesmo áudio personalizado
                      // que a pessoa ouve; a rota do colaborador daria o base sem o nome.
                      const href = f === 'video' ? c.video_embed
                        : f === 'audio' ? (fid ? `/api/admin/conteudo/${fid}/podcast?colaboradorId=${t.colaborador_id}` : null)
                        : (fid ? `/api/conteudo/${fid}/pdf` : c.formatos_disponiveis?.[f]?.url || null);
                      const style = { color: FORMAT_COLOR[f], borderColor: `${FORMAT_COLOR[f]}55`, background: `${FORMAT_COLOR[f]}12` };
                      const cls = 'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-opacity';
                      return href ? (
                        <a key={f} href={href} target="_blank" rel="noopener"
                          title={f === 'video' ? 'Abrir o vídeo que a pessoa vê' : f === 'audio' ? 'Abrir o podcast COM a saudação nominal (o mesmo que a pessoa ouve)' : 'Abrir o PDF (versão genérica — a personalização por DISC resolve pela sessão do colaborador)'}
                          className={`${cls} hover:opacity-100 opacity-90 hover:underline`} style={style}>
                          <FIcon size={9} />{f}
                        </a>
                      ) : (
                        <span key={f} className={`${cls} opacity-40`} style={style} title="sem link — conteúdo sem id/url"><FIcon size={9} />{f}</span>
                      );
                    }) : <span className="text-[10px] text-gray-600">—</span>}
                    {!formatos.includes('video') && <span className="text-[10px] text-gray-600 italic">sem vídeo p/ esta célula</span>}
                    {c.tem_video && (c.video_personalizado
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">vídeo com saudação</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">⚠ deck genérico — sem a saudação nominal</span>
                    )}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-1">
                    Vídeo e podcast abrem o que a pessoa recebe, com a saudação nominal (podcast com cache frio leva ~2min na 1ª vez). PDF abre a versão genérica — a personalização por DISC resolve pela sessão do colaborador.
                  </div>
                  {c.desafio_texto && (
                    <div className="mt-3 rounded bg-cyan-500/5 border border-cyan-500/20 p-2.5">
                      <div className="text-[9px] uppercase text-cyan-400 mb-1 tracking-wider">
                        Desafio {doKit ? `(kit · perfil ${disc})` : '(genérico — não há kit deste perfil)'}
                      </div>
                      <div className="text-xs text-gray-300 italic">"{c.desafio_texto}"</div>
                      {c.acao_observavel && <div className="text-[11px] text-gray-500 mt-1.5">Ação observável: {c.acao_observavel}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DetalheModal({ detalhe, onClose }) {
  const { trilha, colab, progresso } = detalhe;
  const semanasPlano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-[#0d1426] rounded-2xl border border-cyan-500/30 max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white">{colab?.nome_completo || '—'}</h2>
            <p className="text-xs text-gray-400">{colab?.cargo} · {formatCompetencias(trilha)}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-3">
          {semanasPlano.map(s => {
            const prog = progresso.find(p => p.semana === s.semana);
            return <SemanaDetalhe key={s.semana} semana={s} progresso={prog} />;
          })}
        </div>
      </div>
    </div>
  );
}

const STATUS_COR = { pendente: 'gray', em_andamento: 'amber', concluido: 'emerald' };

function SemanaDetalhe({ semana, progresso }) {
  const t = useTranslations('AdminSeasons');
  const [open, setOpen] = useState(false);
  const p = progresso || {};
  const statusKey = p.status || 'pendente';
  const cor = STATUS_COR[statusKey];

  const temConteudo = semana.tipo === 'conteudo';
  const temAplicacao = semana.tipo === 'aplicacao';
  const temAvaliacao = semana.tipo === 'avaliacao';

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/[0.03]">
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        <span className="text-[10px] text-gray-500 w-12">{t('week.short', { week: semana.semana })}</span>
        <span className="text-[10px] uppercase text-gray-400 w-20">{t(`types.${semana.tipo}`)}</span>
        <span className="flex-1 text-xs text-white text-left truncate">{semana.descritor || (temAvaliacao ? t('detail.finalEvaluation') : '—')}</span>
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-${cor}-500/20 text-${cor}-400`}>{t(`progressStatus.${statusKey}`)}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-3 text-xs">
          {temConteudo && semana.conteudo && (
            <>
              <Block titulo={t('detail.challenge')} content={semana.conteudo.desafio_texto} />
              {semana.conteudo.acao_observavel && (
                <div className="ml-4 space-y-1 text-[10px]">
                  <div><span className="text-cyan-400/60 uppercase font-semibold">{t('detail.actionLabel')} </span><span className="text-gray-400">{semana.conteudo.acao_observavel}</span></div>
                  {semana.conteudo.criterio_de_execucao && <div><span className="text-cyan-400/60 uppercase font-semibold">{t('detail.criteriaLabel')} </span><span className="text-gray-400">{semana.conteudo.criterio_de_execucao}</span></div>}
                </div>
              )}
            </>
          )}
          {temAplicacao && semana.missao && (
            <>
              <Block titulo={t('detail.mission')} markdown={semana.missao.texto} />
              {semana.missao.acao_principal && (
                <div className="ml-4 space-y-1 text-[10px]">
                  <div><span className="text-amber-400/60 uppercase font-semibold">{t('detail.actionLabel')} </span><span className="text-gray-400">{semana.missao.acao_principal}</span></div>
                  {semana.missao.criterio_de_execucao && <div><span className="text-amber-400/60 uppercase font-semibold">{t('detail.criteriaLabel')} </span><span className="text-gray-400">{semana.missao.criterio_de_execucao}</span></div>}
                </div>
              )}
            </>
          )}
          {temAplicacao && semana.cenario && (
            <>
              <Block titulo={t('detail.scenario')} markdown={semana.cenario.texto} />
              {semana.cenario.tradeoff_testado && (
                <div className="ml-4 space-y-1 text-[10px]">
                  <div><span className="text-purple-400/60 uppercase font-semibold">{t('detail.tradeoffLabel')} </span><span className="text-gray-400">{semana.cenario.tradeoff_testado}</span></div>
                  {semana.cenario.armadilha_resposta_generica && <div><span className="text-purple-400/60 uppercase font-semibold">{t('detail.trapLabel')} </span><span className="text-gray-400">{semana.cenario.armadilha_resposta_generica}</span></div>}
                </div>
              )}
            </>
          )}
          {temAvaliacao && p.reflexao?.cenario && (
            <Block titulo={t('detail.week14Scenario')} markdown={p.reflexao.cenario} />
          )}

          {p.reflexao && (
            <>
              {p.reflexao.desafio_realizado && (
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="text-gray-500">{t('detail.challengeLabel')}</span>
                  <span className="text-white font-bold">{p.reflexao.desafio_realizado}</span>
                  {p.reflexao.qualidade_reflexao && <span className="text-gray-500">· {t('detail.qualityLabel')} <span className="text-cyan-400">{p.reflexao.qualidade_reflexao}</span></span>}
                  {p.reflexao.sinais_extraidos && (
                    <span className="text-gray-500">·
                      {p.reflexao.sinais_extraidos.exemplo_concreto && <span className="text-emerald-400 ml-1">{t('detail.signals.example')}</span>}
                      {p.reflexao.sinais_extraidos.autopercepcao && <span className="text-emerald-400 ml-1">{t('detail.signals.selfPerception')}</span>}
                      {p.reflexao.sinais_extraidos.compromisso_especifico && <span className="text-emerald-400 ml-1">{t('detail.signals.commitment')}</span>}
                    </span>
                  )}
                </div>
              )}
              {p.reflexao.insight_principal && <Block titulo={t('detail.insight')} content={p.reflexao.insight_principal} />}
              {p.reflexao.compromisso_proxima && <Block titulo={t('detail.commitment')} content={p.reflexao.compromisso_proxima} />}
              {p.reflexao.limites_da_conversa?.length > 0 && (
                <div className="text-[10px] text-amber-400/70">{p.reflexao.limites_da_conversa.join(' · ')}</div>
              )}
              {p.reflexao.transcript_completo?.length > 0 && <Transcript title={t('detail.reflectionConversation')} items={p.reflexao.transcript_completo} />}
            </>
          )}

          {p.feedback && (
            <>
              {p.feedback.cenario_resposta && <Block titulo={t('detail.scenarioAnswer')} content={p.feedback.cenario_resposta} />}
              {Array.isArray(p.feedback.avaliacao_por_descritor) && (
                <div>
                  <div className="text-[10px] uppercase text-gray-500 mb-1">{t('detail.descriptorEvaluation')}</div>
                  <div className="space-y-1">
                    {p.feedback.avaliacao_por_descritor.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-white/5">
                        <span className="text-white font-bold flex-1">{a.descritor}</span>
                        <span className="text-cyan-400">{a.nota || a.nota_pos}</span>
                        {a.forca_evidencia && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded ${a.forca_evidencia === 'forte' ? 'bg-emerald-500/20 text-emerald-400' : a.forca_evidencia === 'moderada' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                            {a.forca_evidencia}
                          </span>
                        )}
                        <span className="text-gray-400 flex-[2]">{a.observacao || a.justificativa}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {p.feedback.alertas_metodologicos?.length > 0 && (
                <div className="text-[10px] text-amber-400/70">{p.feedback.alertas_metodologicos.join(' · ')}</div>
              )}
              {p.feedback.sintese_bloco && <Block titulo={t('detail.blockSummary')} content={p.feedback.sintese_bloco} />}
              {p.feedback.transcript_completo?.length > 0 && <Transcript title={t('detail.feedbackConversation')} items={p.feedback.transcript_completo} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatCompetencias(trilha) {
  return Array.isArray(trilha?.competencias_foco) && trilha.competencias_foco.length > 1
    ? trilha.competencias_foco.join(' + ')
    : trilha?.competencia_foco;
}

function Block({ titulo, content, markdown }: { titulo?: any; content?: any; markdown?: any }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-gray-500 mb-1">{titulo}</div>
      <div className="text-[11px] text-gray-300 italic whitespace-pre-wrap p-2 rounded bg-white/5">
        {markdown ? <ReactMarkdown>{String(markdown)}</ReactMarkdown> : (content || '—')}
      </div>
    </div>
  );
}

function Transcript({ title, items }) {
  const t = useTranslations('AdminSeasons');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="text-[10px] uppercase text-gray-500 hover:text-cyan-400 flex items-center gap-1">
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title} ({t('detail.messages', { count: items.length })})
      </button>
      {open && (
        <div className="mt-2 space-y-2 max-h-96 overflow-auto">
          {items.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-[11px] ${
                m.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-white/5 text-gray-200 border border-white/10'
              }`}>
                {m.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
