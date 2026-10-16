'use client';

import { useState, useEffect, useTransition, useMemo, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Loader2, RefreshCw, Filter, Building2, Users, School,
  TrendingUp, MapPin, AlertTriangle, ChevronDown, ChevronUp, X, Layers, Download, Contact,
} from 'lucide-react';
import BackButton from '@/components/back-button';
import {
  loadMercadoMunicipios, loadMercadoRedes, loadMercadoEscolas,
  refreshMercadoPotencial, exportarMercadoXLSX, type MercadoFilters,
} from './actions';
import UnificadoTab from './_components/unificado-tab';
import EnriquecerPainel from './_components/enriquecer-painel';
import { useAdminShell } from '@/app/admin/_shell/AdminShellContext';
import { secoesDoMercado, secaoInicialDoMercado, type SecaoMercado } from '@/lib/mercado-potencial/secoes';
import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';

type Tab = 'municipio' | 'rede' | 'escola';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const REDES = ['MUNICIPAL','ESTADUAL','FEDERAL','PRIVADA'];

const fmt = {
  int: (n: number | null, locale: string) => n == null ? '—' : Math.round(n).toLocaleString(locale),
  brl: (n: number | null, locale: string) => n == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n)),
  pct: (n: number | null) => n == null ? '—' : `${Math.round(n * 100)}%`,
  inse: (n: number | null) => n == null ? '—' : n.toFixed(1),
  score: (n: number | null, locale: string) => n == null ? '—' : Math.round(n).toLocaleString(locale),
};

const REDE_COR: Record<string, string> = {
  MUNICIPAL: '#1C8A90',
  ESTADUAL: '#7C3AED',
  FEDERAL: '#059669',
  PRIVADA: '#D97706',
};

/**
 * Workspace único "Mercado Potencial" (Fase 3 da reorganização do admin):
 *  - tab `mercado`   → conteúdo original (municípios/redes/escolas)
 *  - tab `unificado` → "Potencial por Cidade" (empresas+escolas), movido de
 *                      /admin/vertho/potencial-cidades (rota antiga = redirect)
 * Tab inicial via `?tab=`, mesmo padrão de empresas/[empresaId]/fase1.
 *
 * ⛔ A tab `unificado` só existe com o Radar Empresas ligado: a metade de
 * empresas dela é acervo desse bloco, off-line desde 31/08/2026. Quem decide
 * é `lib/mercado-potencial/secoes.ts` (R-108, 03/10/2026).
 */
type SecaoWorkspace = SecaoMercado;

// Wrapper com Suspense: MercadoPotencialPageInner usa useSearchParams. Sem o
// boundary, chegar via redirect() (ex.: /vertho/potencial-cidades → ?tab=unificado)
// causava hydration mismatch de hooks (React #310). (Reorganização, Fase 3.)
export default function MercadoPotencialPage() {
  return <Suspense fallback={<div className="min-h-dvh" />}><MercadoPotencialPageInner /></Suspense>;
}

