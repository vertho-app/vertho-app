'use client';
/**
 * "Sua jornada": a síntese dos encontros concluídos, por competência. Mostra o
 * MAIOR nível demonstrado e "subiu de nível" quando houve avanço; queda não é
 * mostrada, como no resto do produto. Depois do quinto encontro, sugere qual
 * repetir (onde a competência com o menor nível alcançado, ou sem nível, é o
 * foco), com o botão que já abre a confirmação da repetição (27/09/2026: antes
 * eram três passos, abrir o encontro, achar "Repetir" e confirmar).
 */
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { RotateCcw, Star } from 'lucide-react';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import type { SinteseJornada } from '@/lib/simulador-lideranca/avaliacao';
import styles from './treino.module.css';

export default function SinteseJornadaView({
  sintese,
  bloqueado = false,
  onRepetir,
  confirmacao,
  publico = 'pessoa',
}: {
  sintese: SinteseJornada;
  bloqueado?: boolean;
  /** Pede a repetição do encontro sugerido (quem chama abre a confirmação). */
  onRepetir?: (indice: number) => void;
  /** A confirmação da repetição, mostrada logo abaixo do botão. */
  confirmacao?: ReactNode;
  /** Segunda pessoa para quem pratica; terceira para quem acompanha. */
  publico?: 'pessoa' | 'equipe';
}) {
  const t = useTranslations('SimuladorLideranca');
  const sugestao = sintese.sugestaoRepetir;
  const sufixo = publico === 'equipe' ? 'Team' : '';
  return (
    <details className={styles.synthesis} open={sintese.concluida}>
      <summary>
        <span>{t(`${sintese.concluida ? 'synthesisDoneTitle' : 'synthesisTitle'}${sufixo}`)}</span>
        <small>
          {sintese.media.nivel != null
            ? t('synthesisAverage', { level: sintese.media.nivel })
            : t('synthesisNoAverage')}
        </small>
      </summary>
      <p className={styles.muted}>{t(`synthesisHelp${sufixo}`)}</p>
      <ul className={styles.synthesisList}>
        {sintese.competencias.map((c) => (
          <li key={c.nome}>
            <span>
              {c.nome}
              <small>{t('synthesisEvaluated', { n: c.avaliada, comNivel: c.comNivel })}</small>
            </span>
            <b>
              {c.nivelAlcancado != null
                ? t('levelN', { n: c.nivelAlcancado })
                : c.avaliada
                  ? t('noLevel')
                  : t('notYet')}
              {c.subiu && (
                <em className={styles.up}>
                  <Star size={13} aria-hidden /> {t('levelUp')}
                </em>
              )}
            </b>
          </li>
        ))}
      </ul>
      {sugestao !== null && onRepetir && (
        <div className={styles.practice}>
          <h3>{t('suggestionTitle')}</h3>
          <p>
            {t('suggestionText', {
              n: sugestao + 1,
              competencia: EPISODIOS[sugestao].nome,
            })}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} disabled={bloqueado} onClick={() => onRepetir(sugestao)}>
              <RotateCcw size={16} aria-hidden />
              {t('repeatEncounter', { n: sugestao + 1 })}
            </button>
          </div>
          {confirmacao}
        </div>
      )}
    </details>
  );
}
