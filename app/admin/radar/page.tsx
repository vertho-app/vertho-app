'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleStop, Loader2, Upload, RefreshCw, FileText, FileSpreadsheet, Trash2, Terminal } from 'lucide-react';
import BackButton from '@/components/back-button';
import { useConfirm } from '@/components/admin/confirm-dialog';
import {
  loadRadarStats,
  ingestIcaFromUpload,
  ingestFundebFromUpload,
  ingestPddeFromUpload,
  ingestVaarFromUpload,
  ingestFundebReceitaFromUpload,
  deleteIngestRun,
  interruptIngestRun,
  markStaleIngestRuns,
  refreshRadarMaterializedViews,
} from './actions';

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  rodando:   { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  sucesso:   { bg: 'rgba(16,185,129,0.15)', color: '#6EE7B7' },
  parcial:   { bg: 'rgba(245,158,11,0.15)', color: '#FCD34D' },
  erro:      { bg: 'rgba(239,68,68,0.15)',  color: '#F97354' },
};

const MAX_WEB_UPLOAD_BYTES = 25 * 1024 * 1024;

function fmt(n: any, locale: string) { return Number(n ?? 0).toLocaleString(locale); }

/**
 * Converte ArrayBuffer em base64 sem estourar argument limit do JS engine
 * (que `String.fromCharCode(...arr)` quebra com Uint8Array > ~120k bytes).
 * Usa FileReader que lida nativamente com arquivos grandes.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // dataUrl = "data:application/...;base64,XXXXX"
      const idx = dataUrl.indexOf(',');
      resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader falhou'));
    reader.readAsDataURL(new Blob([buffer]));
  });
}

export default function AdminRadarPage() {
  const locale = useLocale();
  const t = useTranslations('AdminRadarIngestion');
  const confirmDialog = useConfirm();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingIca, setUploadingIca] = useState(false);
  const [uploadingFundeb, setUploadingFundeb] = useState(false);
  const [uploadingPdde, setUploadingPdde] = useState(false);
  const [uploadingVaar, setUploadingVaar] = useState(false);
  const [uploadingFundebRec, setUploadingFundebRec] = useState(false);
  const [refreshingMvs, setRefreshingMvs] = useState(false);
  const [markingStale, setMarkingStale] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  function addLog(msg: string) {
    setLogs((prev) => [`${new Date().toLocaleTimeString(locale)} · ${msg}`, ...prev].slice(0, 20));
  }

  function canUploadViaWeb(file: File) {
    if (file.size <= MAX_WEB_UPLOAD_BYTES) return true;
    addLog(t('logs.uploadBlocked', { file: file.name, size: (file.size / 1024 / 1024).toFixed(1) }));
    return false;
  }

  async function refresh() {
    setLoading(true);
    const r = await loadRadarStats();
    setStats(r);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleIcaUpload(file: File) {
    if (!canUploadViaWeb(file)) return;
    setUploadingIca(true);
    const isXlsx = /\.xlsx$/i.test(file.name);
    addLog(`ICA upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB · ${isXlsx ? 'XLSX' : 'CSV'})`);
    try {
      let r;
      if (isXlsx) {
        const buffer = await file.arrayBuffer();
        const base64 = await arrayBufferToBase64(buffer);
        r = await ingestIcaFromUpload({ format: 'xlsx', arquivoBase64: base64 }, file.name);
      } else {
        const text = await file.text();
        r = await ingestIcaFromUpload({ format: 'csv', texto: text }, file.name);
      }
      if (r.success) {
        const res = r.result;
        addLog(`ICA OK: ${res.totalSucesso} registros, ${res.totalFalha} erros, ${res.totalSkipped} skipped`);
        for (const err of (res.erros || []).slice(0, 3)) {
          addLog(`  ↳ ${err.key}: ${err.msg}`);
        }
      } else {
        addLog(`ICA ERRO: ${r.error}`);
      }
    } catch (e: any) {
      addLog(`ICA EXCEÇÃO: ${e.message}`);
    }
    setUploadingIca(false);
    refresh();
  }

  async function handleFundebUpload(file: File) {
    if (!canUploadViaWeb(file)) return;
    setUploadingFundeb(true);
    addLog(`FUNDEB upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    try {
      const text = await file.text();
      const r = await ingestFundebFromUpload(text, file.name);
      if (r.success) {
        const res = r.result;
        addLog(`FUNDEB OK: ${res.totalSucesso} agregados, ${res.totalFalha} erros, ${res.totalSkipped} skipped`);
        for (const err of (res.erros || []).slice(0, 3)) addLog(`  ↳ ${err.key}: ${err.msg}`);
      } else addLog(`FUNDEB ERRO: ${r.error}`);
    } catch (e: any) { addLog(`FUNDEB EXCEÇÃO: ${e.message}`); }
    setUploadingFundeb(false);
    refresh();
  }

  async function handlePddeUpload(file: File, preferMunicipal: boolean) {
    if (!canUploadViaWeb(file)) return;
    setUploadingPdde(true);
    addLog(`PDDE upload (${preferMunicipal ? 'municipal' : 'auto'}): ${file.name}`);
    try {
      const text = await file.text();
      const r = await ingestPddeFromUpload(text, file.name, preferMunicipal);
      if (r.success) {
        const res = r.result;
        addLog(`PDDE OK [${res.modo}]: ${res.totalSucesso} linhas, ${res.totalFalha} erros, ${res.totalSkipped} skipped`);
        for (const err of (res.erros || []).slice(0, 3)) addLog(`  ↳ ${err.key}: ${err.msg}`);
      } else addLog(`PDDE ERRO: ${r.error}`);
    } catch (e: any) { addLog(`PDDE EXCEÇÃO: ${e.message}`); }
    setUploadingPdde(false);
    refresh();
  }

  async function handleFundebReceitaUpload(file: File) {
    if (!canUploadViaWeb(file)) return;
    setUploadingFundebRec(true);
    addLog(`FUNDEB Receita upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = await arrayBufferToBase64(buffer);
      const r = await ingestFundebReceitaFromUpload(base64, file.name);
      if (r.success) {
        const res: any = r.result;
        addLog(`FUNDEB Receita OK: ${res.totalSucesso} entes (ano ${res.ano}), ${res.totalFalha} erros, ${res.totalSkipped} skipped`);
        if (typeof res.totalVaar === 'number' && res.totalVaar > 0) {
          addLog(`  ↳ total VAAR distribuído: R$ ${res.totalVaar.toLocaleString(locale, { maximumFractionDigits: 0 })}`);
        }
        for (const err of (res.erros || []).slice(0, 3)) addLog(`  ↳ ${err.key}: ${err.msg}`);
      } else addLog(`FUNDEB Receita ERRO: ${r.error}`);
    } catch (e: any) { addLog(`FUNDEB Receita EXCEÇÃO: ${e.message}`); }
    setUploadingFundebRec(false);
    refresh();
  }

  async function handleVaarUpload(file: File) {
    if (!canUploadViaWeb(file)) return;
    setUploadingVaar(true);
    addLog(`VAAR upload: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = await arrayBufferToBase64(buffer);
      const r = await ingestVaarFromUpload(base64, file.name);
      if (r.success) {
        const res: any = r.result;
        addLog(`VAAR OK: ${res.totalSucesso} entes (ano ${res.ano}), ${res.totalFalha} erros, ${res.totalSkipped} skipped`);
        if (typeof res.beneficiarios === 'number') {
          addLog(`  ↳ beneficiários da complementação: ${res.beneficiarios}`);
        }
        for (const err of (res.erros || []).slice(0, 3)) addLog(`  ↳ ${err.key}: ${err.msg}`);
      } else addLog(`VAAR ERRO: ${r.error}`);
    } catch (e: any) { addLog(`VAAR EXCEÇÃO: ${e.message}`); }
    setUploadingVaar(false);
    refresh();
  }

  async function handleDeleteRun(id: string) {
    const ok = await confirmDialog({
      title: t('confirm.deleteRun'),
      severity: 'danger',
    });
    if (!ok) return;
    await deleteIngestRun(id);
    refresh();
  }

  async function handleInterruptRun(id: string) {
    const ok = await confirmDialog({
      title: t('confirm.interruptRun'),
      severity: 'normal',
    });
    if (!ok) return;
    const r = await interruptIngestRun(id);
    addLog(r.success ? t('logs.runInterrupted') : t('logs.interruptFailed', { error: r.error }));
    refresh();
  }

  async function handleRefreshMvs() {
    setRefreshingMvs(true);
    const r = await refreshRadarMaterializedViews();
    addLog(r.success ? t('logs.mvsRefreshed') : t('logs.mvsFailed', { error: r.error }));
    setRefreshingMvs(false);
    refresh();
  }

  async function handleMarkStale() {
    const ok = await confirmDialog({
      title: t('confirm.markStale'),
      severity: 'normal',
    });
    if (!ok) return;
    setMarkingStale(true);
    const r = await markStaleIngestRuns(12);
    addLog(r.success ? t('logs.staleMarked', { count: r.count || 0 }) : t('logs.staleFailed', { error: r.error }));
    setMarkingStale(false);
    refresh();
  }

  return (
    <div className="min-h-full"
      style={{
        background: 'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <div className="max-w-[1100px] mx-auto px-5 py-6">
        <BackButton href="/admin/dashboard" />
        <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-white/[0.08]">
          <span className="text-[10px] tracking-[0.2em] text-white/30 uppercase font-mono">
            {t('eyebrow')}
          </span>
          <a href="/admin/radar/qualidade-dados" className="text-xs text-cyan-400 hover:text-cyan-300 mr-3">
            {t('links.quality')}
          </a>
          <a href="/admin/radar/funnel" className="text-xs text-cyan-400 hover:text-cyan-300 mr-3">
            {t('links.funnel')}
          </a>
          <div className="flex items-center gap-2">
            <button onClick={handleMarkStale} disabled={markingStale}
              title={t('actions.cleanOldTitle')}
              className="h-8 px-3 rounded-lg border border-amber-400/20 text-[10px] font-bold uppercase tracking-wider text-amber-200/80 hover:text-amber-100 disabled:opacity-50">
              {markingStale ? t('actions.marking') : t('actions.cleanOld')}
            </button>
            <button onClick={handleRefreshMvs} disabled={refreshingMvs}
              title={t('actions.refreshMvsTitle')}
              className="h-8 px-3 rounded-lg border border-cyan-400/20 text-[10px] font-bold uppercase tracking-wider text-cyan-200/80 hover:text-cyan-100 disabled:opacity-50">
              {refreshingMvs ? t('actions.refreshing') : 'Refresh MVs'}
            </button>
            <button onClick={refresh} disabled={loading}
              title={t('actions.reloadTitle')}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-white/40">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: t('stats.schools'), val: stats?.escolas },
            { label: t('stats.cities'), val: stats?.municipios },
            { label: t('stats.saeb'), val: stats?.snapshots },
            { label: t('stats.ica'), val: stats?.ica },
            { label: t('stats.ideb'), val: stats?.ideb },
            { label: t('stats.censoInfra'), val: stats?.censoInfra },
            { label: t('stats.censoTeachers'), val: stats?.censoDocentes },
            { label: 'SARESP', val: stats?.saresp },
            { label: 'FUNDEB', val: stats?.fundeb },
            { label: 'PDDE', val: stats?.pdde },
            { label: t('stats.vaar'), val: stats?.vaar },
            { label: t('stats.vaarBeneficiaries'), val: stats?.vaarBeneficiarios },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl p-4 border border-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.03)' }}>
              <p className="text-[9px] tracking-[0.2em] text-white/40 uppercase font-mono mb-1">{s.label}</p>
              <p className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                {fmt(s.val, locale)}
              </p>
            </div>
          ))}
        </div>

        {/* Imports via CLI (bases nacionais grandes) */}
        <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono mb-3">
          {t('cli.title')}
        </p>
        <div className="rounded-2xl p-5 border border-white/[0.06] mb-6"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Terminal size={16} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white">{t('cli.runLocal')}</h3>
          </div>
          <p className="text-xs text-white/50 mb-4 leading-relaxed">
            {t.rich('cli.description', { code: chunks => <code className="text-cyan-300">{chunks}</code> })}
          </p>
          <div className="space-y-3">
            {[
              {
                label: 'Saeb',
                desc: 'Via API INEP (não precisa baixar arquivo).',
                cmd: 'node scripts/import-saeb-api.mjs',
              },
              {
                label: 'Censo Escolar',
                desc: 'Microdados INEP — Tabela_Escola_*.csv (~165MB).',
                cmd: 'node scripts/import-censo.mjs Tabela_Escola_2025.csv',
              },
              {
                label: 'Censo Docentes',
                desc: 'Microdados INEP — Tabela_Docente_*.csv com QT_DOC_*.',
                cmd: 'node scripts/import-censo-docentes.mjs Tabela_Docente_2025.csv --ano 2025',
              },
              {
                label: 'Ideb',
                desc: 'XLSX oficial INEP por escola, séries históricas.',
                cmd: 'node scripts/import-ideb.mjs ideb_escolas.xlsx',
              },
              {
                label: 'SARESP — SP',
                desc: 'CSV dadosabertos.sp.gov.br com cross-match SP→INEP.',
                cmd: 'node scripts/import-saresp.mjs SARESP.csv',
              },
            ].map((it) => (
              <div key={it.label} className="flex flex-col gap-1 pb-3 border-b border-white/[0.04] last:border-b-0 last:pb-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-bold text-white uppercase tracking-wider">{it.label}</span>
                  <span className="text-[11px] text-white/45">{it.desc}</span>
                </div>
                <code className="text-[11px] font-mono text-cyan-400 bg-white/5 px-2 py-1 rounded inline-block self-start">
                  {it.cmd}
                </code>
              </div>
            ))}
          </div>
        </div>

        {/* Uploaders (cargas pequenas via UI) */}
        <p className="text-[10px] tracking-[0.2em] text-white/40 uppercase font-mono mb-3">
          {t('webUpload.title')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t('webUpload.ica.title')}</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              {t('webUpload.ica.desc')}
            </p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {uploadingIca ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingIca ? t('webUpload.processing') : t('webUpload.ica.button')}
              <input type="file" accept=".xlsx,.csv,.txt" className="hidden" disabled={uploadingIca}
                onChange={(e) => e.target.files?.[0] && handleIcaUpload(e.target.files[0])} />
            </label>
          </div>

          <div className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t('webUpload.fundeb.title')}</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              {t('webUpload.fundeb.desc')}
            </p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {uploadingFundeb ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingFundeb ? t('webUpload.processing') : t('webUpload.fundeb.button')}
              <input type="file" accept=".csv,.txt" className="hidden" disabled={uploadingFundeb}
                onChange={(e) => e.target.files?.[0] && handleFundebUpload(e.target.files[0])} />
            </label>
          </div>

          <div className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t('webUpload.pdde.title')}</h3>
            </div>
            <p className="text-xs text-white/50 mb-3">
              {t('webUpload.pdde.desc')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
                {uploadingPdde ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {t('webUpload.pdde.auto')}
                <input type="file" accept=".csv,.txt" className="hidden" disabled={uploadingPdde}
                  onChange={(e) => e.target.files?.[0] && handlePddeUpload(e.target.files[0], false)} />
              </label>
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold text-white cursor-pointer border border-white/10"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                {uploadingPdde ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {t('webUpload.pdde.forceCity')}
                <input type="file" accept=".csv,.txt" className="hidden" disabled={uploadingPdde}
                  onChange={(e) => e.target.files?.[0] && handlePddeUpload(e.target.files[0], true)} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t('webUpload.vaar.title')}</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              {t('webUpload.vaar.desc')}
            </p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {uploadingVaar ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingVaar ? t('webUpload.processing') : t('webUpload.vaar.button')}
              <input type="file" accept=".xlsx" className="hidden" disabled={uploadingVaar}
                onChange={(e) => e.target.files?.[0] && handleVaarUpload(e.target.files[0])} />
            </label>
          </div>

          <div className="rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet size={16} className="text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t('webUpload.fundebRevenue.title')}</h3>
            </div>
            <p className="text-xs text-white/50 mb-4">
              {t('webUpload.fundebRevenue.desc')}
            </p>
            <label className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white cursor-pointer"
              style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
              {uploadingFundebRec ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploadingFundebRec ? t('webUpload.processing') : t('webUpload.fundebRevenue.button')}
              <input type="file" accept=".xlsx" className="hidden" disabled={uploadingFundebRec}
                onChange={(e) => e.target.files?.[0] && handleFundebReceitaUpload(e.target.files[0])} />
            </label>
          </div>
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <p className="text-xs font-bold text-white">{t('sessionLog')}</p>
            </div>
            <div className="max-h-[180px] overflow-y-auto">
              {logs.map((l, i) => (
                <p key={i} className="px-4 py-1.5 text-[11px] font-mono text-white/60 border-b border-white/[0.03]">{l}</p>
              ))}
            </div>
          </div>
        )}

        {/* Recent runs */}
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
          style={{ background: '#0b1d36' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-bold text-white">{t('runs.title')}</p>
            <span className="text-[10px] text-white/30 font-mono">{stats?.runs?.length || 0}</span>
          </div>
          {(stats?.runs || []).length === 0 ? (
            <p className="px-4 py-6 text-xs text-white/40 text-center">{t('runs.empty')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-white/40 uppercase tracking-wider">
                  <th className="px-4 py-2">{t('runs.when')}</th>
                  <th className="px-4 py-2">{t('runs.source')}</th>
                  <th className="px-4 py-2">{t('runs.file')}</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">{t('runs.successFailSkip')}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(stats?.runs || []).map((r: any) => {
                  const cfg = STATUS_COLORS[r.status] || STATUS_COLORS.rodando;
                  return (
                    <tr key={r.id} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2 text-white/60 font-mono">
                        {new Date(r.iniciado_em).toLocaleString(locale, { hour12: false })}
                      </td>
                      <td className="px-4 py-2 text-white/80 font-bold uppercase text-[10px]">{r.fonte}</td>
                      <td className="px-4 py-2 text-white/50 truncate max-w-[200px]">{r.arquivo_origem || t('fallback.empty')}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-white/60 font-mono">
                        <span className="text-emerald-400">{r.total_sucesso || 0}</span>
                        {' / '}
                        <span className="text-red-400">{r.total_falha || 0}</span>
                        {' / '}
                        <span className="text-white/40">{r.total_skipped || 0}</span>
                      </td>
                      <td className="px-4 py-2">
                        {r.status === 'rodando' && (
                          <button onClick={() => handleInterruptRun(r.id)} className="text-white/30 hover:text-amber-300 mr-3" title={t('runs.markInterrupted')}>
                            <CircleStop size={12} />
                          </button>
                        )}
                        <button onClick={() => handleDeleteRun(r.id)} className="text-white/30 hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
