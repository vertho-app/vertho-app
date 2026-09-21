'use client';
/**
 * Visão da equipe do simulador de vendas (18/09/2026): quem tem acesso e ainda
 * não começou, o maior nível de cada pessoa por competência e a pesquisa de
 * experiência. A agregação vem pronta do servidor (`lib/simulador-vendas/painel.ts`).
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchAuth } from '@/lib/auth/fetch-auth';
import {
  ASPECTOS_PESQUISA,
  type PainelVendas,
} from '@/lib/simulador-vendas/painel';
import { montarCsv } from '@/lib/simuladores/csv';

const BOM = String.fromCharCode(0xfeff);

export default function PainelEquipe({ empresaId }: { empresaId: string }) {
  const t = useTranslations('SimuladorVendas'),
    locale = useLocale();
  const [dados, setDados] = useState<PainelVendas | null>(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('');
  useEffect(() => {
    let vivo = true;
    setDados(null);
    setErro('');
    fetchAuth(
      '/api/simulador-vendas/gestao?' +
        new URLSearchParams({ empresaId, painel: '1' }),
      {
        cache: 'no-store',
      },
    )
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || t('genericError'));
        return d as PainelVendas;
      })
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : t('genericError'));
      });
    return () => {
      vivo = false;
    };
  }, [empresaId]);
  const nivel = (n: number | null) =>
    n === null ? '—' : t('evolutionLevel', { n });
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale) : '—';
  const media = (v: number | null) =>
    v === null
      ? '—'
      : t('surveyAverage', {
          value: v.toLocaleString(locale, { maximumFractionDigits: 1 }),
        });
  function exportar() {
    if (!dados) return;
    const csv = montarCsv([
      [
        t('participant'),
        t('teamJobTitle'),
        t('teamTrainings'),
        t('teamCompletedShort'),
        t('teamLastTraining'),
        ...dados.competencias.map((c) => t(`matrix_${c.codigo}`)),
      ],
      ...dados.pessoas.map((p) => [
        p.nome,
        p.cargo || '',
        p.treinos,
        p.concluidos,
        p.ultimo ? p.ultimo.slice(0, 10) : '',
        ...p.competencias.map((c) => c.nivelAlcancado ?? ''),
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pace-equipe.csv';
    link.click();
    URL.revokeObjectURL(url);
  }
  const termo = filtro.trim().toLocaleLowerCase(locale);
  const pessoas = dados
    ? dados.pessoas.filter(
        (p) => !termo || p.nome.toLocaleLowerCase(locale).includes(termo),
      )
    : [];
  return (
    <section aria-labelledby="pace-visao-equipe" className="mb-10">
      <h2 id="pace-visao-equipe" className="text-lg mb-1">
        {t('teamOverview')}
      </h2>
      <p className="text-sm text-slate-400 mb-4">{t('teamOverviewHelp')}</p>
      {erro && (
        <p role="alert" className="text-amber-200 my-3">
          {erro}
        </p>
      )}
      {!dados && !erro && (
        <p role="status" className="text-sm text-slate-400">
          {t('loading')}
        </p>
      )}
      {dados && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {(
              [
                ['teamPeople', dados.resumo.pessoas],
                ['teamStarted', dados.resumo.comecaram],
                ['teamCompleted', dados.resumo.concluiram],
                ['teamNotStarted', dados.resumo.naoComecaram],
              ] as const
            ).map(([chave, valor]) => (
              <div
                key={chave}
                className="rounded-xl border border-white/10 p-3 min-w-0"
              >
                <dt className="text-xs text-slate-400">{t(chave)}</dt>
                <dd className="text-2xl tabular-nums">{valor}</dd>
              </div>
            ))}
          </dl>

          <h3 className="font-semibold mb-1">{t('teamCompetencies')}</h3>
          <p className="text-xs text-slate-400 mb-3">
            {t('teamCompetenciesHelp')}
          </p>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-4 font-medium">
                    {t('teamCompetency')}
                  </th>
                  {[1, 2, 3, 4].map((n) => (
                    <th
                      key={n}
                      className="py-2 pr-4 font-medium whitespace-nowrap"
                    >
                      {t('evolutionLevel', { n })}
                    </th>
                  ))}
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">
                    {t('teamNoLevel')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {dados.competencias.map((c) => (
                  <tr key={c.codigo} className="border-b border-white/10">
                    <td className="py-2 pr-4">{t(`matrix_${c.codigo}`)}</td>
                    {c.niveis.map((qtd, i) => (
                      <td key={i} className="py-2 pr-4 tabular-nums">
                        {qtd}
                      </td>
                    ))}
                    <td className="py-2 pr-4 tabular-nums text-slate-400">
                      {c.semNivel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <h3 className="font-semibold">{t('teamPersonTable')}</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                {t('teamFilter')}
                <input
                  type="search"
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                />
              </label>
              <button onClick={exportar} disabled={!dados.pessoas.length}>
                {t('exportPeople')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="py-2 pr-4 font-medium">{t('participant')}</th>
                  <th className="py-2 pr-4 font-medium">
                    {t('teamTrainings')}
                  </th>
                  <th className="py-2 pr-4 font-medium whitespace-nowrap">
                    {t('teamLastTraining')}
                  </th>
                  {dados.competencias.map((c) => (
                    <th
                      key={c.codigo}
                      className="py-2 pr-4 font-medium whitespace-nowrap"
                    >
                      {t(`matrix_${c.codigo}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.id} className="border-b border-white/10 align-top">
                    <td className="py-2 pr-4">
                      {p.nome}
                      {p.cargo && (
                        <small className="block text-slate-400">
                          {p.cargo}
                        </small>
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                      {p.treinos === 0 ? (
                        <span className="text-slate-400">
                          {t('teamNotStartedShort')}
                        </span>
                      ) : (
                        t('teamTrainingsCount', {
                          total: p.treinos,
                          done: p.concluidos,
                        })
                      )}
                      {p.emAndamento && (
                        <small className="block text-slate-400">
                          {t('teamInProgress')}
                        </small>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {data(p.ultimo)}
                    </td>
                    {p.competencias.map((c) => (
                      <td
                        key={c.codigo}
                        className="py-2 pr-4 whitespace-nowrap"
                      >
                        {nivel(c.nivelAlcancado)}
                        {c.subiu && (
                          <small className="block text-emerald-300">
                            {t('evolutionUp')}
                          </small>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details
            className="mb-8"
            open={
              dados.naoComecaram.length > 0 && dados.naoComecaram.length <= 12
            }
          >
            <summary className="cursor-pointer font-semibold">
              {t('teamNotStartedList', { n: dados.naoComecaram.length })}
            </summary>
            {dados.naoComecaram.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {dados.naoComecaram.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-white/10 px-3 py-1 text-sm"
                  >
                    {p.nome}
                    {p.cargo && (
                      <span className="text-slate-400"> · {p.cargo}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                {t('teamNotStartedEmpty')}
              </p>
            )}
          </details>

          <section
            aria-labelledby="pace-pesquisa"
            className="rounded-2xl border border-white/10 p-4"
          >
            <h3 id="pace-pesquisa" className="font-semibold mb-1">
              {t('surveyTitle')}
            </h3>
            <p className="text-xs text-slate-400 mb-3">{t('surveyHelp')}</p>
            <p className="text-sm mb-3">
              {t('surveyResponses', { n: dados.pesquisa.respostas })}
            </p>
            {dados.pesquisa.respostas > 0 && (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
                {ASPECTOS_PESQUISA.map((aspecto) => (
                  <div key={aspecto} className="min-w-0">
                    <dt className="flex justify-between gap-3 text-sm">
                      <span>{t(aspecto)}</span>
                      <span className="tabular-nums text-slate-300">
                        {media(dados.pesquisa.medias[aspecto])}
                      </span>
                    </dt>
                    <dd>
                      {dados.pesquisa.medias[aspecto] !== null && (
                        <meter
                          className="w-full"
                          min={1}
                          max={5}
                          value={dados.pesquisa.medias[aspecto]!}
                          aria-label={t(aspecto)}
                        />
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <h4 className="text-sm font-semibold mb-2">
              {t('surveyComments')}
            </h4>
            {dados.pesquisa.comentarios.length ? (
              <ul className="space-y-3">
                {dados.pesquisa.comentarios.map((c, i) => (
                  <li key={i} className="text-sm">
                    <blockquote className="border-l-2 border-brand-400 pl-3 text-slate-300 whitespace-pre-wrap break-words">
                      {c.texto}
                    </blockquote>
                    <small className="text-slate-400">{data(c.em)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">{t('surveyNoComments')}</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
