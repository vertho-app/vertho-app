'use client';
import type { Saidas } from '@/lib/simulador-vendas/schema';
import { useLocale, useTranslations } from 'next-intl';
const pilares = [
  ['P', 'preparation', 'Preparacao'],
  ['A', 'analysis', 'Analise'],
  ['C', 'cocreation', 'Cocriacao'],
  ['E', 'engagement', 'Engajamento'],
] as const;
export default function Relatorio({
  relatorio: r,
  versao,
}: {
  relatorio: Saidas['gerente'];
  versao?: string;
}) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  return (
    <section aria-label={t('report')}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-xl">{t('reportTitle')}</h2>
        <span className="text-3xl tabular-nums">
          {r.Media.toLocaleString(locale)}
          <small className="text-sm text-slate-400"> / 10</small>
        </span>
      </div>
      <p className="text-sm text-slate-300 leading-relaxed mb-5">{r.Resumo}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {pilares.map(([p, nome, detalhe]) => (
          <article key={p} className="border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t(nome)}</h3>
              <span className="tabular-nums text-brand-300">{r[p].toLocaleString(locale)}</span>
            </div>
            <meter
              className="w-full my-2"
              min={0.5}
              max={10}
              value={r[p]}
              aria-label={t('scoreLabel', { name: t(nome) })}
            />
            <p className="text-sm text-slate-300 leading-relaxed">{r[detalhe]}</p>
          </article>
        ))}
      </div>
      <h3 className="font-semibold mt-6 mb-2">{t('recommendations')}</h3>
      <ol className="space-y-3 list-decimal pl-5">
        {r.Recomendacoes.map((item, i) => (
          <li key={i} className="text-sm text-slate-300">
            <strong className="text-white">{item.titulo}</strong>
            <p>{item.descricao}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-300">
        <p className="font-semibold text-white">{t(`result_${r.Resultado}`)}</p>
        {r.Preco_final && <p>{r.Preco_final}</p>}
        {r.Compromissos_obtidos && <p className="mt-1">{r.Compromissos_obtidos}</p>}
      </div>
      {[...r.Beneficios_ocultos_descobertos, ...r.Objecoes_profundas_descobertas].length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer">{t('discoveries')}</summary>
          <ul className="mt-3 space-y-3">
            {[...r.Beneficios_ocultos_descobertos, ...r.Objecoes_profundas_descobertas].map((d, i) => (
              <li key={i}>
                <p>
                  {d.nome} · {t('turn', { n: d.turno })}
                </p>
                <blockquote className="border-l-2 border-brand-400 pl-3 mt-1 text-slate-300">
                  {d.citacao_vendedor}
                </blockquote>
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.Violacoes.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">{t('conduct')}</summary>
          {r.Violacoes.map((v, i) => (
            <p key={i} className="mt-2 text-amber-200">
              {t('turn', { n: v.turno })} · {v.motivo}{' '}
              {t('deduction', {
                pillar: v.pilar_penalizado,
                value: v.reducao_aplicada.toLocaleString(locale),
              })}
            </p>
          ))}
        </details>
      )}
      <p className="text-xs text-slate-400 mt-6">{t('disclaimer')}</p>
      <p className="text-xs text-slate-400 mt-2">{t('version', { version: versao || 'pace-1' })}</p>
    </section>
  );
}
