'use client';
import type { Saidas } from '@/lib/simulador-vendas/schema';
import { nivelDaNotaPace } from '@/lib/simulador-vendas/nota';
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
  modo = 'participante',
}: {
  relatorio: Saidas['gerente'];
  versao?: string;
  /**
   * `equipe`: quem lê é o gestor ou o RH, não a pessoa que treinou. Até
   * 27/09/2026 a gestão lia "Sua devolutiva PACE", "seu PDI", "seu plano"
   * sobre o treino de outra pessoa (V-10).
   */
  modo?: 'participante' | 'equipe';
}) {
  // Aviso de "não altera" comum aos três simuladores (R-119, 03/10/2026).
  const tRelatorio = useTranslations('SimuladoresRelatorio');
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const equipe = modo === 'equipe';
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
          // Na visão da equipe a evidência do plano chega sem o texto (R-42).
          reservada: () => t('matrixEvidencePlanReserved'),
        },
        { P: r.Preparacao, A: r.Analise, C: r.Cocriacao, E: r.Engajamento },
        r.regraCobertura,
      )
    : null;
  // Só a primeira prioritária ganha o selo: versões antigas marcavam várias.
  const prioridade = r.Recomendacoes.findIndex((item) => item.prioritaria);
  return (
    <section aria-label={t('report')}>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="text-xl">{t(equipe ? 'reportTitleTeam' : 'reportTitle')}</h2>
        {!matriz && (
          <span className="text-3xl tabular-nums">
            {nivelDaNotaPace(r.Media) != null ? t('evolutionLevel', { n: nivelDaNotaPace(r.Media) }) : '\u2014'}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-300 leading-relaxed mb-5">{r.Resumo}</p>
      {/* V-11 (27/09/2026): a média e os níveis vêm logo depois do resumo. No
          celular a média geral só aparecia a cerca de 1.260 px, depois das
          recomendações e do resultado da negociação. */}
      {matriz ? (
        <>
          <p className="text-xs text-slate-400 mb-3">{t(equipe ? 'matrixScaleHelpTeam' : 'matrixScaleHelp')}</p>
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
                    {nivelDaNotaPace(r[p]) != null ? t('evolutionLevel', { n: nivelDaNotaPace(r[p]) }) : '\u2014'}
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {r[detalhe]}
                </p>
              </article>
            ))}
          </div>
        </>
      )}
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
      {/* Rotulado: "Resultado inconclusivo" solto, em negrito, acima da média
          geral, parecia o veredito do treino (V-11). */}
      <div className="mt-6 border-t border-white/10 pt-4 text-sm text-slate-300">
        <p className="text-xs uppercase tracking-wider text-slate-400">
          {t('negotiationResult')}
        </p>
        <p className="font-semibold text-white mt-1">
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
      <p className="text-xs text-slate-400 mt-6">{tRelatorio(equipe ? 'naoAlteraEquipe' : 'naoAltera')}</p>
      {documental && (
        <p className="text-xs text-slate-400 mt-2">{t(equipe ? 'documentSourcesTeam' : 'documentSources')}</p>
      )}
    </section>
  );
}
