'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Loader2, Trophy, Trash2, Plus, X, Search, ChevronDown,
  Briefcase, FileText, Target, Brain, RefreshCw, CheckCircle, AlertTriangle
} from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  loadTop10TodosCargos, adicionarTop10, removerTop10, loadGabaritosCargos, loadCenarios,
  regenerarCenario, checkCenarioUm, limparCenariosAntigos, excluirCenario
} from '@/actions/fase1';
import { loadCompetencias } from '@/app/admin/competencias/actions';
import { loadCargos, salvarTop5 } from '@/app/admin/cargos/actions';

export default function Fase1Page({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tr = useTranslations('AdminPhase1');
  const initialTab = searchParams.get('tab');

  const [tab, setTab] = useState(
    ['top10', 'top5', 'gabarito', 'cenarios'].includes(initialTab || '') ? (initialTab as string) : 'top10'
  );
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Top10
  const [top10, setTop10] = useState([]);
  const [allComps, setAllComps] = useState([]);
  const [showAdd, setShowAdd] = useState(null);
  const [addSearch, setAddSearch] = useState('');

  // Gabarito
  const [gabaritos, setGabaritos] = useState([]);
  const [gabOpen, setGabOpen] = useState(null);

  // Top 5
  const [cargosData, setCargosData] = useState([]);
  const [top5Edits, setTop5Edits] = useState({});
  const [savingTop5, setSavingTop5] = useState({});

  // Cenários
  const [cenarios, setCenarios] = useState([]);
  const [cenOpen, setCenOpen] = useState(null);
  const [cenAction, setCenAction] = useState(null);
  const [cenProgress, setCenProgress] = useState<{ current: number; total: number; label: string; cargo: string } | null>(null);
  const [selectedCen, setSelectedCen] = useState<Set<string>>(new Set());
  function toggleSelCen(id: string) {
    setSelectedCen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }

  // Regenera (+ re-checa) um conjunto de cenários de um cargo, em lote.
  async function regenerarLote(cargo: string, lista: any[]) {
    if (!lista.length || cenAction) return;
    let ok = 0, semCheck = 0;
    for (let idx = 0; idx < lista.length; idx++) {
      const c = lista[idx];
      setCenAction({ id: c.id, type: 'regen' });
      setCenProgress({ current: idx + 1, total: lista.length, label: c.titulo || `Cenário ${idx + 1}`, cargo });
      try {
        const r = await regenerarCenario(c.id);
        if (r.success) { const r2 = await checkCenarioUm(c.id); if (r2.success) ok++; else semCheck++; }
        else semCheck++;
      } catch (e: any) { console.warn('regen lote:', e?.message); semCheck++; }
    }
    setCenAction(null);
    setCenProgress(null);
    setSelectedCen(prev => { const n = new Set(prev); lista.forEach(c => n.delete(c.id)); return n; });
    flash(tr('messages.reviewedBatch', { ok, unchecked: semCheck }));
    refresh();
  }

  const refresh = useCallback(async () => {
    const [t, c, g] = await Promise.all([
      loadTop10TodosCargos(empresaId),
      loadCompetencias(empresaId),
      loadGabaritosCargos(empresaId),
    ]);
    setTop10(t);
    if (c.success) setAllComps(c.data || []);
    setGabaritos(g);

    // Top 5 (cargos com competências top10)
    const cargosR = await loadCargos(empresaId);
    if (cargosR.success) {
      setCargosData(cargosR.data || []);
      const edits = {};
      (cargosR.data || []).forEach(c => { edits[c.id] = c.top5_workshop || []; });
      setTop5Edits(edits);
    }

    // Cenários
    const cens = await loadCenarios(empresaId);
    setCenarios(cens);

    setLoading(false);
  }, [empresaId]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Top10 helpers ──
  const cargosTop10 = [...new Set(top10.map(t => t.cargo))].sort();

  const selItems = showAdd ? top10.filter(t => t.cargo === showAdd) : [];
  const selectedIds = new Set(selItems.map(t => t.competencia_id));
  const selectedCods = new Set(selItems.map(t => t.competencia?.cod_comp).filter(Boolean));
  const availComps = showAdd ? (() => {
    const seen = new Set();
    return allComps.filter(c => {
      if (c.cargo && c.cargo !== showAdd) return false;
      const key = c.cod_comp || c.nome;
      if (seen.has(key)) return false; seen.add(key);
      if (selectedIds.has(c.id)) return false;
      if (c.cod_comp && selectedCods.has(c.cod_comp)) return false;
      if (addSearch) { const s = addSearch.toLowerCase(); return c.nome.toLowerCase().includes(s) || (c.pilar || '').toLowerCase().includes(s); }
      return true;
    });
  })() : [];

  // ── Gabarito helpers ──
  const parseJSON = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };

  // ── Cenários helpers ──
  const DIM_MAX: Record<string, number> = {
    aderencia_competencia: 15, cobertura_descritores: 15, realismo_contextual: 15,
    contencao_sobriedade: 10, clareza_tradeoff: 15, poder_discriminante: 20, auditabilidade: 10,
    // Legacy
    aderencia: 20, realismo: 20, contencao: 20, decisao: 20, discriminante: 20,
  };
  const DIM_LABELS: Record<string, string> = {
    aderencia_competencia: 'Aderência', cobertura_descritores: 'Cobertura', realismo_contextual: 'Realismo',
    contencao_sobriedade: 'Contenção', clareza_tradeoff: 'Trade-off', poder_discriminante: 'Discriminante', auditabilidade: 'Auditab.',
    // Legacy
    aderencia: 'Aderência', realismo: 'Realismo', contencao: 'Contenção', decisao: 'Decisão', discriminante: 'Discriminante',
  };

  const cenariosPorCargo = {};
  cenarios.forEach(c => {
    if (!cenariosPorCargo[c.cargo]) cenariosPorCargo[c.cargo] = [];
    cenariosPorCargo[c.cargo].push(c);
  });

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold shadow-lg">{toast}</div>}

      {/* Header */}
      <BackButton onClick={() => router.push(`/admin/empresas/${empresaId}`)} />
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Brain size={20} className="text-blue-400" /> {tr('title')}
          </h1>
          <p className="text-xs text-gray-500">{tr('subtitle')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'top10', label: tr('tabs.top10'), icon: Trophy, color: 'text-amber-400', count: top10.length },
          { key: 'top5', label: tr('tabs.top5'), icon: Target, color: 'text-orange-400', count: cargosData.filter(c => c.top5_workshop?.length).length },
          { key: 'gabarito', label: tr('tabs.idealRoleProfile'), icon: Target, color: 'text-purple-400', count: gabaritos.length },
          { key: 'cenarios', label: tr('tabs.scenarios'), icon: FileText, color: 'text-green-400', count: cenarios.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <t.icon size={14} className={tab === t.key ? t.color : ''} />
            {t.label}
            {t.count > 0 && <span className="text-[9px] bg-white/[0.08] px-1.5 py-0.5 rounded">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: TOP 10 ══════════════ */}
      {tab === 'top10' && (
        <div>
          {top10.length === 0 ? (
            <Empty icon={Trophy} text={tr('empty.top10')} />
          ) : cargosTop10.map(cargo => {
            const items = top10.filter(t => t.cargo === cargo);
            return (
              <div key={cargo} className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-white">{cargo}</h2>
                  <div className="flex items-center gap-2">
                    <Badge count={items.length} max={10} />
                    <button onClick={() => { setShowAdd(cargo); setAddSearch(''); }}
                      className="text-[10px] font-semibold text-green-400 hover:text-green-300 flex items-center gap-0.5">
                      <Plus size={10} /> {tr('actions.add')}
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                  {items.map((t, i) => (
                    <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                      <span className="text-[10px] font-mono text-amber-400 font-bold w-5 text-center shrink-0">{t.posicao}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{t.competencia?.nome || '—'}</span>
                          {t.competencia?.cod_comp && <span className="text-[9px] font-mono text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded">{t.competencia.cod_comp}</span>}
                        </div>
                        {(t.motivo || t.justificativa) && <p className="text-[10px] text-gray-500 mt-0.5">{t.motivo || t.justificativa}</p>}
                        {(t.aderencia_cargo != null || t.aderencia_mercado != null) && (
                          <div className="flex items-center gap-4 mt-1.5">
                            {t.aderencia_cargo != null && (
                              <div className="flex items-center gap-1.5 flex-1">
                                <span className="text-[9px] text-gray-500 shrink-0 w-10">{tr('labels.role')}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.round(t.aderencia_cargo * 100)}%` }} />
                                </div>
                                <span className="text-[9px] font-bold text-cyan-400 shrink-0">{Math.round(t.aderencia_cargo * 100)}%</span>
                              </div>
                            )}
                            {t.aderencia_mercado != null && (
                              <div className="flex items-center gap-1.5 flex-1">
                                <span className="text-[9px] text-gray-500 shrink-0 w-14">{tr('labels.market')}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div className="h-full rounded-full bg-purple-400" style={{ width: `${Math.round(t.aderencia_mercado * 100)}%` }} />
                                </div>
                                <span className="text-[9px] font-bold text-purple-400 shrink-0">{Math.round(t.aderencia_mercado * 100)}%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <button onClick={async () => { const r = await removerTop10(t.id); if (r.success) { flash(tr('messages.removed')); refresh(); } }}
                        className="text-gray-600 hover:text-red-400 shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Modal adicionar */}
          {showAdd && (
            <Modal onClose={() => setShowAdd(null)} title={tr('modal.addTitle', { role: showAdd })}>
              <div className="relative mb-2">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder={tr('searchPlaceholder')}
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none focus:border-cyan-400/50" style={{ background: '#091D35' }} />
              </div>
              <div className="max-h-[400px] overflow-y-auto space-y-0.5">
                {availComps.length === 0 ? (
                  <p className="text-[10px] text-gray-500 text-center py-4">{tr('empty.noneAvailable')}</p>
                ) : availComps.map(c => (
                  <button key={c.id} onClick={async () => {
                    const r = await adicionarTop10(empresaId, showAdd, c.id);
                    if (r.success) { flash(tr('messages.added')); refresh(); }
                  }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-white/[0.04] transition-colors">
                    <Plus size={10} className="text-green-400 shrink-0" />
                    <span className="text-[11px] text-white font-medium">{c.nome}</span>
                    {c.pilar && <span className="text-[9px] text-gray-500">{c.pilar}</span>}
                  </button>
                ))}
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ══════════════ TAB: TOP 5 (editável — workshop) ══════════════ */}
      {tab === 'top5' && (
        <div>
          <div className="rounded-xl p-3 mb-4 border border-cyan-400/15 bg-cyan-400/[0.04] text-[11px] text-cyan-100/85 leading-relaxed">
            <strong className="text-cyan-300">{tr('workshop.title')}:</strong>{' '}
            <span className="text-cyan-100/70">
              {tr('workshop.beforeQuantity')}{' '}
              <strong className="text-cyan-100/90">{tr('workshop.anyQuantity')}</strong>
              {tr('workshop.afterQuantity')}{' '}
            </span>
            <button onClick={() => router.push(`/admin/empresas/${empresaId}/votacao`)}
              className="underline text-cyan-300 hover:text-cyan-200">
              {tr('workshop.voting')}
            </button>
            <span className="text-cyan-100/70">.</span>
          </div>

          {cargosData.length === 0 ? (
            <Empty icon={Target} text={tr('empty.noRoles')} />
          ) : cargosData.map(cargo => {
            const top10 = cargo.competencias_top10 || [];
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cargo.id);
            const selected: string[] = top5Edits[cargo.id] || [];
            const dirty = JSON.stringify(selected) !== JSON.stringify(cargo.top5_workshop || []);
            const isSaving = !!savingTop5[cargo.id];

            const toggle = (comp: string) => {
              const cur = selected.includes(comp)
                ? selected.filter((c) => c !== comp)
                : [...selected, comp];
              setTop5Edits((prev) => ({ ...prev, [cargo.id]: cur }));
            };

            const salvar = async () => {
              if (!isUuid) { flash(tr('messages.roleNeedsCatalog')); return; }
              setSavingTop5((prev) => ({ ...prev, [cargo.id]: true }));
              const r = await salvarTop5(cargo.id, selected);
              setSavingTop5((prev) => ({ ...prev, [cargo.id]: false }));
              if (r.success) { flash(tr('messages.savedCount', { role: cargo.nome, count: selected.length })); refresh(); }
              else flash(tr('messages.error', { error: r.error }));
            };

            return (
              <div key={cargo.id} className="mb-4 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white">{cargo.nome}</h3>
                    <p className="text-[10px] text-gray-500">
                      {tr('labels.selectedOf', { selected: selected.length, total: top10.length })}
                      {dirty && <span className="text-amber-400 ml-2">· {tr('labels.unsaved')}</span>}
                    </p>
                  </div>
                  {top10.length > 0 && (
                    <button
                      onClick={salvar}
                      disabled={!dirty || isSaving || !isUuid}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40 disabled:cursor-not-allowed">
                      {isSaving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                      {tr('actions.save')}
                    </button>
                  )}
                </div>

                <div className="p-4">
                  {top10.length === 0 ? (
                    <p className="text-[11px] text-gray-500 italic">{tr('empty.top10ForRole')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {top10.map((comp, i) => {
                        const marcado = selected.includes(comp);
                        return (
                          <button
                            type="button"
                            key={comp + i}
                            onClick={() => toggle(comp)}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                              marcado ? 'border border-cyan-400/30' : 'border border-transparent hover:border-white/[0.08]'
                            }`}
                            style={{ background: marcado ? 'rgba(52,197,204,0.08)' : 'rgba(255,255,255,0.02)' }}>
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                marcado ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20 bg-transparent'
                              }`}>
                              {marcado && <CheckCircle size={11} className="text-cyan-400" />}
                            </span>
                            <span className="text-[10px] font-mono text-amber-400/70 w-4 text-center shrink-0">{i + 1}</span>
                            <span className={`text-xs ${marcado ? 'font-bold text-white' : 'text-gray-400'}`}>{comp}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ TAB: GABARITO CIS ══════════════ */}
      {tab === 'gabarito' && (
        <div>
          {gabaritos.length === 0 ? (
            <Empty icon={Target} text={tr('empty.idealProfile')} />
          ) : gabaritos.map(g => {
            const gab = parseJSON(g.gabarito);
            const rac = parseJSON(g.raciocinio_ia2);
            const isOpen = gabOpen === g.nome;
            if (!gab) return null;

            // Compatibilidade: tela1/tela2 podem ser array (legado) ou objeto (novo)
            const t1Items = Array.isArray(gab.tela1) ? gab.tela1 : (gab.tela1?.caracteristicas || []);
            const t1Conf = gab.tela1?.confianca;
            const t2Items = Array.isArray(gab.tela2) ? gab.tela2 : (gab.tela2?.subcompetencias || []);
            const t2Conf = gab.tela2?.confianca;
            const t3 = gab.tela3 || {};
            const t3Conf = t3.confianca;
            const t4 = gab.tela4 || {};
            const t4Conf = t4.confianca;

            return (
              <div key={g.id} className="mb-3 rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <button onClick={() => setGabOpen(isOpen ? null : g.nome)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-bold text-white">{g.nome}</span>
                    {g.confianca_media_ia2 != null && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        g.confianca_media_ia2 >= 0.8 ? 'bg-green-400/15 text-green-400' :
                        g.confianca_media_ia2 >= 0.6 ? 'bg-amber-400/15 text-amber-400' :
                        'bg-red-400/15 text-red-400'
                      }`}>{Math.round(g.confianca_media_ia2 * 100)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {t3.executor != null && <span className="text-[10px] text-gray-500">
                      E:{t3.executor}% · M:{t3.motivador}% · Me:{t3.metodico}% · S:{t3.sistematico}%
                    </span>}
                    <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-4 border-t border-white/[0.04]">
                    {/* Tela 1 */}
                    {t1Items.length > 0 && (
                      <div className="pt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="cyan">{tr('sections.profileCharacteristics')}</SectionTitle>
                          {t1Conf != null && <span className="text-[9px] text-gray-500">{tr('labels.confidenceShort')}: {Math.round(t1Conf * 100)}%</span>}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {t1Items.map((c: any, i: number) => {
                            const isObj = typeof c === 'object';
                            const label = isObj ? c.polo_escolhido : c;
                            const intensidade = isObj ? c.intensidade : null;
                            return (
                              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-300 inline-flex items-center gap-1" title={isObj ? c.justificativa : undefined}>
                                {label}
                                {intensidade && (
                                  <span className={`text-[8px] px-1 py-0.5 rounded ${
                                    intensidade === 'alta' ? 'bg-red-400/15 text-red-300' :
                                    intensidade === 'moderada' ? 'bg-amber-400/15 text-amber-300' :
                                    'bg-gray-400/15 text-gray-400'
                                  }`}>{intensidade}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {/* Tela 2 */}
                    {t2Items.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="amber">{tr('sections.cisSubcompetencies')}</SectionTitle>
                          {t2Conf != null && <span className="text-[9px] text-gray-500">{tr('labels.confidenceShort')}: {Math.round(t2Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {t2Items.map((s: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#091D35' }}>
                              <span className={`text-xs font-bold w-4 ${discColor(s.dimensao)}`}>{s.dimensao}</span>
                              <span className="text-xs text-white font-medium flex-1">{s.nome}</span>
                              <span className="text-[10px] text-gray-500">{s.faixa_min} → {s.faixa_max}</span>
                              {s.prioridade && <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                s.prioridade === 'alta' ? 'bg-red-400/10 text-red-300' :
                                s.prioridade === 'media' ? 'bg-amber-400/10 text-amber-300' :
                                'bg-gray-400/10 text-gray-400'
                              }`}>{s.prioridade}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Tela 3 */}
                    {t3.executor != null && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="green">{tr('sections.leadershipStyles')}</SectionTitle>
                          {t3.estilo_predominante && <span className="text-[10px] text-green-300/70">{t3.estilo_predominante}</span>}
                          {t3Conf != null && <span className="text-[9px] text-gray-500">{tr('labels.confidenceShort')}: {Math.round(t3Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { key: 'executor', label: tr('leadership.executor'), color: '#EF4444' },
                            { key: 'motivador', label: tr('leadership.motivator'), color: '#F59E0B' },
                            { key: 'metodico', label: tr('leadership.methodical'), color: '#22C55E' },
                            { key: 'sistematico', label: tr('leadership.systematic'), color: '#3B82F6' },
                          ].map(e => (
                            <div key={e.key} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                              <div className="text-2xl font-bold" style={{ color: e.color }}>{t3[e.key]}%</div>
                              <div className="text-[10px] text-gray-500 mt-1">{e.label}</div>
                            </div>
                          ))}
                        </div>
                        {t3.justificativa && <p className="text-[10px] text-gray-400 mt-2 italic">{t3.justificativa}</p>}
                      </div>
                    )}
                    {/* Tela 4 */}
                    {(t4.D || t4.I || t4.S || t4.C) && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <SectionTitle color="red">{tr('sections.idealDiscRanges')}</SectionTitle>
                          {t4Conf != null && <span className="text-[9px] text-gray-500">{tr('labels.confidenceShort')}: {Math.round(t4Conf * 100)}%</span>}
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {['D', 'I', 'S', 'C'].map(dim => {
                            const f = t4[dim];
                            return f ? (
                              <div key={dim} className="text-center p-3 rounded-lg" style={{ background: '#091D35' }}>
                                <span className={`text-lg font-bold ${discColor(dim)}`}>{dim}</span>
                                <p className="text-[10px] text-gray-400 mt-1">{f.min}</p>
                                <p className="text-[10px] text-gray-500">→ {f.max}</p>
                              </div>
                            ) : null;
                          })}
                        </div>
                        {t4.justificativa && <p className="text-[10px] text-gray-400 mt-2 italic">{t4.justificativa}</p>}
                      </div>
                    )}
                    {/* Raciocínio */}
                    {rac && (
                      <div className="pt-2 border-t border-white/[0.04]">
                        <SectionTitle color="gray">{tr('sections.aiReasoning')}</SectionTitle>
                        {rac.sinais_do_caso?.length > 0 && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">{tr('reasoning.signals')}:</span> {rac.sinais_do_caso.join('; ')}</p>}
                        {rac.hipotese_base && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">{tr('reasoning.hypothesis')}:</span> {rac.hipotese_base}</p>}
                        {rac.leitura_principal && <p className="text-[11px] text-gray-400 mb-1"><span className="text-gray-500 font-semibold">{tr('reasoning.reading')}:</span> {rac.leitura_principal}</p>}
                        {rac.incertezas && <p className="text-[11px] text-amber-300/60 mb-1"><span className="text-amber-400/80 font-semibold">{tr('reasoning.uncertainties')}:</span> {rac.incertezas}</p>}
                        {rac.diferenciais_vs_outros_cargos && <p className="text-[11px] text-gray-400"><span className="text-gray-500 font-semibold">{tr('reasoning.differentials')}:</span> {typeof rac.diferenciais_vs_outros_cargos === 'string' ? rac.diferenciais_vs_outros_cargos : (Array.isArray(rac.diferenciais_vs_outros_cargos) ? rac.diferenciais_vs_outros_cargos.join('; ') : '')}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════ TAB: CENÁRIOS ══════════════ */}
      {tab === 'cenarios' && (
        <div>
          {cenarios.length === 0 ? (
            <Empty icon={FileText} text={tr('empty.scenarios')} />
          ) : (<>
          {Object.entries(cenariosPorCargo).map(([cargo, cens]: [string, any]) => {
            const aprovados = cens.filter(c => c.status_check === 'aprovado').length;
            const ressalvas = cens.filter(c => c.status_check === 'aprovado_com_ressalvas').length;
            const revisar = cens.filter(c => c.status_check === 'revisar').length;
            const pendentes = cens.filter(c => !c.status_check).length;
            return (
              <div key={cargo} className="mb-6">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h2 className="text-sm font-bold text-white">{cargo}</h2>
                  <span className="text-[10px] text-gray-500">{tr('stats.scenarios', { count: cens.length })}</span>
                  {aprovados > 0 && <span className="text-[9px] bg-green-400/15 text-green-400 px-1.5 py-0.5 rounded">{tr('stats.approved', { count: aprovados })}</span>}
                  {ressalvas > 0 && <span className="text-[9px] bg-cyan-400/15 text-cyan-400 px-1.5 py-0.5 rounded">{tr('stats.withNotes', { count: ressalvas })}</span>}
                  {revisar > 0 && <span className="text-[9px] bg-amber-400/15 text-amber-400 px-1.5 py-0.5 rounded">{tr('stats.review', { count: revisar })}</span>}
                  {pendentes > 0 && <span className="text-[9px] bg-gray-400/15 text-gray-400 px-1.5 py-0.5 rounded">{tr('stats.pending', { count: pendentes })}</span>}
                  {(revisar > 0 || ressalvas > 0) && (
                    <button
                      disabled={!!cenAction}
                      onClick={async () => {
                        const paraRevisar = cens.filter(c => c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas');
                        let ok = 0, semCheck = 0;
                        for (let idx = 0; idx < paraRevisar.length; idx++) {
                          const c = paraRevisar[idx];
                          setCenAction({ id: c.id, type: 'regen' });
                          setCenProgress({ current: idx + 1, total: paraRevisar.length, label: c.titulo || tr('fallbackScenarioWithIndex', { index: idx + 1 }), cargo });
                          try {
                            const r = await regenerarCenario(c.id);
                            if (r.success) {
                              const r2 = await checkCenarioUm(c.id);
                              if (r2.success) ok++; else semCheck++;
                            }
                          } catch (e) {
                            console.warn('regen lote:', e.message);
                            semCheck++;
                          }
                        }
                        setCenAction(null);
                        setCenProgress(null);
                        flash(tr('messages.reviewedBatch', { ok, unchecked: semCheck }));
                        refresh();
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-amber-300 border border-amber-400/40 hover:bg-amber-400/10 transition-all disabled:opacity-50 ml-auto">
                      <RefreshCw size={10} /> {tr('actions.reviewAll', { count: revisar + ressalvas })}
                    </button>
                  )}
                  {(() => {
                    const sel = cens.filter((c: any) => selectedCen.has(c.id));
                    return sel.length > 0 ? (
                      <button disabled={!!cenAction} onClick={() => regenerarLote(cargo, sel)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-violet-300 border border-violet-400/40 hover:bg-violet-400/10 transition-all disabled:opacity-50">
                        <RefreshCw size={10} /> Regerar selecionados ({sel.length})
                      </button>
                    ) : null;
                  })()}
                  {pendentes > 0 && (
                    <button
                      disabled={!!cenAction}
                      onClick={async () => {
                        const semNota = cens.filter(c => !c.nota_check);
                        let ok = 0, erro = 0;
                        for (const c of semNota) {
                          setCenAction({ id: c.id, type: 'check' });
                          try {
                            const r = await checkCenarioUm(c.id);
                            if (r.success) ok++; else erro++;
                          } catch (e) { console.warn('check lote:', e.message); erro++; }
                        }
                        setCenAction(null);
                        flash(tr('messages.validatedBatch', { ok, errors: erro }));
                        refresh();
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-cyan-300 border border-cyan-400/40 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                      <CheckCircle size={10} /> {tr('actions.validateAll', { count: pendentes })}
                    </button>
                  )}
                </div>
                {cenProgress && cenProgress.cargo === cargo && (
                  <div className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-amber-400 font-bold">{tr('progress.reviewing', { current: cenProgress.current, total: cenProgress.total })}</span>
                      <span className="text-gray-400 truncate ml-3 max-w-[300px]">{cenProgress.label}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400 transition-all duration-300"
                        style={{ width: `${Math.round((cenProgress.current / cenProgress.total) * 100)}%` }} />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {cens.map((c: any) => {
                    const isOpen = cenOpen === c.id;
                    const altObj = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
                    const perguntas = altObj.perguntas || (Array.isArray(c.alternativas) ? c.alternativas : []);
                    const isActing = cenAction?.id === c.id;
                    const dims = typeof c.dimensoes_check === 'string' ? JSON.parse(c.dimensoes_check) : c.dimensoes_check;

                    return (
                      <div key={c.id} className={`rounded-xl border overflow-hidden ${
                        c.status_check === 'aprovado' ? 'border-green-400/20' :
                        c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20' :
                        c.status_check === 'revisar' ? 'border-amber-400/20' : 'border-white/[0.06]'
                      }`} style={{ background: '#0F2A4A' }}>
                        {/* Header */}
                        <div className="flex items-center">
                          <input type="checkbox" checked={selectedCen.has(c.id)} onChange={() => toggleSelCen(c.id)}
                            className="ml-3 shrink-0 w-3.5 h-3.5 accent-violet-400 cursor-pointer" title="Selecionar para regerar em lote" />
                          <button onClick={() => setCenOpen(isOpen ? null : c.id)}
                            className="flex-1 min-w-0 flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            {c.status_check === 'aprovado' && <CheckCircle size={14} className="text-green-400 shrink-0" />}
                            {c.status_check === 'aprovado_com_ressalvas' && <CheckCircle size={14} className="text-cyan-400 shrink-0" />}
                            {c.status_check === 'revisar' && <AlertTriangle size={14} className="text-amber-400 shrink-0" />}
                            <span className="text-xs font-bold text-white">{c.titulo || tr('fallbackScenarioTitle')}</span>
                            {c.competencia_nome && <span className="text-[10px] text-cyan-400">{c.competencia_nome}</span>}
                            {c.ppp_nome && (
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                c.ppp_escola_id ? 'bg-violet-400/15 text-violet-300' : 'bg-white/[0.06] text-gray-400'
                              }`} title={c.ppp_escola_id ? `PPP: ${c.ppp_nome}` : 'Cenário de rede (sem PPP específico)'}>
                                {c.ppp_escola_id ? `🏫 ${c.ppp_nome}` : 'Rede'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.nota_check != null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                c.status_check === 'aprovado' ? 'bg-green-400/15 text-green-400' :
                                c.status_check === 'aprovado_com_ressalvas' ? 'bg-cyan-400/15 text-cyan-400' :
                                'bg-amber-400/15 text-amber-400'
                              }`}>{c.nota_check}pts</span>
                            )}
                            <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </div>
                          </button>
                        </div>

                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-white/[0.04]">
                            {/* Contexto */}
                            <p className="text-xs text-gray-300 leading-relaxed mt-3 mb-4">{c.descricao}</p>

                            {/* Metadados do cenário */}
                            {(() => {
                              const alt = typeof c.alternativas === 'object' && !Array.isArray(c.alternativas) ? c.alternativas : {};
                              if (!alt.faceta_testada_principal && !alt.tradeoff_testado) return null;
                              return (
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {alt.faceta_testada_principal && (
                                    <span className="text-[9px] px-2 py-1 rounded-full bg-purple-400/10 text-purple-300 border border-purple-400/15">
                                      {tr('details.facet')}: {alt.faceta_testada_principal}
                                    </span>
                                  )}
                                  {alt.tradeoff_testado && (
                                    <span className="text-[9px] px-2 py-1 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/15">
                                      {tr('details.tradeoff')}: {alt.tradeoff_testado}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Perguntas */}
                            {perguntas.length > 0 && (
                              <div className="space-y-2 mb-4">
                                {perguntas.map((p, i) => (
                                  <div key={i} className="p-3 rounded-lg" style={{ background: '#091D35' }}>
                                    <p className="text-xs font-bold text-white mb-1">
                                      P{p.numero || i + 1}: {p.texto || (typeof p === 'string' ? p : JSON.stringify(p))}
                                    </p>
                                    {p.descritores_primarios && (
                                      <p className="text-[9px] text-cyan-400/60">{tr('details.descriptors')}: {Array.isArray(p.descritores_primarios) ? p.descritores_primarios.map(d => `D${d}`).join(', ') : p.descritores_primarios}</p>
                                    )}
                                    {p.o_que_diferencia_niveis && (
                                      <p className="text-[10px] text-gray-500 mt-1">{p.o_que_diferencia_niveis}</p>
                                    )}
                                    {p.objetivo_diagnostico && (
                                      <p className="text-[9px] text-purple-300/60 mt-1">🎯 {p.objetivo_diagnostico}</p>
                                    )}
                                    {p.resposta_generica_falha_porque && (
                                      <p className="text-[9px] text-amber-300/60 mt-1">⚡ {tr('details.antiGeneric')}: {p.resposta_generica_falha_porque}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Resultado do Check */}
                            {c.nota_check != null && (
                              <div className={`p-3 rounded-lg border mb-3 ${
                                c.status_check === 'aprovado' ? 'border-green-400/20 bg-green-400/5' :
                                c.status_check === 'aprovado_com_ressalvas' ? 'border-cyan-400/20 bg-cyan-400/5' :
                                'border-amber-400/20 bg-amber-400/5'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`text-xs font-bold ${
                                    c.status_check === 'aprovado' ? 'text-green-400' :
                                    c.status_check === 'aprovado_com_ressalvas' ? 'text-cyan-400' : 'text-amber-400'
                                  }`}>
                                    {tr('details.check')}: {c.nota_check}pts — {
                                      c.status_check === 'aprovado' ? tr('status.approved') :
                                      c.status_check === 'aprovado_com_ressalvas' ? tr('status.approvedWithNotes') : tr('status.review')
                                    }
                                  </span>
                                </div>
                                {/* Dimensões */}
                                {dims && (
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    {Object.entries(dims).map(([k, v]: [string, any]) => {
                                      const max = DIM_MAX[k] || 20;
                                      const pct = (v / max) * 100;
                                      return (
                                        <span key={k} className={`text-[9px] px-1.5 py-0.5 rounded ${
                                          pct >= 85 ? 'bg-green-400/10 text-green-400' :
                                          pct >= 65 ? 'bg-amber-400/10 text-amber-400' :
                                          'bg-red-400/10 text-red-400'
                                        }`}>
                                          {DIM_LABELS[k] || k}: {v}/{max}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                {c.justificativa_check && (
                                  <p className="text-[10px] text-gray-400 mb-1"><span className="font-semibold text-gray-500">{tr('details.justification')}:</span> {c.justificativa_check}</p>
                                )}
                                {c.sugestao_check && (
                                  <p className="text-[10px] text-gray-400"><span className="font-semibold text-amber-400/80">{tr('details.suggestion')}:</span> {c.sugestao_check}</p>
                                )}
                                {/* Campos enriquecidos do check */}
                                {(() => {
                                  const al = typeof c.alertas_check === 'object' && !Array.isArray(c.alertas_check) ? c.alertas_check : {};
                                  return (
                                    <>
                                      {al.ponto_mais_forte && (
                                        <p className="text-[10px] text-green-300/80 mt-1">✦ {tr('details.strongPoint')}: {al.ponto_mais_forte}</p>
                                      )}
                                      {al.ponto_mais_fraco && (
                                        <p className="text-[10px] text-amber-300/80 mt-1">⚠ {tr('details.weakPoint')}: {al.ponto_mais_fraco}</p>
                                      )}
                                      {Array.isArray(al.descritores_sem_cobertura) && al.descritores_sem_cobertura.length > 0 && (
                                        <p className="text-[10px] text-red-300/80 mt-1">✗ {tr('details.descriptorsNoCoverage')}: {al.descritores_sem_cobertura.join(', ')}</p>
                                      )}
                                      {Array.isArray(al.perguntas_com_risco) && al.perguntas_com_risco.length > 0 && (
                                        <div className="mt-2 space-y-1">
                                          {al.perguntas_com_risco.map((p: any, j: number) => (
                                            <div key={j} className="text-[10px] text-amber-300/70 pl-2 border-l border-amber-400/20">
                                              P{p.numero}: {p.problema}{p.correcao_recomendada ? ` → ${p.correcao_recomendada}` : ''}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Ações */}
                            <div className="flex items-center gap-2">
                              {(c.status_check === 'revisar' || c.status_check === 'aprovado_com_ressalvas') && (
                                <button disabled={isActing} onClick={async () => {
                                  setCenAction({ id: c.id, type: 'regen' });
                                  // 1. Regenerar
                                  const r = await regenerarCenario(c.id);
                                  if (!r.success) { setCenAction(null); flash(tr('messages.error', { error: r.error })); return; }
                                  flash(r.message);
                                  // 2. Re-checar automaticamente
                                  const r2 = await checkCenarioUm(c.id);
                                  setCenAction(null);
                                  if (r2.success) flash(tr('messages.recheckResult', { score: r2.nota, status: r2.nota >= 90 ? tr('status.approvedLower') : tr('status.reviewLower') }));
                                  refresh();
                                }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-amber-400 border border-amber-400/30 hover:bg-amber-400/10 transition-all disabled:opacity-50">
                                  {isActing && cenAction.type === 'regen' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                  {tr('actions.regenerateWithFeedback')}
                                </button>
                              )}
                              {!c.nota_check && (
                                <button disabled={isActing} onClick={async () => {
                                  setCenAction({ id: c.id, type: 'check' });
                                  const r = await checkCenarioUm(c.id);
                                  setCenAction(null);
                                  if (r.success) { flash(`${c.titulo}: ${r.nota}pts`); refresh(); }
                                  else flash(tr('messages.error', { error: r.error }));
                                }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
                                  {isActing && cenAction.type === 'check' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                                  {tr('actions.validate')}
                                </button>
                              )}
                              <button disabled={isActing} onClick={async () => {
                                if (!confirm(`Excluir o cenário "${c.titulo || 'sem título'}"? Esta ação não pode ser desfeita.`)) return;
                                setCenAction({ id: c.id, type: 'delete' });
                                const r = await excluirCenario(c.id);
                                setCenAction(null);
                                if (r.success) { flash('Cenário excluído'); refresh(); }
                                else flash(tr('messages.error', { error: r.error }));
                              }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-all disabled:opacity-50 ml-auto">
                                {isActing && cenAction.type === 'delete' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                Excluir
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </>)}
        </div>
      )}

    </div>
  );
}

// ── Componentes auxiliares ──

function Empty({ icon: Icon, text }) {
  return (
    <div className="text-center py-12">
      <Icon size={32} className="text-gray-600 mx-auto mb-3" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function Badge({ count, max }) {
  const color = count >= max ? 'bg-green-400/15 text-green-400' : count >= max * 0.7 ? 'bg-amber-400/15 text-amber-400' : 'bg-red-400/15 text-red-400';
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${color}`}>{count}/{max}</span>;
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-10 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-[550px] rounded-xl border border-white/[0.08] p-4" style={{ background: '#0A1D35' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-white">{title}</p>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ color, children }) {
  const colors = { cyan: 'text-cyan-400', amber: 'text-amber-400', green: 'text-green-400', red: 'text-red-400', purple: 'text-purple-400', gray: 'text-gray-500' };
  return <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${colors[color] || 'text-gray-500'}`}>{children}</p>;
}

function discColor(dim) {
  return dim === 'D' ? 'text-red-400' : dim === 'I' ? 'text-yellow-400' : dim === 'S' ? 'text-green-400' : 'text-blue-400';
}

