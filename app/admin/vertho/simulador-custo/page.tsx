'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, Users, School, FileText, Building2 } from 'lucide-react';
import { CALLS, MODELS, MODEL_IDS, PRESETS, SCALE_LABEL, calcCost } from '@/lib/ia-cost-catalog';

type ScaleType = 'colab' | 'pagina_radar' | 'lead_radar' | 'empresa';

const PRESET_KEYS = ['atual', 'premium', 'balanced', 'cheap'] as const;

export default function SimuladorCustoPage() {
  const router = useRouter();
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
          <p className="text-xs text-gray-500">Estimativa de gasto com chamadas de IA por unidade de escala (colab, escola Radar, lead, empresa). Preços mai/2026.</p>
        </div>
      </div>

      {/* Inputs de escala */}
      <div className="grid gap-3 mb-4 grid-cols-2 sm:grid-cols-4">
        <ScaleInput icon={<Users size={14} />} label="Colaboradores" sub="ciclo Mentor IA" value={units.colab} onChange={v => setUnit('colab', v)} />
        <ScaleInput icon={<School size={14} />} label="Páginas Radar" sub="escolas/municípios únicos" value={units.pagina_radar} onChange={v => setUnit('pagina_radar', v)} />
        <ScaleInput icon={<FileText size={14} />} label="Leads Radar" sub="PDFs gerados" value={units.lead_radar} onChange={v => setUnit('lead_radar', v)} />
        <ScaleInput icon={<Building2 size={14} />} label="Empresas (setup)" sub="one-time" value={units.empresa} onChange={v => setUnit('empresa', v)} />
      </div>

      {/* Preset */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-6">
        <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-1">Preset</label>
        <div className="flex gap-2 flex-wrap">
          {PRESET_KEYS.map(k => (
            <button key={k} onClick={() => aplicarPreset(k)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                preset === k ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300' : 'border-white/10 text-gray-400 hover:text-white'
              }`}>
              {k === 'atual' ? 'Config atual' : PRESETS[k as keyof typeof PRESETS]?.label}
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
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">Custo estimado</p>
            <p className="text-4xl font-extrabold text-emerald-300">
              USD {totais.usd.toFixed(2)}
            </p>
            {nColabs > 0 && (
              <p className="text-xs text-gray-400">
                {nColabs} colab{nColabs > 1 ? 's' : ''} · ~USD {(totais.porScale.colab.usd / Math.max(1, nColabs)).toFixed(2)} por colab (Mentor IA)
              </p>
            )}
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

        {/* Breakdown por escala */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(totais.porScale) as ScaleType[]).map(s => (
            <div key={s} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase text-gray-500">{SCALE_LABEL[s]}</p>
              <p className="text-sm font-bold text-white">USD {totais.porScale[s].usd.toFixed(2)}</p>
              <p className="text-[10px] text-gray-500">× {units[s]} unid.</p>
            </div>
          ))}
        </div>

        {/* Por fase */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">crítica</span>
                    )}
                    {call.opcional && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-400">opcional</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">{call.descricao}</p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    ~{call.inTokens} tok in + {call.outTokens} tok out · × {call.exec} execuções/unid.
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
        <p className="font-bold text-amber-300">Notas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Estimativas aproximadas (±30%). Uso real varia conforme tamanho de histórico, qualidade da régua, respostas do colab.</li>
          <li><b>Escalas distintas</b>: Mentor IA escala por colab; Radar escala por escola/município único analisado (cache por dadosHash) e por lead PDF; Setup é one-time por empresa. Use os 4 inputs no topo pra simular cada cenário.</li>
          <li><b>Grounding RAG</b> (Voyage embeddings + kb_search_hybrid) está incluso nos <b>inTokens</b> das chamadas afetadas (Tira-Dúvidas, Evidências socrático, Missão feedback): +800 tok/call de contexto da knowledge_base. Se a base estiver vazia, não há grounding — subtraia ~$0.30/colab/ciclo.</li>
          <li><b>Embedding Voyage</b> (fase RAG) roda ~138 queries por colab × 100 tokens × $0.18/1M ≈ $0.0025/colab. Custo irrisório mas registrado pra completude.</li>
          <li><b>Tira-Dúvidas</b> é opcional e a estimativa (3 perguntas/semana × 12 sems) pode ser muito maior ou menor.</li>
          <li><b>PDI</b> e <b>Relatório Individual</b> marcados como "opcional" — só rodam se admin clicar; tela Temporada Concluída + PDF já cobrem o caso padrão.</li>
          <li><b>Evolution Report</b> (fim sem 14) é consolidação programática dos JSONs — não usa IA, fora do catálogo.</li>
          <li><b>Relatório Gestor</b> e <b>Relatório RH</b> (fase 5) usam IA + grounding, mas rodam 1×/gestor e 1×/empresa — fora do modelo per-colab. Estimativa: ~$0.10/gestor e ~$0.20/empresa/ciclo.</li>
          <li><b>Setup Empresa</b> (IA1/IA2/IA3/Cenários B/PPP/Tagging) roda one-time — multiplique pelo nº de empresas que vão entrar no ciclo, não por colab.</li>
          <li><b>Radar narrativa</b> tem cache forte por <code>dadosHash</code> — uma escola/município gera 1 análise até os dados oficiais mudarem. Bot crawlers nunca disparam IA (só leem cache).</li>
          <li><b>Radar proposta PDF</b> roda 1× por lead via worker QStash. Cache reutiliza se o mesmo escopo já foi analisado.</li>
          <li>Scorer sem 14 e check ficaram caros depois da triangulação (cenário + régua + acumulada estruturada + evidências brutas = ~8k tokens in).</li>
          <li>Preços de modelos atualizados em <b>mai/2026</b>. Consulte fornecedor pra valores vigentes.</li>
          <li>Simulador de Temporada (teste) custa extra: ~200 chamadas (Haiku pra colab simulado, Sonnet pro mentor) ≈ USD 1-2 por rodada.</li>
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
