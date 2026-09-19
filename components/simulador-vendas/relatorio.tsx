'use client';
import type { Saidas } from '@/lib/simulador-vendas/schema';
import { formatarNotaPace } from '@/lib/simulador-vendas/nota';
import { useLocale, useTranslations } from 'next-intl';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import { relatorioPacePublico } from '@/lib/simulador-vendas/escala';
import {
  MANUAL_PACE,
  usaFontesDocumentais,
} from '@/lib/simulador-vendas/fontes';
import { competenciasDaMatriz, nomeDoDescritor } from './relatorio-matriz';
const pilares = [
  ['P', 'preparation', 'Preparacao'],
  ['A', 'analysis', 'Analise'],
  ['C', 'cocreation', 'Cocriacao'],
  ['E', 'engagement', 'Engajamento'],
] as const;
/**
 * Devolutiva do vendas. Treino com matriz (pace-4 em diante) usa o relatório
 * por competência comum aos três simuladores (18/09/2026): nível por extenso,
 * regra de cobertura dita em palavras e comportamentos com citação. Treino
 * anterior à matriz mantém os cartões por pilar, lido como foi gerado.
 */
export default function Relatorio({
  relatorio: original,
  versao,
}: {
  relatorio: Saidas['gerente'];
  versao?: string;
}) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const r = relatorioPacePublico(original, versao)!;
  const documental = usaFontesDocumentais(versao);
  const matriz = r.Matriz
    ? competenciasDaMatriz(
        r.Matriz,
        versao,
        {
          nome: (codigo) => t(`matrix_${codigo}`),
          origem: (e) =>
            e.origem === 'planejamento'
              ? t('matrixEvidencePlan')
              : t('matrixEvidenceTurn', { turn: e.turno ?? 0 }),
        },
        { P: r.Preparacao, A: r.Analise, C: r.Cocriacao, E: r.Engajamento },
      )
    : null;
  // Só a primeira prioritária ganha o selo: versões antigas marcavam várias.
  const prioridade = r.Recomendacoes.findIndex((item) => item.prioritaria);
  return (
    <section aria-label={t('report')}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-xl">{t('reportTitle')}</h2>
        {!matriz && (
          <span className="text-3xl tabular-nums">
            {formatarNotaPace(r.Media, locale)}
            <small className="text-sm text-slate-400"> / 4</small>
          </span>
        )}
      </div>
      <p className="text-sm text-slate-300 leading-relaxed mb-5">{r.Resumo}</p>
      <h3 className="font-semibold mt-6 mb-2">{t('recommendations')}</h3>
      <ol className="space-y-3 list-decimal pl-5">
        {r.Recomendacoes.map((item, i) => (
          <li key={i} className="text-sm text-slate-300">
            {i === prioridade && (
              <span className="block text-xs font-semibold uppercase tracking-wider text-brand-200 mb-1">
                {t('priority')}
              </span>
            )}
            <strong className="text-white">{item.titulo}</strong>
            <p>{item.descricao}</p>
            {documental && 'descritor' in item && (
              <p className="text-xs text-slate-400 mt-1">
                {t('documentReference', {
                  descriptor: nomeDoDescritor(item.descritor),
                  section: MANUAL_PACE.trechos[item.referencia_manual].secao,
                })}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-300">
        <p className="font-semibold text-white">
          {t(
            documental && r.Resultado === 'fechou_aceitavel'
              ? 'documentAgreement'
              : `result_${r.Resultado}`,
          )}
        </p>
        {r.Preco_final && <p>{r.Preco_final}</p>}
        {r.Compromissos_obtidos && (
          <p className="mt-1">{r.Compromissos_obtidos}</p>
        )}
      </div>
      {matriz ? (
        <>
          <p className="text-xs text-slate-400 mb-3">{t('matrixScaleHelp')}</p>
          <RelatorioCompetencias
            competencias={matriz.competencias}
            media={matriz.media}
            regra={matriz.regra}
            tema="escuro"
            acento="var(--pace-accent)"
          />
        </>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-4">{t('legacyScaleHelp')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {pilares.map(([p, nome, detalhe]) => (
              <article
                key={p}
                className="border border-white/10 rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{t(nome)}</h3>
                  <span className="tabular-nums text-brand-300">
                    {formatarNotaPace(r[p], locale)}
                  </span>
                </div>
                {r[p] !== null && (
                  <meter
                    className="w-full my-2"
                    min={1}
                    max={4}
                    value={r[p]!}
                    aria-label={t('scoreLabel', { name: t(nome) })}
                  />
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                  {r[detalhe]}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
      {[
        ...r.Beneficios_ocultos_descobertos,
        ...r.Objecoes_profundas_descobertas,
      ].length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer">{t('discoveries')}</summary>
          <ul className="mt-3 space-y-3">
            {[
              ...r.Beneficios_ocultos_descobertos,
              ...r.Objecoes_profundas_descobertas,
            ].map((d, i) => (
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
      {documental && (
        <p className="text-xs text-slate-400 mt-2">{t('documentSources')}</p>
      )}
    </section>
  );
}
