import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Diz à pessoa que o cenário é hipotético (pedido do dono, 19/10/2026). Vai em toda tela
 * em que ela lê um cenário: mapeamento do cargo e de liderança, avaliação final, semana de
 * aplicação no modo escrito e o relatório da jornada concluída.
 *
 * Não afirma que nomes ou números são ilustrativos: parte dos cenários usa dados reais do
 * contexto da empresa. `semInstrucao` é para quem já respondeu (relatório).
 */
export default function AvisoCenarioHipotetico({ semInstrucao = false, className = '' }: {
  semInstrucao?: boolean;
  className?: string;
}) {
  const t = useTranslations('CenarioHipotetico');
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-snug text-gray-400 ${className}`} data-aviso="cenario-hipotetico">
      <Info size={12} className="mt-px shrink-0 text-brand-400" aria-hidden />
      <span>
        <span className="font-semibold text-gray-300">{t('rotulo')}</span>
        {!semInstrucao && <> {t('instrucao')}</>}
      </span>
    </p>
  );
}
