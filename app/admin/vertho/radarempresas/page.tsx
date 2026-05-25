'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  ArrowLeft, Loader2, Building2, Filter, Search, TrendingUp, MapPin, Target, Download, List, Network,
} from 'lucide-react';
import {
  loadRadarKpis, listarEmpresas, loadFunilMercado, loadModoBR, getCidadeXlsxUrl,
  type RadarKpis, type RadarEmpresaRow, type RadarFiltros, type FunilEtapa, type CidadeAgg,
} from '@/actions/radarempresas/busca';
import { exportarCSV, exportarXLSX } from '@/actions/radarempresas/listas';
import { SEGMENTOS_LIST, RADAR_DISCLAIMER } from '@/lib/radarempresas/segmentos';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const PORTES: Record<string, string> = { '01': 'ME', '03': 'EPP', '05': 'Demais', '00': 'NA' };
const CLASSIF = [
  { v: 'abordar_agora', l: 'Abordar agora' },
  { v: 'boa', l: 'Boa oportunidade' },
  { v: 'nutrir', l: 'Nutrir' },
  { v: 'baixa', l: 'Baixa prioridade' },
];

const fmtBrl = (n: number | null, locale: string) => n == null ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.round(n));
const fmt = (n: number | null | undefined, locale: string) => n == null ? '—' : Number(n).toLocaleString(locale);

