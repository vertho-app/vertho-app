'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign } from 'lucide-react';
import { CALLS, MODELS, MODEL_IDS, PRESETS, calcCost } from '@/lib/ia-cost-catalog';

export default function SimuladorCustoPage() {
  const router = useRouter();
  const [nColabs, setNColabs] = useState(1);
  const [models, setModels] = useState(() =>
    Object.fromEntries(CALLS.map(c => [c.id, c.defaultModel]))
  );
  const [preset, setPreset] = useState('atual');

  function aplicarPreset(k) {
    setPreset(k);
    if (k === 'atual') {
      setModels(Object.fromEntries(CALLS.map(c => [c.id, c.defaultModel])));
    } else if (PRESETS[k]) {
      setModels(Object.fromEntries(CALLS.map(c => [c.id, PRESETS[k].model(c)])));
    }
  }

  const totais = useMemo(() => {
    let usd = 0, inTok = 0, outTok = 0;
    const porFase = {};
    for (const call of CALLS) {
      const c = calcCost(call, models[call.id], nColabs);
      if (!c) continue;
      usd += c.usd;
      inTok += c.inTokens;
      outTok += c.outTokens;
      if (!porFase[call.fase]) porFase[call.fase] = { usd: 0, exec: 0 };
      porFase[call.fase].usd += c.usd;
      porFase[call.fase].exec += call.exec * nColabs;
    }
    return { usd, inTok, outTok, porFase };
  }, [models, nColabs]);

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 sm:px-6 min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/admin/dashboard')}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-400" /> Simulador de Custo — IA
          </h1>
          <p className="text-xs text-gray-500">Estimativa de gasto com chamadas de IA por colaborador (ciclo completo).</p>
        </div>
      </div>

      {/* Controles */}
      <div className="grid gap-3 mb-6 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Colaboradores</label>
          <input type="number" min="1" value={nColabs}
            onChange={e => setNColabs(Math.max(1, parseInt(e.target.value || '1')))}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-500" />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:col-span-2">
          <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Preset</label>
          <div className="flex gap-2 flex-wrap">
            {['atual', 'best', 'balanced', 'cheap'].map(k => (
              <button key={k} onClick={() => aplicarPreset(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  preset === k ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
                }`}>
                {k === 'atual' ? 'Config atual' : PRESETS[k]?.label}
              </button>
            ))}
          </div>
          {preset !== 'atual' && PRESETS[preset] && (
            <p className="text-[11px] text-gray-500 mt-2">{PRESETS[preset].desc}</p>
          )}
        </div>
      </div>

      {/* Totais */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 mb-6">
        <div className="flex items-baseline justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">Custo estimado</p>
            <p className="text-4xl font-extrabold text-emerald-300">
              USD {totais.usd.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              {nColabs} colab{nColabs > 1 ? 's' : ''} · ~USD {(totais.usd / nColabs).toFixed(2)} por colab
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              {(totais.inTok / 1_000_000).toFixed(2)}M tokens input
              {' + '}
              {(totais.outTok / 1_000_000).toFixed(2)}M output
            </p>
            <p className="text-[10px] text-gray-500">
              = {((totais.inTok + totais.outTok) / 1_000_000).toFixed(2)}M total
            </p>
          </div>
        </div>

        {/* Por fase */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(totais.porFase).map(([fase, d]) => (
            <div key={fase} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase text-gray-500">{fase}</p>
              <p className="text-sm font-bold text-white">USD {d.usd.toFixed(2)}</p>
              <p className="text-[10px] text-gray-500">{d.exec} chamadas</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela detalhada */}
      <div className="space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Catálogo</h2>
        {CALLS.map(call => {
          const c = calcCost(call, models[call.id], nColabs);
          return (
            <div key={call.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white">{call.nome}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-gray-400">{call.fase}</span>
                    {call.critical && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">crítica</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{call.descricao}</p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    ~{call.inTokens} tok in + {call.outTokens} tok out · × {call.exec} execuções/colab
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={models[call.id]}
                    onChange={e => { setPreset('custom'); setModels({ ...models, [call.id]: e.target.value }); }}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white">
                    {MODEL_IDS.map(id => (
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
        <p className="font-bold text-amber-300">Notas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Estimativas aproximadas. Uso real pode variar ±30% conforme tamanho de histórico, qualidade da régua e respostas do colab.</li>
          <li><b>Tira-Dúvidas</b> é opcional e a estimativa (3 perguntas/semana × 12 sems) pode ser muito maior ou menor.</li>
          <li>Não inclui IA1/IA2/IA3/Cenários B — essas rodam uma vez por empresa, não escalam com colabs.</li>
          <li>Preços de modelos atualizados em nov/2025. Consulte fornecedor pra valores vigentes.</li>
          <li>Simulador de Temporada (teste) custa extra: ~200 chamadas (Haiku pra colab simulado, Sonnet pro mentor) ≈ USD 1-2 por rodada.</li>
        </ul>
      </div>
    </div>
  );
}
