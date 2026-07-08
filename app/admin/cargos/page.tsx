'use client';

import { useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Briefcase, Check, Save, ChevronDown, AlertTriangle, Link2, X, Target, BarChart3 } from 'lucide-react';
import { loadEmpresas, loadCargos, salvarTop5, salvarEhLideranca, renomearTop10Cargo } from './actions';
import BackButton from '@/components/back-button';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';
import VotacaoTab from './_components/votacao-tab';

// Wrapper com Suspense: CargosPageInner usa useSearchParams. Sem o boundary,
// chegar via redirect() (ex.: /empresas/[id]/votacao → /cargos?tab=votacao)
// causava hydration mismatch de hooks (React #310). (Reorganização, Fase 3.)
export default function CargosPage() {
  return <Suspense fallback={<div className="min-h-dvh" />}><CargosPageInner /></Suspense>;
}

function CargosPageInner() {
  const router = useRouter();
  const t = useTranslations('AdminRoles');
  // Contexto de empresa (path → ?empresa= → filtro do header); a tela tem seletor
  // próprio, então o contexto entra só como valor inicial/fallback do estado local.
  const { empresaId: empresaParam } = useEmpresaContexto();
  // Tabs do workspace (reorganização do admin, Fase 3): top5 (curadoria) + votacao (movida de empresas/[id]/votacao)
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(
    ['top5', 'votacao'].includes(initialTab || '') ? (initialTab as string) : 'top5'
  );
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [empresaId, setEmpresaId] = useState(empresaParam || '');
  const [empresaNome, setEmpresaNome] = useState('');
  const [cargos, setCargos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCargos, setLoadingCargos] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [top5Edits, setTop5Edits] = useState<Record<string, string[]>>({});

  useEffect(() => {
    (async () => {
      const r = await loadEmpresas();
      if (r.success) {
        setEmpresas(r.data || []);
        if (empresaParam) {
          const emp = (r.data || []).find((e: any) => e.id === empresaParam);
          if (emp) setEmpresaNome(emp.nome);
          handleSelectEmpresa(empresaParam);
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading || !empresaParam || empresaParam === empresaId) return;
    const emp = empresas.find((e: any) => e.id === empresaParam);
    setEmpresaNome(emp?.nome || '');
    handleSelectEmpresa(empresaParam);
  }, [empresaParam, empresas, loading, empresaId]);

  async function handleSelectEmpresa(id: string) {
    setEmpresaId(id);
    if (!id) { setCargos([]); return; }
    setLoadingCargos(true);
    const r = await loadCargos(id);
    if (r.success) {
      setCargos(r.data || []);
      const edits: Record<string, string[]> = {};
      (r.data || []).forEach((c: any) => { edits[c.id] = c.top5_workshop || []; });
      setTop5Edits(edits);
    }
    setLoadingCargos(false);
  }

  function toggleCompetencia(cargoId: string, comp: string) {
    setTop5Edits(prev => {
      const current = prev[cargoId] || [];
      const exists = current.includes(comp);
      const next = exists ? current.filter(c => c !== comp) : [...current, comp];
      return { ...prev, [cargoId]: next };
    });
  }

  // ── Modal de vínculo de cargo órfão ──
  const [vinculandoCargo, setVinculandoCargo] = useState<{ deNome: string } | null>(null);
  const [vinculoTarget, setVinculoTarget] = useState<string>('');
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  async function handleVincular() {
    if (!vinculandoCargo || !vinculoTarget) return;
    setSalvandoVinculo(true);
    const r = await renomearTop10Cargo(empresaId, vinculandoCargo.deNome, vinculoTarget);
    setSalvandoVinculo(false);
    if (r.success) {
      toast(r.message);
      setVinculandoCargo(null);
      setVinculoTarget('');
      // Recarrega lista
      handleSelectEmpresa(empresaId);
    } else {
      toast.error(t('messages.error', { error: r.error }));
    }
  }

  async function handleSave(cargoId: string) {
    setSaving(prev => ({ ...prev, [cargoId]: true }));
    const r = await salvarTop5(cargoId, top5Edits[cargoId] || []);
    setSaving(prev => ({ ...prev, [cargoId]: false }));
    if (r.success) {
      toast.success(t('messages.top5Saved'));
    } else {
      toast.error(t('messages.error', { error: r.error }));
    }
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <BackButton onClick={() => router.push(empresaParam ? `/admin/empresas/${empresaParam}` : '/admin/dashboard')} />
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><Briefcase size={20} className="text-cyan-400" /> {t('title')}</h1>
          {empresaParam && empresaNome ? (
            <p className="text-xs text-gray-500">{empresaNome}</p>
          ) : (
            <p className="text-xs text-gray-500">{t('subtitle')}</p>
          )}
        </div>
      </div>

      {/* Empresa selector */}
      {!empresaParam && (
        <div className="mb-6">
          <div className="relative w-full max-w-sm">
            <select value={empresaId} onChange={e => handleSelectEmpresa(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-[#0F2A4A] text-white text-sm px-4 py-2.5 pr-10 focus:outline-none focus:border-cyan-400/50">
              <option value="">{t('selectCompany')}</option>
              {empresas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Tabs do workspace (padrão de fase1/page.tsx) */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
        {[
          { key: 'top5', label: t('tabs.top5'), icon: Target, color: 'text-orange-400' },
          { key: 'votacao', label: t('tabs.votacao'), icon: BarChart3, color: 'text-cyan-400' },
        ].map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === tb.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <tb.icon size={14} className={tab === tb.key ? tb.color : ''} />
            {tb.label}
          </button>
        ))}
      </div>

      {/* ══════════════ TAB: VOTAÇÃO (movida de empresas/[id]/votacao) ══════════════ */}
      {tab === 'votacao' && (
        empresaId ? (
          <VotacaoTab empresaId={empresaId} />
        ) : (
          <div className="text-center py-12">
            <BarChart3 size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{t('selectCompany')}</p>
          </div>
        )
      )}

      {/* ══════════════ TAB: TOP 5 (curadoria por cargo) ══════════════ */}
      {tab === 'top5' && (<>
      {/* Toast */}
      {/* Loading */}
      {loadingCargos && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      )}

      {/* Empty state */}
      {!loadingCargos && empresaId && cargos.length === 0 && (
        <div className="text-center py-12">
          <Briefcase size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('empty')}</p>
        </div>
      )}

      {/* Banner de orientação */}
      {!loadingCargos && cargos.length > 0 && (
        <div className="rounded-xl p-3 mb-4 border border-cyan-400/15 bg-cyan-400/[0.04] text-[11px] text-cyan-100/85 leading-relaxed">
          <strong className="text-cyan-300">{t('workshop.title')}:</strong>{' '}
          <span className="text-cyan-100/70">
            {t('workshop.beforeQuantity')}{' '}
            <strong className="text-cyan-100/90">{t('workshop.anyQuantity')}</strong>
            {t('workshop.afterQuantity')}{' '}
          </span>
          {/* A votação agora é tab deste workspace — troca de tab em vez de navegar */}
          <button onClick={() => setTab('votacao')}
            className="underline text-cyan-300 hover:text-cyan-200">
            {t('workshop.voting')}
          </button>
          <span className="text-cyan-100/70">.</span>
        </div>
      )}

      {/* Cargos list */}
      {!loadingCargos && cargos.length > 0 && (
        <div className="space-y-4">
          {cargos.map((cargo: any) => {
            const top10 = cargo.competencias_top10 || [];
            const votadasExtra = cargo.competencias_votadas_extra || [];
            const selected = top5Edits[cargo.id] || [];
            // Lista do workshop = Top 10 da IA ∪ votadas fora da Top 10 ∪ já selecionadas.
            const lista: string[] = [...top10, ...votadasExtra];
            for (const s of selected) if (!lista.includes(s)) lista.push(s);
            const votadaSet = new Set(votadasExtra);
            const isOrfao = !!cargo.is_orfao;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cargo.id);
            const cargosValidos = cargos.filter((c: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(c.id));

            return (
              <div key={cargo.id} className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white truncate">{cargo.nome}</h3>
                      {isOrfao && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-400/15 text-amber-300 border border-amber-400/25">
                          <AlertTriangle size={9} /> {t('badges.notLinked')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {t('summary', { total: lista.length, selected: selected.length })}
                      {cargo.eh_lideranca === false ? ` · ${t('badges.nonLeader')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isOrfao && cargosValidos.length > 0 && (
                      <button onClick={() => { setVinculandoCargo({ deNome: cargo.nome }); setVinculoTarget(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-amber-300 border border-amber-400/30 hover:bg-amber-400/10 transition-colors">
                        <Link2 size={11} /> {t('actions.linkCorrectRole')}
                      </button>
                    )}
                    {isUuid && (
                      <button onClick={() => handleSave(cargo.id)} disabled={saving[cargo.id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white transition-colors disabled:opacity-50">
                        {saving[cargo.id] ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        {t('actions.save')}
                      </button>
                    )}
                  </div>
                </div>

                {isOrfao && (
                  <div className="px-5 py-2 border-b border-white/[0.04] bg-amber-400/[0.04] text-[11px] text-amber-200/85">
                    {t.rich('orphanHint', {
                      strong: chunks => <strong>{chunks}</strong>,
                      code: chunks => <code>{chunks}</code>,
                    })}
                  </div>
                )}

                <div className="p-5">
                  {lista.length === 0 ? (
                    <p className="text-xs text-gray-500">{t('emptyTop10')}</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {lista.map((comp: string, i: number) => {
                        const isSelected = selected.includes(comp);
                        return (
                          <button key={i} onClick={() => toggleCompetencia(cargo.id, comp)}
                            disabled={!isUuid}
                            title={!isUuid ? t('linkFirst') : undefined}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-all ${
                              isSelected
                                ? 'border-cyan-400/50 bg-cyan-400/10 text-white'
                                : !isUuid
                                  ? 'border-white/[0.04] text-gray-600 cursor-not-allowed'
                                  : 'border-white/[0.06] text-gray-300 hover:border-white/20'
                            }`}>
                            <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                              isSelected ? 'bg-cyan-400 text-[#091D35]' : 'border border-white/20'
                            }`}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                            <span className="truncate">{comp}</span>
                            {votadaSet.has(comp) && (
                              <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-400/15 text-cyan-300 border border-cyan-400/25">votação</span>
                            )}
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

      {/* Modal de vincular cargo órfão */}
      {vinculandoCargo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setVinculandoCargo(null)}>
          <div className="w-full max-w-[480px] rounded-xl border border-white/[0.08] p-5" style={{ background: '#0A1D35' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Link2 size={14} className="text-amber-300" />
                {t('modal.title')}
              </h3>
              <button onClick={() => setVinculandoCargo(null)} className="text-gray-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-3 leading-relaxed">
              {t.rich('modal.description', {
                role: vinculandoCargo.deNome,
                strong: chunks => <strong className="text-white">{chunks}</strong>,
              })}
            </p>

            <div className="relative mb-3">
              <select value={vinculoTarget} onChange={(e) => setVinculoTarget(e.target.value)}
                className="w-full appearance-none rounded-lg border border-white/10 text-white text-sm px-4 py-2.5 pr-10 focus:outline-none focus:border-cyan-400/50"
                style={{ background: '#091D35' }}>
                <option value="">{t('modal.chooseRole')}</option>
                {cargos.filter((c: any) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(c.id) && c.nome !== vinculandoCargo.deNome)
                  .map((c: any) => (
                    <option key={c.id} value={c.nome}>{c.nome}</option>
                  ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setVinculandoCargo(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white">
                {t('actions.cancel')}
              </button>
              <button onClick={handleVincular} disabled={!vinculoTarget || salvandoVinculo}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-400/15 text-amber-300 border border-amber-400/30 hover:bg-amber-400/25 disabled:opacity-50">
                {salvandoVinculo ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                {t('actions.link')}
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
