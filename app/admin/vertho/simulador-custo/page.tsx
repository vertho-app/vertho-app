'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { DollarSign, Users, School, FileText, Building2, Clapperboard, UploadCloud, Activity, RefreshCw } from 'lucide-react';
import BackButton from '@/components/back-button';
import { CALLS, MODELS, MODEL_IDS, PRESETS, SCALE_LABEL, calcCost } from '@/lib/ia-cost-catalog';
import { JornadasPanel, InfraPanel } from './paineis-custo';
import { getUsoRealIA, getCoberturaCatalogo, type UsoRealLinha, type CoberturaCatalogo } from '@/actions/ia-uso';
import type { AppLocale } from '@/i18n/routing';

type ScaleType = 'colab' | 'conteudo' | 'extracao' | 'video_gerado' | 'pagina_radar' | 'lead_radar' | 'empresa';

const PRESET_KEYS = ['atual', 'premium', 'balanced', 'cheap'] as const;

export default function SimuladorCustoPage() {
  const locale = useLocale() as AppLocale;
  const t = useTranslations('AdminCostSimulator');
  const [units, setUnits] = useState<Record<ScaleType, number>>({
    colab: 1,
    conteudo: 10,
    extracao: 0,
    video_gerado: 0,
    pagina_radar: 100,
    lead_radar: 5,
    empresa: 1,
  });
  const [models, setModels] = useState(() =>
    Object.fromEntries(CALLS.map(c => [c.id, c.defaultModel]))
  );
  const [preset, setPreset] = useState<string>('atual');

  function aplicarPreset(k: string) {
    setPreset(k);
    if (k === 'atual') {
      setModels(Object.fromEntries(CALLS.map(c => [c.id, c.defaultModel])));
    } else if (PRESETS[k as keyof typeof PRESETS]) {
      setModels(Object.fromEntries(CALLS.map(c => [c.id, PRESETS[k as keyof typeof PRESETS].model(c)])));
    }
  }

  function setUnit(t: ScaleType, v: number) {
    setUnits(u => ({ ...u, [t]: Math.max(0, v) }));
  }

  const totais = useMemo(() => {
    let usd = 0, inTok = 0, outTok = 0;
    const porFase: Record<string, { usd: number; exec: number }> = {};
    const porScale: Record<ScaleType, { usd: number }> = {
      colab: { usd: 0 },
      conteudo: { usd: 0 },
      extracao: { usd: 0 },
      video_gerado: { usd: 0 },
      pagina_radar: { usd: 0 },
      lead_radar: { usd: 0 },
      empresa: { usd: 0 },
    };
    for (const call of CALLS) {
      const u = units[call.scaleType as ScaleType] ?? 0;
      const c = calcCost(call, models[call.id], u);
      if (!c) continue;
      usd += c.usd;
      inTok += c.inTokens;
      outTok += c.outTokens;
      if (!porFase[call.fase]) porFase[call.fase] = { usd: 0, exec: 0 };
      porFase[call.fase].usd += c.usd;
      porFase[call.fase].exec += call.exec * u;
      porScale[call.scaleType as ScaleType].usd += c.usd;
    }
    return { usd, inTok, outTok, porFase, porScale };
  }, [models, units]);

  const nColabs = units.colab;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-full">
      <BackButton href="/admin/dashboard" />
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Inputs de escala */}
      <div className="grid gap-3 mb-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        <ScaleInput icon={<Users size={14} />} label={t('scale.colab.label')} sub={t('scale.colab.sub')} value={units.colab} onChange={v => setUnit('colab', v)} />
        <ScaleInput icon={<FileText size={14} />} label={t('scale.conteudo.label')} sub={t('scale.conteudo.sub')} value={units.conteudo} onChange={v => setUnit('conteudo', v)} />
        <ScaleInput icon={<UploadCloud size={14} />} label={t('scale.extracao.label')} sub={t('scale.extracao.sub')} value={units.extracao} onChange={v => setUnit('extracao', v)} />
        <ScaleInput icon={<Clapperboard size={14} />} label={t('scale.video_gerado.label')} sub={t('scale.video_gerado.sub')} value={units.video_gerado} onChange={v => setUnit('video_gerado', v)} />
        <ScaleInput icon={<School size={14} />} label={t('scale.pagina_radar.label')} sub={t('scale.pagina_radar.sub')} value={units.pagina_radar} onChange={v => setUnit('pagina_radar', v)} />
        <ScaleInput icon={<FileText size={14} />} label={t('scale.lead_radar.label')} sub={t('scale.lead_radar.sub')} value={units.lead_radar} onChange={v => setUnit('lead_radar', v)} />
        <ScaleInput icon={<Building2 size={14} />} label={t('scale.empresa.label')} sub={t('scale.empresa.sub')} value={units.empresa} onChange={v => setUnit('empresa', v)} />
      </div>

      {/* Preset */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-6">
        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">{t('preset.label')}</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_KEYS.map(k => (
            <button key={k} onClick={() => aplicarPreset(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                preset === k ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
              }`}>
              {k === 'atual' ? t('preset.current') : PRESETS[k as keyof typeof PRESETS]?.label}
            </button>
          ))}
        </div>
        {preset !== 'atual' && PRESETS[preset as keyof typeof PRESETS] && (
          <p className="text-[11px] text-gray-500 mt-2">{PRESETS[preset as keyof typeof PRESETS].desc}</p>
        )}
      </div>

      {/* Totais */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-6">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">{t('totals.estimatedCost')}</p>
            <p className="text-4xl font-extrabold text-emerald-300">
              USD {totais.usd.toFixed(2)}
            </p>
            {nColabs > 0 && (
              <p className="text-xs text-gray-400">
                {t('totals.perCollaborator', { count: nColabs, value: (totais.porScale.colab.usd / Math.max(1, nColabs)).toFixed(2) })}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              {t('totals.tokens', { input: (totais.inTok / 1_000_000).toFixed(2), output: (totais.outTok / 1_000_000).toFixed(2) })}
            </p>
            <p className="text-[10px] text-gray-500">
              {t('totals.totalTokens', { total: ((totais.inTok + totais.outTok) / 1_000_000).toFixed(2) })}
            </p>
          </div>
        </div>

        {/* Breakdown por escala */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(totais.porScale) as ScaleType[]).map(s => (
            <div key={s} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase text-gray-500">{SCALE_LABEL[s]}</p>
              <p className="text-sm font-bold text-white">USD {totais.porScale[s].usd.toFixed(2)}</p>
              <p className="text-[10px] text-gray-500">{t('totals.units', { count: units[s] })}</p>
            </div>
          ))}
        </div>

        {/* Por fase */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(totais.porFase).map(([fase, d]) => (
            <div key={fase} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase text-gray-500">{fase}</p>
              <p className="text-sm font-bold text-white">USD {d.usd.toFixed(2)}</p>
              <p className="text-[10px] text-gray-500">{t('totals.calls', { count: d.exec })}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Custo por jornada — o mesmo catálogo lido pelas dimensões de cada modo */}
      <JornadasPanel locale={locale} preset={preset} nColabs={nColabs} />

      {/* Real medido (ledger) */}
      <RealPanel locale={locale} />

      {/* Infra fixa da plataforma */}
      <InfraPanel locale={locale} />

      {/* Tabela detalhada */}
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-2">{t('catalog.title')}</h2>
        {CALLS.map(call => {
          const u = units[call.scaleType as ScaleType] ?? 0;
          const c = calcCost(call, models[call.id], u);
          return (
            <div key={call.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{call.nome}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-400">{call.fase}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300">{SCALE_LABEL[call.scaleType as ScaleType]}</span>
                    {call.critical && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{t('catalog.critical')}</span>
                    )}
                    {call.opcional && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400">{t('catalog.optional')}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{call.descricao}</p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    {t('catalog.tokenEstimate', {
                      input: call.inTokens.toLocaleString(locale),
                      output: call.outTokens.toLocaleString(locale),
                      executions: call.exec.toLocaleString(locale),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={models[call.id]}
                    onChange={e => { setPreset('custom'); setModels({ ...models, [call.id]: e.target.value }); }}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white">
                    {MODEL_IDS
                      .filter(id => call.fase === 'RAG'
                        ? id.startsWith('voyage')
                        : !id.startsWith('voyage'))
                      .map(id => (
                        <option key={id} value={id} className="bg-[#0d1426]">{MODELS[id].label}</option>
                      ))}
                  </select>
                  <div className="text-right min-w-[80px]">
                    <p className="text-sm font-bold text-emerald-300">USD {(c?.usd || 0).toFixed(3)}</p>
                    <p className="text-[10px] text-gray-500">
                      {((c?.totalTokens || 0) / 1000).toFixed(1)}k tok
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-gray-300 space-y-2">
        <p className="font-bold text-amber-300">{t('notes.title')}</p>
        <ul className="list-disc pl-5 space-y-1">
          {t.raw('notes.items').map((item: string, index: number) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const WINDOWS = [7, 30, 90] as const;

/**
 * Estimativa do catálogo por CHAMADA, indexada pela `taskKey` que liga o item de
 * custo à tarefa declarada em `lib/ai-tasks.ts` (que é o que o ledger etiqueta).
 *
 * Por chamada, e não por ciclo, porque é a única comparação que fecha: o `exec`
 * do catálogo é quantas vezes a chamada roda numa jornada inteira, e a janela do
 * ledger é de dias. Dividir por `exec` isola o que a estimativa de tokens diz que
 * UMA chamada custa — que é o que o real mede.
 *
 * Uma taskKey pode ter mais de uma linha de catálogo (as três extrações de chat
 * caem em `temporada_extracao`): nesse caso vale a média.
 */
function estimativaPorTask() {
  const acc: Record<string, { usd: number; n: number }> = {};
  for (const call of CALLS) {
    const key = (call as any).taskKey;
    if (!key) continue;
    const c = calcCost(call, (call as any).defaultModel, 1);
    if (!c || !call.exec) continue;
    if (!acc[key]) acc[key] = { usd: 0, n: 0 };
    acc[key].usd += c.usd / call.exec;
    acc[key].n += 1;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc)) out[k] = v.usd / v.n;
  return out;
}

function RealPanel({ locale }: { locale: AppLocale }) {
  const t = useTranslations('AdminCostSimulator');
  const [dias, setDias] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<UsoRealLinha[] | null>(null);
  const [cobertura, setCobertura] = useState<CoberturaCatalogo | null>(null);

  const estimado = useMemo(() => estimativaPorTask(), []);

  const carregar = useCallback(async (d: number) => {
    setLoading(true);
    setErro(null);
    try {
      const [r, cob] = await Promise.all([getUsoRealIA(d), getCoberturaCatalogo()]);
      if ('erro' in r) { setErro(r.erro); setLinhas(null); }
      else { setLinhas(r.linhas); }
      setCobertura(cob);
    } catch (e: any) {
      setErro(e?.message || 'erro');
      setLinhas(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(dias); }, [dias, carregar]);

  const tot = useMemo(() => {
    const ls = linhas || [];
    let custo = 0, chamadas = 0, inTok = 0, outTok = 0, cacheR = 0, cacheW = 0, fracPeso = 0;
    for (const l of ls) {
      custo += l.custo_usd;
      chamadas += l.chamadas;
      inTok += l.input_tokens;
      outTok += l.output_tokens;
      cacheR += l.cache_read_tokens;
      cacheW += l.cache_write_tokens;
      fracPeso += l.custo_conhecido_frac * l.chamadas;
    }
    const cacheHit = cacheR + inTok > 0 ? (cacheR / (cacheR + inTok)) * 100 : 0;
    const desconhecidoPct = chamadas > 0 ? (1 - fracPeso / chamadas) * 100 : 0;
    return { custo, chamadas, inTok, outTok, cacheR, cacheW, cacheHit, desconhecidoPct };
  }, [linhas]);

  /**
   * Quanto do gasto REAL da janela caiu em tarefa que o catálogo não estima.
   * O número que interessa é o de DINHEIRO, não o de tarefas: 40 tarefas sem
   * estimativa que não rodaram custam zero, e uma que rodou muito custa a conta.
   */
  const lacuna = useMemo(() => {
    const ls = linhas || [];
    const porFeature: Record<string, { usd: number; chamadas: number }> = {};
    for (const l of ls) {
      if (!porFeature[l.feature]) porFeature[l.feature] = { usd: 0, chamadas: 0 };
      porFeature[l.feature].usd += l.custo_usd;
      porFeature[l.feature].chamadas += l.chamadas;
    }
    const semEstimativa = Object.entries(porFeature)
      .filter(([f]) => f !== 'untagged' && estimado[f] == null)
      .map(([feature, v]) => ({ feature, ...v }))
      .sort((a, b) => b.usd - a.usd);
    const untagged = porFeature['untagged']?.usd || 0;
    const usdSemEstimativa = semEstimativa.reduce((s, x) => s + x.usd, 0);
    const total = tot.custo || 1;
    return {
      semEstimativa,
      untagged,
      pctSemEstimativa: (usdSemEstimativa / total) * 100,
      pctUntagged: (untagged / total) * 100,
    };
  }, [linhas, estimado, tot.custo]);

  const nf = (n: number) => n.toLocaleString(locale);

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-sm font-bold text-cyan-200 flex items-center gap-2">
            <Activity size={16} /> {t('real.heading')}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">{t('real.sub')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-500">{t('real.window')}</span>
          <div className="flex gap-1">
            {WINDOWS.map(w => (
              <button key={w} onClick={() => setDias(w)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  dias === w ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {w}d
              </button>
            ))}
          </div>
          <button onClick={() => carregar(dias)} disabled={loading}
            className="p-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white disabled:opacity-40"
            title={t('real.refresh')}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {erro && <p className="text-xs text-red-300">{t('real.error', { message: erro })}</p>}
      {loading && !linhas && <p className="text-xs text-gray-400">{t('real.loading')}</p>}
      {linhas && linhas.length === 0 && <p className="text-xs text-gray-400">{t('real.empty')}</p>}

      {linhas && linhas.length > 0 && (
        <>
          <div className="flex items-baseline justify-between flex-wrap gap-3 mb-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400">{t('real.totalCost')}</p>
              <p className="text-4xl font-extrabold text-cyan-300">USD {tot.custo.toFixed(2)}</p>
              <p className="text-xs text-gray-400">
                {t('real.calls', { count: nf(tot.chamadas) })} · {t('real.cacheHit', { rate: tot.cacheHit.toFixed(0) })}
              </p>
            </div>
            <p className="text-xs text-gray-400 text-right">
              {(tot.inTok / 1_000_000).toFixed(2)}M in + {(tot.outTok / 1_000_000).toFixed(2)}M out
            </p>
          </div>

          {tot.desconhecidoPct > 0.5 && (
            <p className="text-[11px] text-amber-300 mb-3">
              ⚠ {t('real.unknownCost', { pct: tot.desconhecidoPct.toFixed(0) })}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-500 text-left">
                  <th className="py-1.5 pr-3">{t('real.colFeature')}</th>
                  <th className="py-1.5 pr-3">{t('real.colModel')}</th>
                  <th className="py-1.5 pr-3 text-right">{t('real.colCalls')}</th>
                  <th className="py-1.5 pr-3 text-right">{t('real.colTokens')}</th>
                  <th className="py-1.5 pr-3 text-right">{t('real.colCache')}</th>
                  <th className="py-1.5 pr-3 text-right">USD/cham.</th>
                  <th className="py-1.5 pr-3 text-right">est.</th>
                  <th className="py-1.5 text-right">{t('real.colCost')}</th>
                </tr>
              </thead>
              <tbody className="text-gray-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {linhas.map((l, i) => {
                  const real = l.chamadas > 0 ? l.custo_usd / l.chamadas : 0;
                  const est = estimado[l.feature];
                  // Razão real/estimado só é legível quando as duas pontas existem
                  // e a chamada rodou o bastante para a média significar algo.
                  const razao = est != null && est > 0 && l.chamadas >= 3 ? real / est : null;
                  return (
                    <tr key={`${l.feature}-${l.model}-${i}`} className="border-t border-white/[0.06]">
                      <td className="py-1.5 pr-3 font-medium text-white">
                        {l.feature}
                        {est == null && l.feature !== 'untagged' && (
                          <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-300">sem estimativa</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-gray-400">{l.model}</td>
                      <td className="py-1.5 pr-3 text-right">{nf(l.chamadas)}</td>
                      <td className="py-1.5 pr-3 text-right">{nf(l.input_tokens)} / {nf(l.output_tokens)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">{nf(l.cache_read_tokens)} / {nf(l.cache_write_tokens)}</td>
                      <td className="py-1.5 pr-3 text-right">{real.toFixed(4)}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-500">
                        {est == null ? '—' : est.toFixed(4)}
                        {razao != null && (
                          <span className={`ml-1 ${razao > 1.5 || razao < 0.67 ? 'text-amber-300' : 'text-gray-600'}`}>
                            ({razao.toFixed(1)}×)
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-bold text-cyan-300">{l.custo_usd.toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cobertura: o que o catálogo NÃO estima, medido em dinheiro */}
          <div className="mt-4 pt-3 border-t border-white/10 grid gap-3 sm:grid-cols-3 text-[11px]">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Tarefas com estimativa</p>
              <p className="text-lg font-bold text-white">
                {cobertura ? `${cobertura.tasksComEstimativa} de ${cobertura.tasksDeclaradas}` : '—'}
              </p>
              <p className="text-gray-500">declaradas em ai-tasks.ts</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Gasto sem estimativa</p>
              <p className={`text-lg font-bold ${lacuna.pctSemEstimativa > 20 ? 'text-amber-300' : 'text-white'}`}>
                {lacuna.pctSemEstimativa.toFixed(0)}%
              </p>
              <p className="text-gray-500">da janela, fora o untagged</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-500">Untagged</p>
              <p className={`text-lg font-bold ${lacuna.pctUntagged > 10 ? 'text-amber-300' : 'text-white'}`}>
                {lacuna.pctUntagged.toFixed(0)}%
              </p>
              <p className="text-gray-500">chamada sem taskKey no call-site</p>
            </div>
          </div>

          {lacuna.semEstimativa.length > 0 && (
            <p className="text-[11px] text-gray-400 mt-3">
              <span className="text-amber-300 font-semibold">Rodaram sem estimativa: </span>
              {lacuna.semEstimativa.slice(0, 8).map((x) => `${x.feature} (USD ${x.usd.toFixed(2)})`).join(' · ')}
              {lacuna.semEstimativa.length > 8 && ` · +${lacuna.semEstimativa.length - 8}`}
            </p>
          )}

          <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
            <span className="text-gray-400 font-semibold">Fronteira do ledger:</span> só é medido quem escreve em
            <code className="text-gray-400"> ia_usage_log</code> — o wrapper (<code className="text-gray-400">callAI</code>),
            o TTS (desde 30/08/2026) e o Batch. Render de vídeo, HeyGen, Bunny e embeddings não passam por lá, e a ausência
            deles aqui tem a mesma cara de um zero. Este total é <b>piso</b>, não teto.
          </p>
        </>
      )}
    </div>
  );
}

function ScaleInput({ icon, label, sub, value, onChange }: { icon: React.ReactNode; label: string; sub: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {icon}
        {label}
      </label>
      <input type="number" min="0" value={value}
        onChange={e => onChange(parseInt(e.target.value || '0'))}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500" />
      <p className="text-[9px] text-gray-600 mt-0.5">{sub}</p>
    </div>
  );
}
