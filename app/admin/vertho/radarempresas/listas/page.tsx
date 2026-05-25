'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Loader2, Plus, Download, List, X } from 'lucide-react';
import { listarListas, criarLista, exportarCSV } from '@/actions/radarempresas/listas';

export default function RadarListasPage() {
  const router = useRouter();
  const t = useTranslations('AdminCompanyRadarLists');
  const [listas, setListas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setListas(await listarListas());
    setLoading(false);
  }
  useEffect(() => { reload(); }, []);

  async function handleCriar() {
    if (!nome.trim()) return;
    setBusy('criar');
    const r = await criarLista({ nome, descricao: desc });
    setBusy(null);
    if (r.ok === false) { alert(r.error); return; }
    setNome(''); setDesc(''); setCriando(false);
    await reload();
  }

  async function handleExport(listaId: string, nomeArq: string) {
    setBusy(listaId);
    const r = await exportarCSV({ listaId });
    setBusy(null);
    if (r.ok === false) { alert(r.error); return; }
    const blob = new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nomeArq.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  return (
    <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/vertho/radarempresas')}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <List size={20} className="text-cyan-400" /> {t('title')}
            </h1>
            <p className="text-xs text-gray-500">{t('subtitle')}</p>
          </div>
        </div>
        <button onClick={() => setCriando(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10">
          <Plus size={12} /> {t('newList')}
        </button>
      </div>

      {criando && (
        <div className="mb-5 p-4 rounded-xl border border-cyan-400/20" style={{ background: '#0F2A4A' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-white">{t('newList')}</p>
            <button onClick={() => { setCriando(false); setNome(''); setDesc(''); }} className="text-gray-500 hover:text-white"><X size={14} /></button>
          </div>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder={t('namePlaceholder')}
            className="w-full mb-2 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={t('descriptionPlaceholder')}
            className="w-full mb-3 rounded-lg border border-white/10 bg-[#091D35] text-white text-sm px-3 py-2 focus:outline-none focus:border-cyan-400/50" />
          <button onClick={handleCriar} disabled={!nome.trim() || busy === 'criar'}
            className="w-full py-2.5 rounded-lg text-[11px] font-bold text-[#0F2B54] bg-cyan-400 hover:brightness-110 disabled:opacity-50">
            {busy === 'criar' ? t('creating') : t('create')}
          </button>
          <p className="text-[9px] text-gray-500 mt-2">{t('createHint')}</p>
        </div>
      )}

      {listas.length === 0 ? (
        <div className="text-center py-16">
          <List size={28} className="text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{t('empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listas.map(l => (
            <div key={l.id} className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06]" style={{ background: '#0F2A4A' }}>
              <div>
                <p className="text-sm font-bold text-white">{l.nome}</p>
                {l.descricao && <p className="text-[11px] text-gray-500">{l.descricao}</p>}
                <p className="text-[10px] text-gray-600 mt-1">
                  {t('items', { count: l.total_itens })} · {Object.entries(l.por_status || {}).map(([s, n]) => `${s}: ${n}`).join(' · ') || t('noItems')}
                </p>
              </div>
              <button onClick={() => handleExport(l.id, l.nome)} disabled={busy === l.id || l.total_itens === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 disabled:opacity-40">
                {busy === l.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} CSV
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
