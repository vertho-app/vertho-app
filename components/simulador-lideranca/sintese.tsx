'use client';
/**
 * "Sua jornada": a síntese dos encontros concluídos, por competência. Mostra o
 * MAIOR nível demonstrado e "subiu de nível" quando houve avanço; queda não é
 * mostrada, como no resto do produto. Depois do quinto encontro, sugere qual
 * repetir (onde a competência com menos evidência ou menor nível é o foco).
 */
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { EPISODIOS } from '@/lib/simulador-lideranca/episodios';
import type { SinteseJornada } from '@/lib/simulador-lideranca/avaliacao';
import styles from './treino.module.css';

export default function SinteseJornadaView({
  sintese,
  bloqueado = false,
  onAbrirEncontro,
  publico = 'pessoa',
}: {
  sintese: SinteseJornada;
  bloqueado?: boolean;
  onAbrirEncontro?: (indice: number) => void;
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
      {sugestao !== null && onAbrirEncontro && (
        <div className={styles.practice}>
          <h3>{t('suggestionTitle')}</h3>
          <p>
            {t('suggestionText', {
              n: sugestao + 1,
              competencia: EPISODIOS[sugestao].nome,
            })}
          </p>
          <button type="button" disabled={bloqueado} onClick={() => onAbrirEncontro(sugestao)}>
            {t('openEncounter', { n: sugestao + 1 })}
          </button>
        </div>
      )}
    </details>
  );
}
