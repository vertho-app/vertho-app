'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Trash2, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { listarLixeira, restaurarDaLixeira, esvaziarLixeira } from '@/app/admin/empresas/[empresaId]/actions';
import { listarBackups, executarBackupDiario } from '@/actions/backup';
import AdminPageHeader from '@/components/admin/page-header';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';

export default function LixeiraPage() {
  const locale = useLocale();
  const t = useTranslations('AdminTrash');
  const confirmDialog = useConfirm();
  const { empresaId } = useEmpresaContexto();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [filtroTabela, setFiltroTabela] = useState('');
  const [backups, setBackups] = useState([]);
  const [showBackups, setShowBackups] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const [r, b] = await Promise.all([
      listarLixeira(empresaId),
      listarBackups(),
    ]);
    setItems(r.items || []);
    setBackups(b.backups || []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  async function handleBackupAgora() {
    setBusy(true);
    const r = await executarBackupDiario();
    setBusy(false);
    if (r.error) toast.error(r.error); else toast.success(r.message);
    await carregar();
  }

  const tabelas = [...new Set(items.map(i => i.tabela_origem))].sort();
  const filtrados = filtroTabela ? items.filter(i => i.tabela_origem === filtroTabela) : items;

  function toggleAll() {
    if (selecionados.size === filtrados.length) setSelecionados(new Set());
    else setSelecionados(new Set(filtrados.map(i => i.id)));
  }

  async function handleRestaurar() {
    if (selecionados.size === 0) return;
    const ok = await confirmDialog({
      title: t('actions.restoreSelected'),
      message: t('confirm.restore', { count: selecionados.size }),
      severity: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    const r = await restaurarDaLixeira([...selecionados]);
    setBusy(false);
    if (r.error) toast.error(r.error); else toast.success(r.message);
    setSelecionados(new Set());
    await carregar();
  }

  async function handleEsvaziar() {
    // purge é irrecuperável (remove da própria lixeira) → nível crítico com digitação
    const ok = await confirmDialog({
      title: t('actions.emptyOld'),
      message: t('confirm.empty'),
      severity: 'critical',
      typedConfirmation: t('confirm.emptyWord'),
    });
    if (!ok) return;
    setBusy(true);
    const r = await esvaziarLixeira(empresaId);
    setBusy(false);
    if (r.error) toast.error(r.error); else toast.success(r.message);
    await carregar();
  }

  return (
    <div className="min-h-full text-white">
      <div className="max-w-5xl mx-auto p-6">
        <AdminPageHeader
          icon={Trash2}
          iconClassName="text-red-400"
          title={t('title')}
          subtitle={`${empresaId ? t('scope.company') : t('scope.all')} · ${t('records', { count: items.length })}`}
          backHref="/admin/dashboard"
          actions={
            <>
              <button onClick={() => setShowBackups(!showBackups)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10">
                {t('backups.button', { count: backups.length })}
              </button>
              <button onClick={handleEsvaziar} disabled={busy}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 disabled:opacity-50">
                <Trash2 size={14} /> {t('actions.emptyOld')}
              </button>
            </>
          }
        />

        {/* Painel de backups */}
        {showBackups && (
          <div className="mb-6 rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-cyan-400">{t('backups.title')}</h2>
              <button onClick={handleBackupAgora} disabled={busy}
                className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:opacity-50">
                {busy ? t('backups.generating') : t('backups.now')}
              </button>
            </div>
            {backups.length === 0 ? (
              <p className="text-xs text-gray-500">{t('backups.empty')}</p>
            ) : (
              <div className="space-y-1">
                {backups.map(b => (
                  <div key={b.nome} className="flex items-center gap-3 px-3 py-2 rounded bg-white/5 text-xs">
                    <span className="text-white font-bold">{b.data}</span>
                    <span className="text-gray-400">{b.tamanho_kb} KB</span>
                    <span className="text-[10px] text-gray-500 ml-auto">{new Date(b.criado_em).toLocaleString(locale)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-gray-500 mt-3">
              {t('backups.restoreHint')}
            </p>
          </div>
        )}

        {/* Filtros + ações */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs text-white border border-white/10 bg-[#091D35]">
            <option value="">{t('filters.allTables', { count: items.length })}</option>
            {tabelas.map(t => (
              <option key={t} value={t}>{t} ({items.filter(i => i.tabela_origem === t).length})</option>
            ))}
          </select>
          {filtrados.length > 0 && (
            <>
              <button onClick={toggleAll} className="text-xs text-cyan-400 hover:text-cyan-300">
                {selecionados.size === filtrados.length ? t('actions.unselectAll') : t('actions.selectAll')}
              </button>
              <span className="text-xs text-gray-500">{t('selected', { count: selecionados.size })}</span>
            </>
          )}
          <button onClick={handleRestaurar} disabled={busy || selecionados.size === 0}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {t('actions.restoreSelected')}
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="text-center py-12"><Loader2 size={24} className="animate-spin text-cyan-400 mx-auto" /></div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">{t('empty')}</div>
        ) : (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-white/[0.04]">
                <tr className="text-left text-[10px] uppercase text-gray-500">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">{t('table.origin')}</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">{t('table.context')}</th>
                  <th className="px-3 py-2">{t('table.deletedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtrados.map(it => {
                  const sel = selecionados.has(it.id);
                  return (
                    <tr key={it.id} className={`hover:bg-white/[0.02] cursor-pointer ${sel ? 'bg-emerald-500/5' : ''}`}
                      onClick={() => {
                        const novo = new Set(selecionados);
                        if (sel) novo.delete(it.id); else novo.add(it.id);
                        setSelecionados(novo);
                      }}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={sel} readOnly />
                      </td>
                      <td className="px-3 py-2 font-bold text-cyan-400">{it.tabela_origem}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500 font-mono">{it.registro_id?.slice(0, 8) || '—'}</td>
                      <td className="px-3 py-2 text-gray-300">{it.contexto || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">
                        {new Date(it.deletado_em).toLocaleString(locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <span>{t('warning')}</span>
        </div>
      </div>
    </div>
  );
}
