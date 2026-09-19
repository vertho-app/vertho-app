'use client';
import { useTranslations } from 'next-intl';
import type { ResumoRevisoes } from '@/lib/simuladores/revisao-painel';
import styles from './revisao-humana.module.css';
export default function PainelRevisoes({
  resumo,
}: {
  resumo: ResumoRevisoes | null;
}) {
  const t = useTranslations('SimuladorRevisao');
  return (
    <section className={`${styles.root} ${styles.escuro}`} aria-label={t('overview')}>
      <h3>{t('overview')}</h3>
      <p className={styles.muted}>{t('overviewHelp')}</p>
      {resumo ? (
        <dl className={styles.metricas}>
          {(['pendentes', 'concordo', 'parcialmente', 'discordo'] as const).map(
            (k) => (
              <div key={k}>
                <dt>{t(k === 'pendentes' ? 'pending' : 'verdict_' + k)}</dt>
                <dd>{resumo[k]}</dd>
              </div>
            ),
          )}
        </dl>
      ) : (
        <p role="status">{t('unavailable')}</p>
      )}
    </section>
  );
}
