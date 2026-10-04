'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ClipboardCheck } from 'lucide-react';
import BackButton from '@/components/back-button';
import { PageContainer, GlassCard } from '@/components/page-shell';

/** "04/10/2026" no idioma da pessoa; data ilegível não imprime nada (nunca "Invalid Date"). */
export function formatarDataDoMapeamento(valor: string | null | undefined, locale: string): string | null {
  if (!valor) return null;
  const data = new Date(String(valor).length === 10 ? `${valor}T12:00:00` : valor);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(data);
}

/**
 * A semana de MAPEAMENTO do Onboarding (04/10/2026): o que a pessoa vê ao abri-la.
 *
 * A semana não tem conteúdo, desafio nem conversa de Evidências: ela representa o
 * Mapeamento das competências que a pessoa já fez e nasce concluída. O cartão diz
 * isso, lista as competências mapeadas e, para a própria pessoa, leva ao que ela
 * já tem dele (`/dashboard/assessment`, que na fase concluída mostra o resultado).
 * Na visão do gestor ou do RH (`leitura`) não há botão: o resultado é da pessoa.
 *
 * Nome de competência vem do dado e não se traduz.
 */
export default function SemanaMapeamento({
  competencias,
  concluidoEm,
  leitura,
  onVerMapeamento,
}: {
  competencias: string[];
  concluidoEm?: string | null;
  leitura: boolean;
  onVerMapeamento: () => void;
}) {
  const t = useTranslations('SeasonMapping');
  const locale = useLocale();
  const quando = formatarDataDoMapeamento(concluidoEm, locale);

  return (
    <PageContainer>
      <BackButton href="/dashboard/temporada" />
      <GlassCard className="mt-6" padding="p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5 bg-emerald-500/10 border border-emerald-400/25 flex-shrink-0">
            <ClipboardCheck size={20} className="text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t('title')}</h1>
            {quando && <p className="mt-1 text-xs text-gray-400">{t('doneOn', { date: quando })}</p>}
            <p className="mt-3 text-gray-300 leading-relaxed">{t('intro', { count: Math.max(1, competencias.length) })}</p>
            {competencias.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{t('competencies')}</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {competencias.map((c) => (
                    <li key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">{t('noContent')}</p>
            {!leitura && (
              <button
                type="button"
                onClick={onVerMapeamento}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-400 px-5 py-2.5 text-sm font-bold text-white transition"
              >
                {t('cta')}
              </button>
            )}
          </div>
        </div>
      </GlassCard>
    </PageContainer>
  );
}
