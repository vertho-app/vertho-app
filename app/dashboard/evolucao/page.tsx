'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getSupabase } from '@/lib/supabase-browser';
import { Loader2, TrendingUp } from 'lucide-react';
import { loadEvolucao } from './evolucao-actions';

/**
 * "Minha evolução" não tem tela própria (R-08, 04/10/2026): quem já concluiu uma
 * temporada vai direto ao relatório dela, onde estão o nível por competência, o
 * avanço (piso zero, nunca queda) e o PDF. A tela antiga mostrava o par de notas
 * com duas casas, a queda em vermelho e "Nota média X de 4.0", contra a decisão
 * do dono de que ninguém do cliente vê nota decimal. Ver `evolucao-actions.ts`.
 *
 * O que sobra aqui é o estado de quem ainda não concluiu nenhuma: o menu e o
 * e-mail "Seu perfil de evolução" continuam apontando para esta rota.
 */
export default function EvolucaoPage() {
  const t = useTranslations('Evolution');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = getSupabase();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      const result = await loadEvolucao();
      if (result.error) { setError(result.error); setLoading(false); return; }
      if (result.trilhaId) {
        // Fica no spinner até a navegação terminar: mostrar o estado vazio por um
        // instante diria "ainda não concluiu" a quem concluiu.
        router.replace(`/dashboard/temporada/concluida?trilha=${encodeURIComponent(result.trilhaId)}&origem=temporada`);
        return;
      }
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-[60dvh]"><Loader2 size={32} className="animate-spin text-brand-400" /></div>;
  if (error) return <div className="px-5 pt-10 text-center text-gray-400">{error}</div>;

  return (
    <div>
      <header className="px-5 pt-6 pb-4">
        <p className="text-[#9ae2e6] text-[11px] font-bold tracking-[0.12em] uppercase mb-2">{t('eyebrow')}</p>
        <h1 className="text-[2rem] leading-[1.05] font-extrabold tracking-tight">
          {t('empty.title')}
        </h1>
        <p className="text-base text-white/65 mt-2">
          {t('empty.subtitle')}
        </p>
      </header>
      <div className="px-5 pb-28 flex justify-center">
        <div className="rounded-[28px] p-8 text-center w-full max-w-md"
          style={{ background: 'rgba(11,29,50,0.92)', border: '1px solid rgba(154,226,230,0.12)' }}>
          <TrendingUp size={40} className="text-gray-500 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {t('empty.card')}
          </p>
          <Link href="/dashboard/temporada" className="mt-5 inline-flex rounded-xl border border-cyan-300/30 px-4 py-3 text-sm font-semibold text-cyan-200">{t('empty.goToJourney')}</Link>
        </div>
      </div>
    </div>
  );
}
