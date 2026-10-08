'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import PreferenciasAprendizagemForm, { ordemInicial } from '@/components/preferencias-aprendizagem-form';
import { prefsDeOrdem } from '@/lib/access-gates/preferencias-aprendizagem';
import { getMinhasPreferenciasAprendizagem, salvarPreferenciasAprendizagem } from './actions';

/**
 * Preferências de aprendizagem avulsas — para quem não faz o Mapeamento
 * Comportamental nativo (fonte externa de perfil). O assessment manda para cá ao
 * fim do primeiro mapeamento (`precisaPreferencias`); ao salvar, volta para ele.
 */
export default function PreferenciasAprendizagemPage() {
  const t = useTranslations('LearningPreferencesPage');
  const router = useRouter();
  // Parte embaralhada; se já há uma ORDENAÇÃO gravada, parte dela. Notas em estrelas
  // (quem respondeu antes) não são uma ordem e não pré-preenchem.
  const [ordem, setOrdem] = useState<string[]>(() => ordemInicial().ordem);
  const [confirmada, setConfirmada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ativo = true;
    getMinhasPreferenciasAprendizagem()
      .then((r: any) => {
        if (!ativo) return;
        if (r?.prefs) {
          const ini = ordemInicial(r.prefs);
          setOrdem(ini.ordem);
          setConfirmada(ini.confirmada);
        } else if (r?.error) toast.error(r.error);
      })
      .catch(() => { if (ativo) toast.error(t('loadError')); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  async function salvar() {
    setSaving(true);
    try {
      const r: any = await salvarPreferenciasAprendizagem(prefsDeOrdem(ordem));
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
    // Mesma moldura do mapeamento (`mapeamento/layout.tsx`): sem ela o conteúdo
    // vai até a borda e o card da direita encosta nela. Sem o link "voltar ao
    // início": a etapa é pedida pelo assessment, e voltar pelo dashboard só levaria
    // de novo até aqui.
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 sm:px-6 lg:px-10" data-preferencias="container">
      <div className="mx-auto w-full max-w-5xl py-3" data-preferencias="aprendizagem">
        <p className="text-[10px] font-extrabold uppercase tracking-[2.5px] text-brand-400 mb-1">{t('tag')}</p>
        <h1 className="text-[26px] font-black text-white leading-tight mb-1" style={{ fontFamily: "var(--vh-font-display)" }}>{t('title')}</h1>
        <p className="text-[14px] text-gray-400 mb-5">{t('subtitle')}</p>

        <PreferenciasAprendizagemForm
          ordem={ordem}
          onChange={(nova) => { setOrdem(nova); setConfirmada(true); }}
        />

        <button
          disabled={!confirmada || saving}
          onClick={salvar}
          className="mt-5 w-full py-4 rounded-xl font-bold text-[#0C1829] text-sm tracking-wider uppercase disabled:opacity-30 transition-all flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #14B8A6)' }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t('continue')}
        </button>
      </div>
    </div>
  );
}
