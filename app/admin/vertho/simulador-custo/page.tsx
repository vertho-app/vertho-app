'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, DollarSign, Users, School, FileText, Building2 } from 'lucide-react';
import { CALLS, MODELS, MODEL_IDS, PRESETS, SCALE_LABEL, calcCost } from '@/lib/ia-cost-catalog';
import type { AppLocale } from '@/i18n/routing';

type ScaleType = 'colab' | 'pagina_radar' | 'lead_radar' | 'empresa';

const PRESET_KEYS = ['atual', 'premium', 'balanced', 'cheap'] as const;

export default function SimuladorCustoPage() {
  const router = useRouter();
  const locale = useLocale() as AppLocale;
  const t = useTranslations('AdminCostSimulator');
  const [units, setUnits] = useState<Record<ScaleType, number>>({
    colab: 1,
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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-400" /> {t('title')}
          </h1>
          <p className="text-xs text-gray-500">{t('subtitle')}</p>
        </div>
      </div>

      {/* Inputs de escala */}
      <div className="grid gap-3 mb-4 grid-cols-2 sm:grid-cols-4">
        <ScaleInput icon={<Users size={14} />} label={t('scale.colab.label')} sub={t('scale.colab.sub')} value={units.colab} onChange={v => setUnit('colab', v)} />
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
