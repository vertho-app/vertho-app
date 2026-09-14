'use client';

import { Check, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Estado } from '@/lib/simulador-vendas/schema';
import styles from './treino.module.css';

type Feedback = NonNullable<Estado['feedback']>;
type CampoFeedback = 'realismo' | 'desafio' | 'interacao' | 'utilidade' | 'aprendizado';

const CAMPOS: CampoFeedback[] = ['realismo', 'desafio', 'interacao', 'utilidade', 'aprendizado'];

export default function Avaliacao({
  feedback,
  salvo,
  comDevolutiva,
  desabilitado,
  onChange,
  onSubmit,
}: {
  feedback: Feedback;
  salvo: boolean;
  comDevolutiva: boolean;
  desabilitado: boolean;
  onChange: (feedback: Feedback) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('SimuladorVendas');
  const completa = CAMPOS.every((campo) => feedback[campo] >= 1 && feedback[campo] <= 5);

  return (
    <section className={styles.evaluation} aria-labelledby="pace-avaliacao-titulo">
      <div className={styles.evaluationHeader}>
        <div>
          <p className={styles.evaluationEyebrow}>{t(salvo ? 'evaluationComplete' : 'evaluationRequired')}</p>
          <h2 id="pace-avaliacao-titulo" className={styles.evaluationTitle}>
            {t(salvo ? 'feedbackSavedTitle' : 'feedbackTitle')}
          </h2>
          <p className={styles.evaluationDescription}>
            {t(
              salvo
                ? comDevolutiva
                  ? 'feedbackSavedDescription'
                  : 'feedbackSavedNoReport'
                : comDevolutiva
                  ? 'feedbackBeforeReport'
                  : 'feedbackInterrupted',
            )}
          </p>
        </div>
        {comDevolutiva && (
          <ol className={styles.deliverySteps} aria-label={t('deliverySteps')}>
            <li className={salvo ? styles.stepDone : styles.stepCurrent} aria-current={!salvo ? 'step' : undefined}>
              <span>{salvo ? <Check size={15} aria-hidden="true" /> : '1'}</span>
              <div>
                <strong>{t('experienceStep')}</strong>
                <small>{t(salvo ? 'sent' : 'currentStep')}</small>
              </div>
            </li>
            <li className={salvo ? styles.stepCurrent : styles.stepLocked} aria-current={salvo ? 'step' : undefined}>
              <span>{salvo ? '2' : <LockKeyhole size={14} aria-hidden="true" />}</span>
              <div>
                <strong>{t('reportStep')}</strong>
                <small>{t(salvo ? 'released' : 'afterEvaluation')}</small>
              </div>
            </li>
          </ol>
        )}
      </div>

      {!salvo && (
        <form
          className={styles.evaluationForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (completa) onSubmit();
          }}
        >
          <p className={styles.ratingScale}>{t('ratingScale')}</p>
          <div className={styles.feedback}>
            {CAMPOS.map((campo) => (
              <fieldset className={styles.ratingField} key={campo}>
                <legend>{t(campo)}</legend>
                <div className={styles.ratingOptions}>
                  {[1, 2, 3, 4, 5].map((nota) => {
                    const id = `pace-${campo}-${nota}`;
                    return (
                      <span key={nota}>
                        <input
                          className={styles.ratingInput}
                          type="radio"
                          id={id}
                          name={campo}
                          value={nota}
                          checked={feedback[campo] === nota}
                          aria-label={t('ratingValue', { value: nota })}
                          disabled={desabilitado}
                          onChange={() => onChange({ ...feedback, [campo]: nota })}
                        />
                        <label className={styles.ratingLabel} htmlFor={id}>
                          {nota}
                        </label>
                      </span>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <label className="mt-4" htmlFor="pace-comentario">
            {t('comment')}
          </label>
          <textarea
            id="pace-comentario"
            className="mt-2"
            value={feedback.comentario}
            disabled={desabilitado}
            onChange={(event) => onChange({ ...feedback, comentario: event.target.value })}
            rows={3}
            maxLength={2000}
          />
          <p className={`${styles.muted} mt-2`}>{t('feedbackDoesNotChangeScore')}</p>
          <button type="submit" disabled={desabilitado || !completa} className={`${styles.primary} mt-4`}>
            {t(comDevolutiva ? 'saveAndOpenReport' : 'saveFeedback')}
          </button>
        </form>
      )}
    </section>
  );
}
