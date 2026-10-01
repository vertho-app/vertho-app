'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import PreferenciasAprendizagemForm, { prefsVazias } from '@/components/preferencias-aprendizagem-form';
import { getMinhasPreferenciasAprendizagem, salvarPreferenciasAprendizagem } from './actions';

/**
 * Preferências de aprendizagem avulsas — para quem não faz o Mapeamento
 * Comportamental nativo (fonte externa de perfil). O assessment manda para cá ao
 * fim do primeiro mapeamento (`precisaPreferencias`); ao salvar, volta para ele.
 */
export default function PreferenciasAprendizagemPage() {
  const t = useTranslations('LearningPreferencesPage');
  const router = useRouter();
  const [prefs, setPrefs] = useState<Record<string, number>>(() => prefsVazias());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ativo = true;
    getMinhasPreferenciasAprendizagem()
      .then((r: any) => {
        if (!ativo) return;
        if (r?.prefs) setPrefs(r.prefs);
        else if (r?.error) toast.error(r.error);
      })
      .catch(() => { if (ativo) toast.error(t('loadError')); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRated = Object.values(prefs).every(v => v > 0);

  async function salvar() {
    setSaving(true);
    try {
      const r: any = await salvarPreferenciasAprendizagem(prefs);
      if (!r?.success) { toast.error(r?.error || t('saveError')); setSaving(false); return; }
      router.replace('/dashboard/assessment');
    } catch (e: any) {
      toast.error(e?.message || t('saveError'));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60dvh]">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl py-3" data-preferencias="aprendizagem">
      <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-400 mb-1">{t('tag')}</p>
      <h1 className="text-[26px] font-black text-white leading-tight mb-1" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{t('title')}</h1>
      <p className="text-[14px] text-gray-400 mb-5">{t('subtitle')}</p>

      <PreferenciasAprendizagemForm
        value={prefs}
        onChange={(id, star) => setPrefs(prev => ({ ...prev, [id]: star }))}
      />

      <button
        disabled={!allRated || saving}
        onClick={salvar}
        className="mt-5 w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase disabled:opacity-30 transition-all flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
      >
        {saving && <Loader2 size={16} className="animate-spin" />}
        {t('continue')}
      </button>
    </div>
  );
}