function MercadoPotencialPageInner() {
  const searchParams = useSearchParams();
  const tNav = useTranslations('AdminDashboard.nav.labels');
  const [secao, setSecao] = useState<SecaoWorkspace>(secaoInicialDoMercado(searchParams.get('tab')));
  const secoes = secoesDoMercado();

  return (
    <div className="min-h-full"
      style={{ background: 'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)' }}>
      <div className="max-w-[1400px] mx-auto px-5 py-6">

        <BackButton href="/admin/dashboard" />

        {/* Tabs do workspace: com uma seção só, a barra não tem o que escolher. */}
        {secoes.length > 1 && (
        <div className="flex gap-1 mb-5 p-1 rounded-xl border border-white/[0.06]" style={{ background: '#091D35' }}>
          {([
            { key: 'mercado', label: tNav('potentialMarket'), icon: TrendingUp, color: 'text-cyan-400' },
            { key: 'unificado', label: tNav('cityPotential'), icon: Layers, color: 'text-violet-400' },
          ] as { key: SecaoWorkspace; label: string; icon: any; color: string }[]).filter(tb => secoes.includes(tb.key)).map(tb => (
            <button key={tb.key} onClick={() => setSecao(tb.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                secao === tb.key ? 'bg-white/[0.06] text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              <tb.icon size={14} className={secao === tb.key ? tb.color : ''} />
              {tb.label}
            </button>
          ))}
        </div>
        )}

        {secao === 'unificado' && secoes.includes('unificado')
          ? <UnificadoTab onOpenMercado={() => setSecao('mercado')} />
          : <MercadoTab />}
      </div>
    </div>
  );
}

// ── Tab "mercado": conteúdo original da tela (municípios/redes/escolas) ─────
function MercadoTab() {
  const locale = useLocale();
  const t = useTranslations('AdminMarketPotential');
  // Só o master enriquece (`mercado.contatos.enrich`). `podeVer` devolve true ENQUANTO as permissões carregam (a UI
  // "se comporta como antes"), e um botão que gasta não pode piscar para o Sócio: espera o papel chegar. O servidor
  // decide de novo em cada action; a tela só não oferece o que ele recusaria.
  const { podeVer, adminRole } = useAdminShell();
  const podeEnriquecer = adminRole !== null && podeVer('mercado.contatos.enrich');
  const [tab, setTab] = useState<Tab>('municipio');
  const [rows, setRows] = useState<any[]>([]);
  // O que o servidor leu: total no banco para estes filtros e se o limite CORTOU linhas.
  const [leitura, setLeitura] = useState<{ totalNoBanco: number | null; truncado: boolean }>({ totalNoBanco: null, truncado: false });
  const pedido = useRef(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [painelEnriquecer, setPainelEnriquecer] = useState(false);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Filtros
  const [precoProf, setPrecoProf] = useState(100);
  const [precoGestor, setPrecoGestor] = useState(100);
  const [idadeOnboarding, setIdadeOnboarding] = useState(29);
  const [ufs, setUfs] = useState<string[]>([]);
  const [regioes, setRegioes] = useState<string[]>([]);
  const [redes, setRedes] = useState<string[]>([]);
  const [municipioBusca, setMunicipioBusca] = useState('');
  const [municipioDebounced, setMunicipioDebounced] = useState('');
  const [inseMin, setInseMin] = useState<number | null>(null);
  const [inseMax, setInseMax] = useState<number | null>(null);
  const [profsMin, setProfsMin] = useState<number | null>(null);
  const [gestMin, setGestMin] = useState<number | null>(null);
  const [orderBy, setOrderBy] = useState('score_completo');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');
  const [showFiltros, setShowFiltros] = useState(true);
  const [limite, setLimite] = useState<number | null>(null); // null = usa default da tab

  // Debounce do filtro de cidade — evita query a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setMunicipioDebounced(municipioBusca), 400);
    return () => clearTimeout(t);
  }, [municipioBusca]);

  // Mesmo debounce para os mínimos: "100" são três teclas e, sem isso, três
  // consultas em corrida (a resposta de "1" pode chegar por último).
  const profsMinDebounced = useDebounced(profsMin);
  const gestMinDebounced = useDebounced(gestMin);

  // Defaults por tab (alinhados com o cap na action).
  const DEFAULT_LIMITE: Record<Tab, number> = { municipio: 6000, rede: 8000, escola: 1000 };
  const limiteEfetivo = limite ?? DEFAULT_LIMITE[tab];

  const filtros: MercadoFilters = useMemo(() => ({
    uf: ufs.length ? ufs : undefined,
    regioesMetropolitanas: regioes.length ? regioes : undefined,
    redes: redes.length ? redes : undefined,
    municipioBusca: municipioDebounced.trim() || undefined,
    inseMin: inseMin ?? undefined,
    inseMax: inseMax ?? undefined,
    professoresMin: profsMinDebounced && profsMinDebounced > 0 ? profsMinDebounced : undefined,
    gestoresMin: gestMinDebounced && gestMinDebounced > 0 ? gestMinDebounced : undefined,
    precoProf, precoGestor, idadeOnboarding,
    orderBy, orderDir, limit: limiteEfetivo,
  }), [ufs, regioes, redes, municipioDebounced, inseMin, inseMax, profsMinDebounced, gestMinDebounced, precoProf, precoGestor, idadeOnboarding, orderBy, orderDir, limiteEfetivo]);

  async function carregar() {
    // A leitura é em páginas e leva segundos: uma resposta ANTIGA pode chegar depois
    // de uma mais nova (mudou o filtro no meio) e sobrescrever a tela. Só o último pedido vale.
    const meu = ++pedido.current;
    setLoading(true);
    setError('');
    try {
      const fn = tab === 'municipio' ? loadMercadoMunicipios
        : tab === 'rede' ? loadMercadoRedes
        : loadMercadoEscolas;
      const r: any = await fn(filtros);
      if (meu !== pedido.current) return;
      if (r.error) setError(r.error);
      else {
        setRows(r.rows || []);
        setLeitura({ totalNoBanco: r.totalNoBanco ?? null, truncado: !!r.truncado });
      }
    } catch (e: any) {
      if (meu === pedido.current) setError(e.message);
    }
    if (meu === pedido.current) setLoading(false);
  }

  useEffect(() => { carregar(); }, [tab, filtros]);

  async function refreshMVs() {
    setRefreshing(true);
    const r = await refreshMercadoPotencial();
    setRefreshing(false);
    if ((r as any).error) toast.error(t('alerts.error', { message: (r as any).error }));
    else { toast.success(t('alerts.updated')); carregar(); }
  }

  function toggleSort(coluna: string) {
    if (orderBy === coluna) setOrderDir(orderDir === 'desc' ? 'asc' : 'desc');
    else { setOrderBy(coluna); setOrderDir('desc'); }
  }

  // Exporta o que os filtros devolvem na visão aberta, SEM o "Limite" da tela (a action lê até o teto
  // do arquivo). O servidor confere a permissão e a conta da equipe vertho.ai e registra na auditoria.
  async function exportarXlsx() {
    setExportando(true);
    try {
      const r = await exportarMercadoXLSX(tab, filtros);
      if (r.ok === false) { toast.error(t('alerts.exportError', { message: r.error })); return; }
      const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = r.nomeArquivo;
      a.click();
      URL.revokeObjectURL(a.href);
      if (r.truncado) toast.warning(t('alerts.exportedTruncated', { count: fmt.int(r.n, locale), total: fmt.int(r.totalNoBanco ?? r.n, locale), max: fmt.int(r.limite, locale) }));
      else toast.success(t('alerts.exported', { count: fmt.int(r.n, locale) }));
    } catch (e: any) {
      toast.error(t('alerts.exportError', { message: e?.message || '' }));
    } finally {
      setExportando(false);
    }
  }

  function toggleUf(uf: string) {
    setUfs(prev => prev.includes(uf) ? prev.filter(u => u !== uf) : [...prev, uf]);
  }
  function toggleRede(rede: string) {
    setRedes(prev => prev.includes(rede) ? prev.filter(r => r !== rede) : [...prev, rede]);
  }

  // Totais agregados das rows visíveis.
  // `qt_jovens_efetivo` é setado pelo backend conforme idade-corte selecionada
  // (24 ou 29). Fallback pra qt_docs_jovens caso o backend antigo não envie.
  const totais = useMemo(() => {
    if (!rows.length) return null;
    return {
      qt_escolas: rows.reduce((a, r) => a + (r.qt_escolas || 0), 0),
      qt_professores_total: rows.reduce((a, r) => a + (r.qt_professores_total ?? r.qt_professores ?? 0), 0),
      qt_professores_onboarding: rows.reduce((a, r) => a + (r.qt_professores_onboarding ?? r.qt_jovens_efetivo ?? r.qt_docs_jovens ?? 0), 0),
      qt_gestores: rows.reduce((a, r) => a + (r.qt_gestores || 0), 0),
      qt_docs_jovens: rows.reduce((a, r) => a + (r.qt_jovens_efetivo ?? r.qt_docs_jovens ?? 0), 0),
      tam_mensal_mentor_ia: rows.reduce((a, r) => a + (r.tam_mensal_mentor_ia || 0), 0),
      tam_mensal_onboarding: rows.reduce((a, r) => a + (r.tam_mensal_onboarding || 0), 0),
    };
  }, [rows]);
  const idadeLabel = idadeOnboarding <= 24 ? t('age.until24') : t('age.until29');

  return (
    <div>
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.3)' }}>
              {t('eyebrow')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Só na visão Escola (o contato é por escola) e só para o master. O servidor confere de novo. */}
            {tab === 'escola' && podeEnriquecer && (
              <button onClick={() => setPainelEnriquecer(v => !v)} aria-expanded={painelEnriquecer}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-400/30 text-violet-300 hover:bg-violet-400/10">
                <Contact size={12} />
                {t('enrich.button')}
              </button>
            )}
            <button onClick={exportarXlsx} disabled={exportando || loading || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-cyan-400/30 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40">
              {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {t('actions.exportXlsx')}
            </button>
            <button onClick={refreshMVs} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/30 disabled:opacity-40">
              {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {t('refresh')}
            </button>
          </div>
        </div>

        {tab === 'escola' && podeEnriquecer && painelEnriquecer && <EnriquecerPainel filtros={filtros} onFechar={() => setPainelEnriquecer(false)} />}

        {/* Filtros sticky */}
        <div className="rounded-2xl mb-5 overflow-hidden"
          style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)' }}>
          <button onClick={() => setShowFiltros(!showFiltros)}
            className="w-full flex items-center gap-2 px-4 py-3 text-xs font-semibold text-white/70 hover:text-white">
            <Filter size={13} /> {t('filters.title')}
            <span className="text-[10px] text-white/40 ml-2">
              {[ufs.length && t('filters.ufCount', { count: ufs.length }), regioes.length && t('filters.metroCount', { count: regioes.length }), redes.length && t('filters.networkCount', { count: redes.length }), (inseMin != null || inseMax != null) && 'INSE', profsMin != null && profsMin > 0 && t('filters.teachersMinCount', { min: profsMin.toLocaleString(locale) }), gestMin != null && gestMin > 0 && t('filters.managersMinCount', { min: gestMin.toLocaleString(locale) })].filter(Boolean).join(' · ') || t('filters.none')}
            </span>
            {showFiltros ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
          </button>
          {showFiltros && (
            <div className="px-4 pb-4 border-t border-white/[0.06] space-y-4">
              {/* Preços + idade-corte + limite */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                <NumInput label={t('inputs.teacherPrice')} value={precoProf} onChange={setPrecoProf} />
                <NumInput label={t('inputs.managerPrice')} value={precoGestor} onChange={setPrecoGestor} />
                <div>
                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('inputs.onboardingAge')}</label>
                  <select value={idadeOnboarding}
                    onChange={e => setIdadeOnboarding(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
                    style={{ background: '#091D35' }}>
                    <option value={24}>{t('age.until24Years')}</option>
                    <option value={29}>{t('age.until29YearsDefault')}</option>
                  </select>
                  <p className="text-[9px] text-gray-600 mt-1">{t('inputs.ageHint')}</p>
                </div>
                <NumInput
                  label={t('inputs.limit', { default: DEFAULT_LIMITE[tab].toLocaleString(locale) })}
                  value={limite}
                  onChange={setLimite}
                  allowNull
                />
              </div>

              {/* UF (dropdown multi-select) + filtro por cidade */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <UfDropdown selected={ufs} onChange={setUfs} labels={{ title: t('inputs.uf'), all: t('inputs.allUfs'), selected: (count) => t('inputs.ufSelected', { count }), clear: t('actions.clear') }} />
                <RegiaoDropdown selected={regioes} onChange={setRegioes} labels={{ title: t('inputs.metro'), all: t('inputs.allMetros'), selected: (count) => t('inputs.metroSelected', { count }), clear: t('actions.clear'), search: t('inputs.metroSearch'), cities: (count) => t('inputs.metroCities', { count }), hint: t('inputs.metroHint') }} />
                <div>
                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('inputs.city')}</label>
                  <div className="relative">
                    <input value={municipioBusca} onChange={e => setMunicipioBusca(e.target.value)}
                      placeholder={t('inputs.cityPlaceholder')}
                      className="w-full px-3 py-2 pr-8 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
                      style={{ background: '#091D35' }} />
                    {municipioBusca && (
                      <button onClick={() => setMunicipioBusca('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-gray-600 mt-1">{t('inputs.cityHint')}</p>
                </div>
              </div>

              {/* Redes (multi) — só faz sentido nas tabs rede/escola */}
              {tab !== 'municipio' && (
                <div>
                  <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2">{t('inputs.network')}</p>
                  <div className="flex flex-wrap gap-1">
                    {REDES.map(r => (
                      <button key={r} onClick={() => toggleRede(r)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                          redes.includes(r)
                            ? `border-current bg-current/15`
                            : 'border-white/10 text-white/50 hover:border-white/30'
                        }`}
                        style={{ color: redes.includes(r) ? REDE_COR[r] : undefined }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* INSE range + mínimos de professores (total) e de gestores */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <NumInput label={t('inputs.inseMin')} value={inseMin} onChange={setInseMin} allowNull />
                <NumInput label={t('inputs.inseMax')} value={inseMax} onChange={setInseMax} allowNull />
                <NumInput label={t('inputs.teachersMin')} value={profsMin} onChange={setProfsMin} allowNull />
                <NumInput label={t('inputs.managersMin')} value={gestMin} onChange={setGestMin} allowNull />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: '#091D35', border: '1px solid rgba(255,255,255,.06)' }}>
          {([
            { id: 'municipio', label: t('tabs.city'), icon: MapPin },
            { id: 'rede', label: t('tabs.network'), icon: Building2 },
            { id: 'escola', label: t('tabs.school'), icon: School },
          ] as { id: Tab; label: string; icon: any }[]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-cyan-400/15 text-cyan-400' : 'text-white/50 hover:text-white/80'
              }`}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>

        {/* Corte do limite: avisa AQUI, ao lado dos totais que ele deixa parciais */}
        {leitura.truncado && rows.length > 0 && !loading && (
          <div className="flex items-start gap-2 mb-3 p-3 rounded-lg border border-amber-400/20"
            style={{ background: 'rgba(244,183,64,0.06)' }}>
            <AlertTriangle size={14} className="text-amber-300 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200/90">
              {t('limitReached', { shown: fmt.int(rows.length, locale), total: fmt.int(leitura.totalNoBanco ?? rows.length, locale) })}
            </p>
          </div>
        )}

        {/* Totais */}
        {totais && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <KPI label={t('kpis.rows')} value={fmt.int(rows.length, locale)} cor="#34c5cc" />
            <KPI label={t('kpis.schools')} value={fmt.int(totais.qt_escolas, locale)} cor="#A78BFA" />
            <KPI label={t('kpis.teachers', { age: idadeLabel })} value={fmt.int(totais.qt_professores_onboarding, locale)} cor="#F4B740" />
            <KPI label={t('kpis.share')} value={t('kpis.shareValue', { total: fmt.int(totais.qt_professores_total, locale), pct: fmt.pct(totais.qt_professores_onboarding / Math.max(1, totais.qt_professores_total)) })} cor="#2ECC71" />
            <KPI label={t('kpis.managers')} value={fmt.int(totais.qt_gestores, locale)} cor="#34C5CC" />
            <KPI label={t('kpis.mentorTam')} value={fmt.brl(totais.tam_mensal_mentor_ia, locale)} cor="#34c5cc" big />
            <KPI label={t('kpis.onboardingTam')} value={fmt.brl(totais.tam_mensal_onboarding, locale)} cor="#F97354" big />
          </div>
        )}

        {/* Error/Loading */}
        {error && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg border border-red-400/20"
            style={{ background: 'rgba(239,68,68,0.06)' }}>
            <AlertTriangle size={14} className="text-red-400" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            <button onClick={() => setError('')}><X size={12} /></button>
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.07)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Filter size={32} className="text-white/20 mb-3" />
              <p className="text-sm text-white/60">{t('empty.title')}</p>
              <p className="text-[11px] text-white/40 mt-1">{t('empty.hint')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                    <Th label={t('table.identification')} coluna="nome" sticky orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    {tab !== 'municipio' && (
                      <Th label={t('table.network')} coluna="rede" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    )}
                    <Th label="UF" coluna="uf" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.schools')} coluna="qt_escolas" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.teachersTotal')} coluna="qt_professores" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.teachers', { age: idadeLabel })} coluna="qt_professores_onboarding" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.managersShort')} coluna="qt_gestores" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.youngPct')} coluna="pct_jovens" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label={t('table.noPostgradPct')} coluna="pct_sem_pos" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label="INSE" coluna="inse_medio" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label="TAM Mentor IA" coluna="tam_mensal_mentor_ia" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label="TAM Onboarding" coluna="tam_mensal_onboarding" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label="Fit Ped." coluna="fit_pedagogico" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <Th label="Score" coluna="score_completo" right orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                      <td className="px-3 py-2.5">
                        <p className="text-white font-semibold truncate max-w-[280px]">{r.nome}</p>
                        {r.municipio && tab === 'escola' && (
                          <p className="text-[10px] text-white/40 truncate">{r.municipio}</p>
                        )}
                      </td>
                      {tab !== 'municipio' && (
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ color: REDE_COR[r.rede] || '#fff', background: `${REDE_COR[r.rede] || '#fff'}1A` }}>
                            {r.rede}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-white/70">{r.uf}</td>
                      <td className="px-3 py-2.5 text-right text-white/85">{fmt.int(r.qt_escolas, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-white/85">{fmt.int(r.qt_professores, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-white">{fmt.int(r.qt_professores_onboarding ?? r.qt_jovens_efetivo, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-white/85">{fmt.int(r.qt_gestores, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-300/80">{fmt.pct(r.pct_jovens)}</td>
                      <td className="px-3 py-2.5 text-right text-amber-300/80">{fmt.pct(r.pct_sem_pos)}</td>
                      <td className="px-3 py-2.5 text-right text-white/70">
                        {r.inse_fonte === 'inferido' ? (
                          <span title={t('table.inferredInseTitle')}>
                            <span className="text-amber-400/80 mr-0.5">~</span>{fmt.inse(r.inse_medio)}
                          </span>
                        ) : (
                          fmt.inse(r.inse_medio)
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right text-cyan-300 font-mono">{fmt.brl(r.tam_mensal_mentor_ia, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-orange-300/85 font-mono">{fmt.brl(r.tam_mensal_onboarding, locale)}</td>
                      <td className="px-3 py-2.5 text-right text-white/60">{fmt.pct(r.fit_pedagogico)}</td>
                      <td className="px-3 py-2.5 text-right text-white font-bold font-mono">{fmt.score(r.score_completo, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rodapé com nota */}
        <p className="text-[10px] text-white/30 text-center mt-4">
          {t.rich('footerNote', {
            tilde: (chunks) => <span className="text-amber-400/80">{chunks}</span>,
            strong: (chunks) => <b>{chunks}</b>,
          })}
        </p>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function useDebounced<T>(valor: T, ms = 400): T {
  const [atual, setAtual] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtual(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atual;
}

function NumInput({ label, value, onChange, allowNull = false }: { label: string; value: number | null; onChange: (v: any) => void; allowNull?: boolean }) {
  return (
    <div>
      <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{label}</label>
      <input type="number"
        value={value ?? ''}
        onChange={e => {
          const v = e.target.value.trim();
          if (v === '' && allowNull) onChange(null);
          else onChange(Number(v));
        }}
        className="w-full px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
        style={{ background: '#091D35' }}
        placeholder={allowNull ? '—' : ''} />
    </div>
  );
}

function KPI({ label, value, cor, big = false }: { label: string; value: string; cor: string; big?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${big ? 'col-span-2 md:col-span-1' : ''}`}
      style={{ background: '#0b1d36', border: '1px solid rgba(255,255,255,.05)' }}>
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className={`font-mono font-bold ${big ? 'text-base' : 'text-sm'}`} style={{ color: cor }}>{value}</p>
    </div>
  );
}

function UfDropdown({ selected, onChange, labels }: { selected: string[]; onChange: (ufs: string[]) => void; labels: { title: string; all: string; selected: (count: number) => string; clear: string } }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Calcula posição do dropdown via Portal (sai do overflow do container pai)
  useEffect(() => {
    if (!open) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Click fora fecha
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle(uf: string) {
    onChange(selected.includes(uf) ? selected.filter(u => u !== uf) : [...selected, uf]);
  }

  const label = selected.length === 0
    ? labels.all
    : selected.length <= 3
      ? selected.join(', ')
      : labels.selected(selected.length);

  return (
    <div>
      <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
        {labels.title}
      </label>
      <button ref={triggerRef} onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40 hover:border-white/30 transition-colors"
        style={{ background: '#091D35' }}>
        <span className="truncate text-left">{label}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selected.length > 0 && (
            <span onClick={e => { e.stopPropagation(); onChange([]); }}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white/60 hover:text-white hover:bg-white/10 cursor-pointer">
              {labels.clear}
            </span>
          )}
          <ChevronDown size={13} className="text-white/40" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.15s' }} />
        </div>
      </button>
      {mounted && open && createPortal(
        <div ref={dropdownRef}
          className="rounded-lg p-2 max-h-72 overflow-y-auto shadow-2xl"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: Math.max(coords.width, 280),
            zIndex: 1000,
            background: '#0b1d36',
            border: '1px solid rgba(255,255,255,.1)',
          }}>
          <div className="grid grid-cols-3 gap-1">
            {UFS.map(uf => (
              <button key={uf} onClick={() => toggle(uf)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  selected.includes(uf)
                    ? 'bg-cyan-400/15 text-cyan-300'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`}>
                <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[9px] ${
                  selected.includes(uf) ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20'
                }`}>
                  {selected.includes(uf) && '✓'}
                </span>
                {uf}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mesma mecânica do UfDropdown (painel em portal, fecha ao clicar fora), com BUSCA:
// são 87 regiões, e achar "Campinas" rolando a lista não é prático.
function RegiaoDropdown({ selected, onChange, labels }: {
  selected: string[]; onChange: (ids: string[]) => void;
  labels: { title: string; all: string; selected: (count: number) => string; clear: string; search: string; cities: (count: number) => string; hint: string };
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [busca, setBusca] = useState('');
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    function update() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return q ? REGIOES_METROPOLITANAS.filter(r => semAcento(r.nome).includes(q)) : REGIOES_METROPOLITANAS;
  }, [busca]);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  }

  const label = selected.length === 0
    ? labels.all
    : selected.length <= 2
      ? selected.map(id => REGIOES_METROPOLITANAS.find(r => r.id === id)?.nome ?? id).join(', ')
      : labels.selected(selected.length);

  return (
    <div>
      <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
        {labels.title}
      </label>
      <button ref={triggerRef} onClick={() => { setOpen(!open); setBusca(''); }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40 hover:border-white/30 transition-colors"
        style={{ background: '#091D35' }}>
        <span className="truncate text-left">{label}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selected.length > 0 && (
            <span onClick={e => { e.stopPropagation(); onChange([]); }}
              className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white/60 hover:text-white hover:bg-white/10 cursor-pointer">
              {labels.clear}
            </span>
          )}
          <ChevronDown size={13} className="text-white/40" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: '.15s' }} />
        </div>
      </button>
      <p className="text-[9px] text-gray-600 mt-1">{labels.hint}</p>
      {mounted && open && createPortal(
        <div ref={dropdownRef}
          className="rounded-lg p-2 shadow-2xl"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: Math.max(coords.width, 340),
            zIndex: 1000,
            background: '#0b1d36',
            border: '1px solid rgba(255,255,255,.1)',
          }}>
          <input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder={labels.search}
            className="w-full mb-2 px-3 py-1.5 rounded-md text-xs text-white border border-white/10 outline-none focus:border-cyan-400/40"
            style={{ background: '#091D35' }} />
          <div className="max-h-64 overflow-y-auto">
            {visiveis.map(r => (
              <button key={r.id} onClick={() => toggle(r.id)}
                className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold text-left transition-colors ${
                  selected.includes(r.id)
                    ? 'bg-cyan-400/15 text-cyan-300'
                    : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                }`}>
                <span className={`w-3 h-3 shrink-0 rounded-sm border flex items-center justify-center text-[9px] ${
                  selected.includes(r.id) ? 'border-cyan-400 bg-cyan-400/20' : 'border-white/20'
                }`}>
                  {selected.includes(r.id) && '✓'}
                </span>
                <span className="truncate flex-1">{r.nome}</span>
                <span className="shrink-0 text-[9px] font-normal text-white/30">{labels.cities(r.municipios.length)}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function Th({ label, coluna, right, sticky, orderBy, orderDir, onSort }: {
  label: string; coluna: string; right?: boolean; sticky?: boolean;
  orderBy: string; orderDir: 'asc' | 'desc'; onSort: (c: string) => void;
}) {
  const active = orderBy === coluna;
  return (
    <th className={`px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none ${right ? 'text-right' : 'text-left'} ${sticky ? 'sticky left-0' : ''} ${active ? 'text-cyan-300' : 'text-white/40 hover:text-white/70'}`}
      style={{ background: sticky ? '#0b1d36' : undefined }}
      onClick={() => onSort(coluna)}>
      {label} {active && (orderDir === 'desc' ? '↓' : '↑')}
    </th>
  );
}
