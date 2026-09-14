'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

export function tempoDeRetomada(ate: string | null | undefined, agora: number): string | null {
  const segundos = Math.max(0, Math.ceil((Date.parse(ate || '') - agora) / 1000));
  return Number.isFinite(segundos) && segundos > 0
    ? `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`
    : null;
}
export default function Processamento({ ate }: { ate?: string | null }) {
  const t = useTranslations('SimuladorVendas'),
    [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const tempo = tempoDeRetomada(ate, agora);
  return (
    <div role="status" className="border border-brand-300/25 bg-brand-500/5 rounded-2xl p-4 mb-4">
      <p className="text-sm flex gap-2 items-start">
        <Loader2 size={16} className="shrink-0 mt-0.5 motion-safe:animate-spin" />
        {t('remoteProcessing')}
      </p>
      <p className="text-xs text-slate-300 mt-2">
        {tempo ? t('leaseTime', { time: tempo }) : t('checkingRecovery')}
      </p>
    </div>
  );
}
