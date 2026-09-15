'use client';
import { useTranslations } from 'next-intl';
import { COMPETENCIAS_PACE } from '@/lib/simulador-vendas/matriz';
import { consolidarMatriz, type AvaliacaoMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';

export default function MatrizPace({ matriz }: { matriz: AvaliacaoMatriz }) {
  const t = useTranslations('SimuladorVendas');
  const resultados = consolidarMatriz(matriz);
  return (
    <section className="mt-6" aria-label={t('matrixTitle')}>
      <h3 className="text-lg font-semibold">{t('matrixTitle')}</h3>
      <p className="text-sm text-slate-300 mt-2 mb-4">{t('matrixHelp')}</p>
      <div className="space-y-3">
        {COMPETENCIAS_PACE.map((c) => {
          const resultado = resultados.find((r) => r.codigo === c.codigo)!;
          return (
            <article key={c.codigo} className="rounded-xl border border-white/10 p-4 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-semibold">{t(`matrix_${c.codigo}`)}</h4>
                <span className="text-sm text-brand-200">
                  {resultado.nivel === null
                    ? t('matrixNotObserved')
                    : t(resultado.observados < resultado.total ? 'matrixPartial' : 'matrixLevel', {
                        level: resultado.nivel,
                      })}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {t('matrixCoverage', {
                  count: resultado.observados,
                  total: resultado.total,
                })}
              </p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">{t('matrixDescriptors')}</summary>
                <ul className="mt-3 space-y-5">
                  {c.descritores.map((d) => {
                    const a = matriz.descritores.find((r) => r.codigo === d.codigo)!;
                    return (
                      <li key={d.codigo} className="border-t border-white/10 pt-3 break-words">
                        <p className="font-medium">
                          {d.nome}{' '}
                          <span className="text-brand-200">
                            · {a.nivel === null ? t('matrixNotObserved') : `N${a.nivel}`}
                          </span>
                        </p>
                        <p className="text-slate-300 mt-1">{a.justificativa}</p>
                        {a.evidencias.map((e, i) => (
                          <figure key={i} className="mt-2 border-l-2 border-brand-400 pl-3">
                            <blockquote className="text-slate-300">{e.citacao}</blockquote>
                            <figcaption className="text-xs text-slate-400 mt-1">
                              {e.origem === 'planejamento'
                                ? t('matrixEvidencePlan')
                                : t('matrixEvidenceTurn', { turn: e.turno! })}
                            </figcaption>
                          </figure>
                        ))}
                        <details className="mt-2 text-xs text-slate-400">
                          <summary className="cursor-pointer">{t('matrixRubric')}</summary>
                          <dl className="mt-2 space-y-2">
                            {([1, 2, 3, 4] as const).map((n) => (
                              <div key={n}>
                                <dt className="font-semibold text-slate-200">N{n}</dt>
                                <dd>{d.niveis[`n${n}`]}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </article>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-4">{t('matrixScoreHelp')}</p>
    </section>
  );
}
