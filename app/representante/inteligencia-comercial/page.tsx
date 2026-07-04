'use client';

// Portal do Representante — Inteligência Comercial (assistente de objeções IA, benchmark, materiais).
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lightbulb, Loader2, MessageSquare, Sparkles, BarChart3 } from 'lucide-react';
import { listActiveSalesMaterials } from '@/actions/sales/materials';
import { analisarObjecao } from '@/actions/sales/ai-assistant';
import { getBenchmarkSegmento, type SegmentBenchmark } from '@/actions/sales/benchmark';
import { MATERIAL_CATEGORIES, CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS } from '@/lib/sales/constants';
import { fmtBRL, fmtPercent } from '@/lib/sales/formatters';
import type { SalesMaterial } from '@/lib/sales/types';
import PlaybookSection from '@/components/sales/playbook-section';

type ObjecaoResult = { respostas: string[]; pergunta_de_retorno: string; dica: string };

function Skeleton() {
  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 animate-pulse">
      <div className="h-9 w-72 max-w-full rounded-lg" style={{ background: 'rgba(255,255,255,.05)' }} />
      <div className="h-48 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-36 rounded-2xl" style={{ background: 'rgba(255,255,255,.04)' }} />
        ))}
      </div>
    </div>
  );
}

// ── Assistente de Objeções (IA) ────────────────────────────────────────────
function ObjectionAssistant() {
  const [objecao, setObjecao] = useState('');
  const [segmento, setSegmento] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ObjecaoResult | null>(null);

  async function handleAnalyze() {
    if (objecao.trim().length < 5) {
      toast.error('Descreva a objeção do cliente');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await analisarObjecao(objecao.trim(), segmento || null);
      if (!r.success) {
        toast.error(r.error || 'Falha ao analisar a objeção');
        return;
      }
      setResult(r.data as ObjecaoResult);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao analisar a objeção');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="rounded-2xl p-4 md:p-5"
      style={{ background: 'rgba(52,197,204,.05)', border: '1px solid rgba(52,197,204,.2)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,197,204,.12)', color: '#34c5cc' }}>
          <MessageSquare size={16} />
        </span>
        <h2 className="text-sm font-bold text-white">Assistente de Objeções (IA)</h2>
      </div>
      <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,.55)' }}>
        Cole a objeção que o cliente levantou e receba formas de responder, uma pergunta de retorno e uma dica de postura.
      </p>

      <div className="flex flex-col gap-3">
        <textarea
          value={objecao}
          onChange={(e) => setObjecao(e.target.value)}
          placeholder="Cole a objeção do cliente… (ex.: “Está caro e já temos treinamentos internos”)"
          rows={3}
          className="w-full rounded-xl px-3 py-2 text-sm text-white resize-y placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)' }}
          >
            <option value="">Segmento (opcional)</option>
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</option>
            ))}
          </select>
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analisando…' : 'Analisar (IA)'}
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,.45)' }}>
          A IA está preparando respostas ancoradas no playbook. Isso costuma levar alguns segundos.
        </p>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'rgba(255,255,255,.5)' }}>
              Formas de responder
            </p>
            <ol className="flex flex-col gap-2">
              {(result.respostas || []).map((r, i) => (
                <li key={i} className="flex gap-2 text-sm text-white/90 leading-relaxed">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold" style={{ background: 'rgba(52,197,204,.12)', color: '#34c5cc' }}>
                    {i + 1}
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>

          {result.pergunta_de_retorno && (
            <div className="rounded-xl p-3" style={{ background: 'rgba(52,197,204,.08)', border: '1px solid rgba(52,197,204,.25)' }}>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#34c5cc' }}>
                Pergunta de retorno
              </p>
              <p className="text-sm text-white/90 leading-relaxed">{result.pergunta_de_retorno}</p>
            </div>
          )}

          {result.dica && (
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,.6)' }}>
              <span className="font-bold text-white/70">Dica: </span>{result.dica}
            </p>
          )}

          <p className="text-[11px] italic" style={{ color: 'rgba(255,255,255,.4)' }}>
            Gerado por IA — revise antes de usar.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Benchmark por segmento ──────────────────────────────────────────────────
function BenchmarkSection() {
  const [rows, setRows] = useState<SegmentBenchmark[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getBenchmarkSegmento('meu')
      .then((res) => {
        if (!alive) return;
        if (res.success) setRows(res.rows);
        else setError((res as any).error || 'Falha ao carregar o benchmark');
      })
      .catch((e) => { if (alive) setError(e?.message || 'Falha ao carregar o benchmark'); });
    return () => { alive = false; };
  }, []);

  const segLabel = (seg: string) => CUSTOMER_TYPE_LABELS[seg] || (seg === 'sem_segmento' ? 'Sem segmento' : seg);

  return (
    <section
      className="rounded-2xl p-4 md:p-5"
      style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}>
          <BarChart3 size={16} />
        </span>
        <h2 className="text-sm font-bold text-white">Benchmark por segmento</h2>
      </div>
      <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,.55)' }}>
        Seus números por segmento — ancore expectativa e priorização.
      </p>

      {error ? (
        <p className="text-xs" style={{ color: 'rgba(239,68,68,.9)' }}>{error}</p>
      ) : !rows ? (
        <div className="flex items-center gap-2 text-xs py-4" style={{ color: 'rgba(255,255,255,.5)' }}>
          <Loader2 size={14} className="animate-spin" /> Carregando benchmark…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs leading-relaxed py-2" style={{ color: 'rgba(255,255,255,.55)' }}>
          Ainda sem histórico suficiente — feche oportunidades para ver seu benchmark.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.45)' }}>
                <th className="text-left font-bold py-2 pr-3">Segmento</th>
                <th className="text-right font-bold py-2 px-3">Ganhas</th>
                <th className="text-right font-bold py-2 px-3">Perdidas</th>
                <th className="text-right font-bold py-2 px-3">Em aberto</th>
                <th className="text-right font-bold py-2 px-3">Conversão</th>
                <th className="text-right font-bold py-2 px-3">Ticket médio</th>
                <th className="text-right font-bold py-2 pl-3">Ciclo médio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.segmento} className="border-t" style={{ borderColor: 'rgba(255,255,255,.07)' }}>
                  <td className="text-left py-2.5 pr-3 font-semibold text-white">{segLabel(r.segmento)}</td>
                  <td className="text-right py-2.5 px-3 text-emerald-400 font-semibold">{r.ganhas}</td>
                  <td className="text-right py-2.5 px-3 text-red-400">{r.perdidas}</td>
                  <td className="text-right py-2.5 px-3 text-white/80">{r.emAberto}</td>
                  <td className="text-right py-2.5 px-3 text-white/90 font-semibold">
                    {r.conversao == null ? '—' : fmtPercent(r.conversao)}
                  </td>
                  <td className="text-right py-2.5 px-3 text-white/80">{fmtBRL(r.ticketMedio)}</td>
                  <td className="text-right py-2.5 pl-3 text-white/80">
                    {r.cicloMedioDias == null ? '—' : `${r.cicloMedioDias}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function InteligenciaComercialPage() {
  const [materials, setMaterials] = useState<SalesMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listActiveSalesMaterials()
      .then((res) => {
        if (!alive) return;
        if (res.success) setMaterials(res.data || []);
        else setError((res as any).error || 'Falha ao carregar os materiais');
      })
      .catch((e) => { if (alive) setError(e?.message || 'Falha ao carregar os materiais'); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.3)' }}>
          <p className="text-sm font-bold text-white">Não foi possível carregar os materiais</p>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,.6)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!materials) return <Skeleton />;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Inteligência Comercial</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>
          Materiais, playbooks, respostas a objeções e cases para acelerar suas conversas comerciais.
        </p>
      </div>

      <ObjectionAssistant />
      <BenchmarkSection />

      {materials.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center flex flex-col items-center gap-3"
          style={{ background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)' }}
        >
          <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(52,197,204,.1)', color: '#34c5cc' }}>
            <Lightbulb size={18} />
          </span>
          <p className="text-sm font-bold text-white">Materiais em preparação</p>
          <p className="text-xs max-w-sm leading-relaxed" style={{ color: 'rgba(255,255,255,.55)' }}>
            A Vertho está publicando os materiais do canal. Assim que estiverem disponíveis, eles aparecem aqui.
          </p>
        </div>
      ) : (
        MATERIAL_CATEGORIES.map((category) => (
          <PlaybookSection
            key={category}
            category={category}
            materials={materials.filter((m) => m.category === category)}
          />
        ))
      )}
    </div>
  );
}
