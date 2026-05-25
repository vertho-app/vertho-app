'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';
import { criarNovaEmpresa } from './actions';

export default function NovaEmpresaPage() {
  const t = useTranslations('AdminNewCompany');
  const router = useRouter();
  const [nome, setNome] = useState('');
  const [segmento, setSegmento] = useState('corporativo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nome.trim()) { setError(t('errors.requiredName')); return; }
    setLoading(true); setError('');
    const r = await criarNovaEmpresa({ nome, segmento });
    if (r.success) {
      router.push(`/admin/empresas/${r.empresa.id}`);
    } else {
      setError(r.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[500px] mx-auto px-4 py-6" style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #091D35 0%, #0F2A4A 100%)' }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-white">{t('title')}</h1>
        <button onClick={() => router.push('/admin/dashboard')}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white">
          <ArrowLeft size={16} /> {t('back')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('fields.name')}</label>
          <input value={nome} onChange={e => setNome(e.target.value)} placeholder={t('placeholders.name')}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none focus:border-cyan-400/40"
            style={{ background: '#091D35' }} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">{t('fields.segment')}</label>
          <select value={segmento} onChange={e => setSegmento(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-sm text-white border border-white/10 outline-none"
            style={{ background: '#091D35' }}>
            <option value="corporativo">{t('segments.corporate')}</option>
            <option value="educacao">{t('segments.education')}</option>
          </select>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #0D9488, #0F766E)' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {loading ? t('creating') : t('create')}
        </button>
      </form>
    </div>
  );
}