export default function RadarEmpresasPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('AdminCompanyRadar');
  const [kpis, setKpis] = useState<RadarKpis | null>(null);
  const [funil, setFunil] = useState<FunilEtapa[]>([]);
  const [rows, setRows] = useState<RadarEmpresaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [f, setF] = useState<RadarFiltros>({ uf: 'SP', page: 0, pageSize: 50 });
  const [brMode, setBrMode] = useState<boolean | null>(null);
  const [cidades, setCidades] = useState<CidadeAgg[]>([]);
  const [ufFiltro, setUfFiltro] = useState('');
  const [baixandoCid, setBaixandoCid] = useState<string | null>(null);

  useEffect(() => {
    // Modo BR só ativa quando o pipeline nacional carregou cidades_agg.
    // Vazio/ausente → fallback pro modo Jundiaí atual (zero quebra).
    loadModoBR().then((br) => {
      if (br.brMode) {
        setBrMode(true); setCidades(br.cidades); setFunil(br.funil); setLoading(false);
      } else {
        setBrMode(false);
        Promise.all([loadRadarKpis(), loadFunilMercado()]).then(([k, fu]) => {
          setKpis(k); setFunil(fu); setLoading(false);
        });
      }
    });
  }, []);

  async function baixarCidade(c: CidadeAgg) {
    if (!c.xlsx_path) { alert(t('alerts.noCityXlsx')); return; }
    setBaixandoCid(c.municipio_ibge);
    const url = await getCidadeXlsxUrl(c.xlsx_path);
    setBaixandoCid(null);
    if (!url) { alert(t('alerts.linkFailed')); return; }
    window.open(url, '_blank');
  }

  async function buscar(reset = true) {
    setBuscando(true);
    const filtros = reset ? { ...f, page: 0 } : f;
    if (reset) setF(filtros);
    const r = await listarEmpresas(filtros);
    setRows(r.rows);
    setTotal(r.total);
    setBuscando(false);
  }

  const [exportando, setExportando] = useState<'csv' | 'xlsx' | null>(null);
  function baixar(blob: Blob, ext: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `radar-empresas-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function handleExportCSV() {
    setExportando('csv');
    const r = await exportarCSV({ filtros: f });
    setExportando(null);
    if (r.ok === false) { alert(r.error); return; }
    baixar(new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' }), 'csv');
  }
  async function handleExportXLSX() {
    setExportando('xlsx');
    const r = await exportarXLSX({ filtros: f });
    setExportando(null);
    if (r.ok === false) { alert(r.error); return; }
    const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
    baixar(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'xlsx');
  }
  async function irPagina(delta: number) {
    const novo = Math.max(0, (f.page ?? 0) + delta);
    const filtros = { ...f, page: novo };
    setF(filtros);
    setBuscando(true);
    const r = await listarEmpresas(filtros);
    setRows(r.rows); setTotal(r.total);
    setBuscando(false);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  // ── MODO BR: painel consolidado por município (lead-a-lead = XLSX) ──────
  if (brMode) {
    const ufs = [...new Set(cidades.map(c => c.uf).filter(Boolean))].sort() as string[];
    const lista = ufFiltro ? cidades.filter(c => c.uf === ufFiltro) : cidades;
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/admin/dashboard')}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Target size={20} className="text-cyan-400" /> {t('br.title')}
              </h1>
              <p className="text-xs text-gray-500">{t('br.subtitle', { count: cidades.length.toLocaleString(locale) })}</p>
            </div>
          </div>
          <button onClick={() => router.push('/admin/vertho/radarempresas/redes')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-300 hover:text-white">
            <Network size={13} /> {t('nav.networks')}
          </button>
        </div>

        {funil.length > 0 && (
          <div className="rounded-xl border border-white/[0.06] p-4 mb-5" style={{ background: '#0F2A4A' }}>
            <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3">
              <Target size={12} className="text-cyan-400" /> {t('marketBrazil')}
            </p>
            {funil.map((e, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5 text-[11px]">
                <span className="w-56 text-gray-400 shrink-0">{e.etapa}</span>
                <div className="flex-1 bg-white/[0.04] rounded h-4 overflow-hidden">
                  <div className="h-full bg-cyan-500/40" style={{ width: `${Math.max(e.pct_do_topo, 0.5)}%` }} />
                </div>
                <span className="w-32 text-right text-white font-semibold">{e.quantidade.toLocaleString(locale)} · {e.pct_do_topo}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <select value={ufFiltro} onChange={e => setUfFiltro(e.target.value)}
            className="rounded-lg border border-white/10 bg-[#091D35] text-white text-xs px-2 py-1.5">
            <option value="">{t('filters.allStates')}</option>
            {ufs.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <span className="text-[11px] text-gray-500">{t('filters.cityCount', { count: lista.length.toLocaleString(locale) })}</span>
        </div>

        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: '#0F2A4A' }}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500 border-b border-white/[0.06]">
                <th className="px-3 py-2 text-left">{t('table.city')}</th>
                <th className="px-3 py-2 text-right">{t('table.prioritized')}</th>
                <th className="px-3 py-2 text-right">{t('table.approachGood')}</th>
                <th className="px-3 py-2 text-right">Score méd.</th>
                <th className="px-3 py-2 text-left">{t('table.topSegment')}</th>
                <th className="px-3 py-2 text-right">{t('nav.networks')}</th>
                <th className="px-3 py-2 text-right">{t('table.assetsTam')}</th>
                <th className="px-3 py-2 text-right">XLSX</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 1000).map(c => (
                <tr key={c.municipio_ibge} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white">{c.municipio_nome}<span className="text-gray-600">/{c.uf}</span></td>
                  <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(c.n_priorizados, locale)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(c.n_abordar, locale)} / {fmt(c.n_boa, locale)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{c.score_medio == null ? '—' : Math.round(c.score_medio)}</td>
                  <td className="px-3 py-2 text-gray-500">{c.seg_top || '—'}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(c.n_redes, locale)}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{fmt(c.total_ativos, locale)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => baixarCidade(c)} disabled={!c.xlsx_path || baixandoCid === c.municipio_ibge}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-cyan-300 hover:bg-white/[0.04] disabled:opacity-40">
                      {baixandoCid === c.municipio_ibge ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lista.length > 1000 && <p className="text-[10px] text-gray-600 mt-2">{t('showingLimitUf', { total: lista.length.toLocaleString(locale) })}</p>}
        <p className="text-[9px] text-gray-600 mt-6 leading-relaxed border-t border-white/[0.04] pt-3">{RADAR_DISCLAIMER}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/dashboard')}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Target size={20} className="text-cyan-400" /> {t('title')}
            </h1>
            <p className="text-xs text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/admin/vertho/radarempresas/redes')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-300 border border-white/10 hover:text-white hover:border-white/30 transition-all">
            <Network size={12} /> {t('nav.networks')}
          </button>
          <button onClick={() => router.push('/admin/vertho/radarempresas/listas')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-gray-300 border border-white/10 hover:text-white hover:border-white/30 transition-all">
            <List size={12} /> {t('nav.lists')}
          </button>
          <button onClick={handleExportXLSX} disabled={exportando !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-green-400 border border-green-400/30 hover:bg-green-400/10 transition-all disabled:opacity-50">
            {exportando === 'xlsx' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {t('actions.exportXlsx')}
          </button>
          <button onClick={handleExportCSV} disabled={exportando !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
            {exportando === 'csv' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            CSV
          </button>
        </div>
      </div>

      {/* Estado dos dados */}
      {kpis && kpis.total_estabelecimentos === 0 && (
        <div className="mb-5 p-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.05]">
          <p className="text-xs font-bold text-amber-300 mb-1">{t('noData.title')}</p>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            {t('noData.description')}
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-5">
        <Kpi label={t('kpis.companies')} value={kpis?.total_empresas ?? 0} icon={<Building2 size={14} />} locale={locale} />
        <Kpi label={t('kpis.establishments')} value={kpis?.total_estabelecimentos ?? 0} icon={<Building2 size={14} />} locale={locale} />
        <Kpi label={t('kpis.withScore')} value={kpis?.com_score ?? 0} icon={<TrendingUp size={14} />} locale={locale} />
        <Kpi label={t('kpis.approach')} value={kpis?.abordar_agora ?? 0} color="#2ECC71" locale={locale} />
        <Kpi label={t('kpis.good')} value={kpis?.boa ?? 0} color="#34C5CC" locale={locale} />
      </div>

      {/* Funil de mercado endereçável */}
      {funil.length > 0 && funil[0].quantidade > 0 && (
        <div className="rounded-xl border border-white/[0.06] p-4 mb-5" style={{ background: '#0F2A4A' }}>
          <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3">
            <Target size={12} className="text-cyan-400" /> {t('market')}
            <span className="text-[9px] text-gray-500 font-normal">{t('marketHint')}</span>
          </p>
          <div className="space-y-1.5">
            {funil.map((e, i) => (
              <div key={e.etapa} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-400 w-64 shrink-0">{e.etapa}</span>
                <div className="flex-1 h-5 rounded bg-white/[0.04] overflow-hidden relative">
                  <div className="h-full transition-all" style={{
                    width: `${Math.max(e.pct_do_topo, 1)}%`,
                    background: i === 0 ? '#475569' : `rgba(52,197,204,${0.35 + i * 0.12})`,
                  }} />
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white">
                    {e.quantidade.toLocaleString(locale)}
                    <span className="text-gray-400 font-normal ml-1.5">· {e.pct_do_topo}%</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(kpis?.top_segmentos?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          <div>
            <MiniList title={t('topSegments')} icon={<Target size={12} />}
              items={kpis!.top_segmentos.map(s => ({ label: s.nome, n: s.n }))} />
            {(kpis?.genericos_count ?? 0) > 0 && (
              <p className="text-[10px] text-gray-500 mt-2 px-1">
                + <span className="text-amber-400 font-bold">{kpis!.genericos_count.toLocaleString(locale)}</span> {t('genericAdherent')}
                {t('genericHint')}
              </p>
            )}
          </div>
          <MiniList title={t('topCities')} icon={<MapPin size={12} />}
            items={kpis!.top_municipios.map(m => ({ label: m.municipio, n: m.n }))} />
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-xl border border-white/[0.06] p-4 mb-4" style={{ background: '#0F2A4A' }}>
        <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Filter size={12} /> {t('search.title')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
          <Sel label="UF" value={f.uf || ''} onChange={v => setF({ ...f, uf: v || undefined })}
            opts={[['', t('filters.all')], ...UFS.map(u => [u, u] as [string,string])]} />
          <Inp label={t('table.city')} value={f.municipio || ''} onChange={v => setF({ ...f, municipio: v || undefined })} />
          <Sel label={t('filters.segment')} value={f.segmento_key || ''} onChange={v => setF({ ...f, segmento_key: v || undefined })}
            opts={[['', t('filters.allMasculine')], ...SEGMENTOS_LIST.map(s => [s.key, s.nome] as [string,string])]} />
          <Sel label="Porte" value={f.porte || ''} onChange={v => setF({ ...f, porte: v || undefined })}
            opts={[['', t('filters.allMasculine')], ...Object.entries(PORTES)]} />
          <Sel label={t('filters.classification')} value={f.classificacao || ''} onChange={v => setF({ ...f, classificacao: (v || undefined) as any })}
            opts={[['', t('filters.all')], ...CLASSIF.map(c => [c.v, c.l] as [string,string])]} />
          <Inp label={t('filters.minScore')} value={String(f.score_min ?? '')} type="number"
            onChange={v => setF({ ...f, score_min: v ? Number(v) : undefined })} />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-gray-300 whitespace-nowrap px-2 cursor-pointer select-none">
            <input type="checkbox" checked={!!f.priorizados}
              onChange={e => setF({ ...f, priorizados: e.target.checked || undefined })}
              className="accent-cyan-400" />
            {t('filters.prioritizedOnly')}
          </label>
          <input value={f.busca || ''} onChange={e => setF({ ...f, busca: e.target.value || undefined })}
            placeholder={t('filters.tradeNamePlaceholder')} onKeyDown={e => e.key === 'Enter' && buscar()}
            className="flex-1 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
          <button onClick={() => buscar()} disabled={buscando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 disabled:opacity-50">
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} {t('search.button')}
          </button>
        </div>
      </div>

      {/* Tabela */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[9px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/[0.06]">
                <th className="px-3 py-2.5">{t('table.company')}</th>
                <th className="px-3 py-2.5">{t('table.cityUf')}</th>
                <th className="px-3 py-2.5">{t('filters.segment')}</th>
                <th className="px-3 py-2.5">Porte</th>
                <th className="px-3 py-2.5 text-right">Capital</th>
                <th className="px-3 py-2.5 text-right">Score</th>
                <th className="px-3 py-2.5">{t('table.classif')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.estabelecimento_id}
                  onClick={() => router.push(`/admin/vertho/radarempresas/empresa/${r.cnpj_completo}`)}
                  className="border-t border-white/[0.04] hover:bg-white/[0.03] cursor-pointer">
                  <td className="px-3 py-2.5">
                    <p className="text-white font-semibold">{r.nome_fantasia || r.razao_social || '—'}</p>
                    <p className="text-[10px] text-gray-500">{r.cnpj_completo}</p>
                  </td>
                  <td className="px-3 py-2.5 text-gray-400">{r.municipio_nome || '—'}/{r.uf || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400">{r.segmento_nome || '—'}</td>
                  <td className="px-3 py-2.5 text-gray-400">{r.porte_empresa ? PORTES[r.porte_empresa] : '—'}</td>
                  <td className="px-3 py-2.5 text-right text-gray-400">{fmtBrl(r.capital_social, locale)}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-cyan-300">{r.score_total == null ? '—' : Math.round(r.score_total)}</td>
                  <td className="px-3 py-2.5 text-[10px] text-gray-400">{r.classificacao_label || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-center text-xs text-gray-500 py-10">
          {buscando ? t('search.searching') : t('search.empty')}
        </p>
      )}
      {total > 0 && (() => {
        const ps = f.pageSize ?? 50;
        const pg = f.page ?? 0;
        const totalPages = Math.ceil(total / ps);
        const ini = pg * ps + 1;
        const fim = Math.min(pg * ps + rows.length, total);
        return (
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-gray-500">
              {t('pagination.summary', { start: ini.toLocaleString(locale), end: fim.toLocaleString(locale), total: total.toLocaleString(locale), page: pg + 1, pages: totalPages.toLocaleString(locale) })}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => irPagina(-1)} disabled={pg === 0 || buscando}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-300 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-30 transition-all">
                {t('pagination.previous')}
              </button>
              <button onClick={() => irPagina(1)} disabled={pg + 1 >= totalPages || buscando}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-gray-300 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-300 disabled:opacity-30 transition-all">
                {t('pagination.next')}
              </button>
            </div>
          </div>
        );
      })()}

      <p className="text-[9px] text-gray-600 mt-6 leading-relaxed border-t border-white/[0.04] pt-3">{RADAR_DISCLAIMER}</p>
    </div>
  );
}

function Kpi({ label, value, icon, color, small, locale }: any) {
  return (
    <div className="p-3 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">{icon}{label}</p>
      <p className={`font-bold ${small ? 'text-sm' : 'text-2xl'}`} style={{ color: color || '#fff' }}>
        {typeof value === 'number' ? value.toLocaleString(locale || 'pt-BR') : value}
      </p>
    </div>
  );
}

function MiniList({ title, icon, items }: any) {
  return (
    <div className="p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">{icon}{title}</p>
      {items.length === 0 ? <p className="text-[11px] text-gray-600">—</p> :
        items.map((it: any, i: number) => (
          <div key={i} className="flex justify-between text-[11px] py-1 border-b border-white/[0.03]">
            <span className="text-gray-300 truncate">{it.label}</span>
            <span className="text-cyan-400 font-bold">{it.n}</span>
          </div>
        ))}
    </div>
  );
}

function Sel({ label, value, onChange, opts }: any) {
  return (
    <div>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }}>
        {opts.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function Inp({ label, value, onChange, type = 'text' }: any) {
  return (
    <div>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-xs text-white border border-white/10 outline-none" style={{ background: '#091D35' }} />
    </div>
  );
}
