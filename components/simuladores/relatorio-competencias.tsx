'use client';
/**
 * Devolutiva por competência, COMUM aos três simuladores (vendas, atendimento e
 * liderança). Até 18/09/2026 cada um tinha a sua, e as três divergiam: "N3",
 * "2,5 / 4 · N2" e "N2 · 2,5/4" para a mesma coisa. Aqui:
 *   - competência em foco primeiro (quem chama ordena; `foco` só marca);
 *   - nível por extenso ("Nível 3"), como no resto do produto;
 *   - regra de cobertura dita em palavras quando a competência não tem nível;
 *   - comportamentos com citação, régua dos 4 níveis recolhida;
 *   - sem códigos, versões ou siglas internas.
 * Tema por CLASSE (escuro/claro): seletor de atributo em CSS module quebra o
 * dev server do Turbopack (memória de 06/09).
 */
import { useLocale, useTranslations } from 'next-intl';
import styles from './relatorio-competencias.module.css';

export interface EvidenciaRelatorio {
  texto: string;
  origem?: string | null;
}
export interface DescritorRelatorio {
  codigo: string;
  nome: string;
  nivel: number | null;
  justificativa?: string | null;
  evidencias?: EvidenciaRelatorio[];
  oportunidades?: EvidenciaRelatorio[];
  regua?: [string, string, string, string] | null;
  /** A citação não conferiu com a fala: o comportamento ficou sem nível. */
  descartado?: boolean;
}
export interface CompetenciaRelatorio {
  codigo: string;
  nome: string;
  foco?: boolean;
  nota: number | null;
  nivel: number | null;
  observados: number;
  total: number;
  suficiente: boolean;
  descritores: DescritorRelatorio[];
}
export interface MediaRelatorio {
  nota: number | null;
  nivel: number | null;
  competencias: number;
  suficiente: boolean;
}
/** `null` = relatório anterior à regra de cobertura (lido como foi gerado). */
export type RegraRelatorio = { minDescritores: number; minCompetencias: number } | null;

export default function RelatorioCompetencias({
  competencias,
  media,
  regra,
  tema = 'escuro',
  abrirFoco = true,
  rotuloMedia,
}: {
  competencias: CompetenciaRelatorio[];
  media?: MediaRelatorio | null;
  regra: RegraRelatorio;
  tema?: 'escuro' | 'claro';
  abrirFoco?: boolean;
  rotuloMedia?: string;
}) {
  const t = useTranslations('SimuladoresRelatorio');
  const locale = useLocale();
  const nota = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return (
    <section className={`${styles.root} ${tema === 'claro' ? styles.claro : styles.escuro}`} aria-label={t('title')}>
      {media !== undefined && (
        <div className={styles.media}>
          <span className={styles.mediaRotulo}>{rotuloMedia || t('overall')}</span>
          {media?.nota != null && media.nivel != null ? (
            <>
              <strong className={styles.mediaNivel}>{t('level', { n: media.nivel })}</strong>
              <span className={styles.mediaNota}>{t('score', { score: nota(media.nota) })}</span>
              <small className={styles.muted}>{t('overallHelp', { n: media.competencias })}</small>
            </>
          ) : (
            <small className={styles.muted}>
              {regra
                ? t('overallUnavailable', { min: regra.minCompetencias, desc: regra.minDescritores })
                : t('overallNone')}
            </small>
          )}
        </div>
      )}
      {competencias.map((c) => (
        <details
          key={c.codigo}
          className={`${styles.competencia} ${c.foco ? styles.foco : ''}`}
          open={abrirFoco && !!c.foco}
        >
          <summary>
            <span className={styles.nome}>
              {c.foco && <em className={styles.selo}>{t('focus')}</em>}
              <span>{c.nome}</span>
              <small className={styles.muted}>{t('coverage', { n: c.observados, total: c.total })}</small>
            </span>
            <span className={styles.resultado}>
              {c.nivel != null && c.nota != null ? (
                <>
                  <b>{t('level', { n: c.nivel })}</b>
                  <small>{t('score', { score: nota(c.nota) })}</small>
                </>
              ) : (
                <b className={styles.semNivel}>{c.observados ? t('insufficientShort') : t('notObserved')}</b>
              )}
            </span>
          </summary>
          {!c.suficiente && regra && c.observados > 0 && (
            <p className={styles.aviso}>{t('insufficient', { n: c.observados, min: regra.minDescritores })}</p>
          )}
          {(() => {
            // O que foi observado vem aberto; o que não teve oportunidade fica
            // agrupado e recolhido (a devolutiva ficava metade "não observado").
            const vistos = c.descritores.filter((d) => d.nivel != null || d.descartado || d.evidencias?.length);
            const semOportunidade = c.descritores.filter((d) => !vistos.includes(d));
            const item = (d: DescritorRelatorio) => (
              <li key={d.codigo}>
                <div className={styles.dCabeca}>
                  <span>{d.nome}</span>
                  <span className={d.nivel != null ? styles.dNivel : styles.dSem}>
                    {d.nivel != null ? t('level', { n: d.nivel }) : t('notObservedShort')}
                  </span>
                </div>
                {d.descartado && <p className={styles.aviso}>{t('discarded')}</p>}
                {d.justificativa && <p className={styles.justificativa}>{d.justificativa}</p>}
                {d.evidencias?.map((e, i) => (
                  <blockquote key={`e${i}`}>
                    “{e.texto}”{e.origem && <small>{e.origem}</small>}
                  </blockquote>
                ))}
                {d.oportunidades?.length ? (
                  <p className={styles.muted}>
                    {t('opportunity')}{' '}
                    {d.oportunidades.map((o, i) => (
                      <span key={`o${i}`}>
                        “{o.texto}”{o.origem ? ` (${o.origem})` : ''}
                        {i < d.oportunidades!.length - 1 ? ' · ' : ''}
                      </span>
                    ))}
                  </p>
                ) : null}
                {d.regua && (
                  <details className={styles.regua}>
                    <summary>{t('rubric')}</summary>
                    <ol>
                      {d.regua.map((texto, i) => (
                        <li key={i}>
                          <b>{t('level', { n: i + 1 })}</b> {texto}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </li>
            );
            return (
              <>
                {vistos.length > 0 && <ul className={styles.descritores}>{vistos.map(item)}</ul>}
                {semOportunidade.length > 0 && (
                  <details className={styles.grupoSem}>
                    <summary>{t('notObservedGroup', { n: semOportunidade.length })}</summary>
                    <ul className={styles.descritores}>{semOportunidade.map(item)}</ul>
                  </details>
                )}
              </>
            );
          })()}
        </details>
      ))}
    </section>
  );
}
