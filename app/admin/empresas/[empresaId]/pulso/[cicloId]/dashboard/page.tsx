'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Activity, Users, TrendingUp, RefreshCw, Loader2, Filter } from 'lucide-react';
import { loadPulseDashboard, refreshPulseAggregates, type GroupType, type PulseDashboardData } from '@/actions/pulse/dashboard';
import { loadPulseSignals } from '@/actions/pulse/signals';
import { triangulate, type TriangulationOutput } from '@/lib/pulse/triangulation';
import type { SignalScore } from '@/lib/pulse/signal-scoring';
import { PulseScoreCard } from '@/components/pulse/PulseScoreCard';
import { PulseDimensionChart } from '@/components/pulse/PulseDimensionChart';
import { PulseDeltaTable } from '@/components/pulse/PulseDeltaTable';
import { PulseSignalsCard } from '@/components/pulse/PulseSignalsCard';
import { TriangulationSummary } from '@/components/pulse/TriangulationSummary';
import { RecommendationsList } from '@/components/pulse/RecommendationsList';
import { AnonymityGuardMessage } from '@/components/pulse/AnonymityGuardMessage';

type State =
  | { tag: 'loading' }
  | { tag: 'error'; msg: string }
  | { tag: 'masked'; n: number; threshold: number }
  | { tag: 'ok'; data: PulseDashboardData };

export default function PulseDashboardPage({
  params,
}: { params: Promise<{ empresaId: string; cicloId: string }> }) {
  const { empresaId, cicloId } = use(params);
  const router = useRouter();

  const [state, setState] = useState<State>({ tag: 'loading' });
  const [groupType, setGroupType] = useState<GroupType>('company');
  const [groupKey, setGroupKey] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [signals, setSignals] = useState<SignalScore[] | null>(null);
  const [triang, setTriang] = useState<TriangulationOutput | null>(null);

  async function load() {
    setState({ tag: 'loading' });
    setSignals(null); setTriang(null);
    const r = await loadPulseDashboard(empresaId, cicloId, groupType, groupKey);
    if (r.ok === 'masked') { setState({ tag: 'masked', n: r.n, threshold: r.threshold }); return; }
    if (r.ok === false) { setState({ tag: 'error', msg: r.error }); return; }
    setState({ tag: 'ok', data: r.data });

    // Carrega sinais em paralelo (graceful — sem bloquear UI)
    const sigRes = await loadPulseSignals(empresaId, cicloId, { group_type: groupType, group_key: groupKey });
    if (sigRes.ok === true) {
      setSignals(sigRes.data.signals);
      const tri = triangulate(r.data.dimensions, sigRes.data.signals, { n_t0: r.data.n_t0, n_t2: r.data.n_t2 });
      setTriang(tri);
    } else {
      // Mesmo sem sinais, gera triangulação só com pulso
      const tri = triangulate(r.data.dimensions, [], { n_t0: r.data.n_t0, n_t2: r.data.n_t2 });
      setTriang(tri);
    }
  }

  useEffect(() => { load(); }, [empresaId, cicloId, groupType, groupKey]);

  async function handleRefresh() {
    setRefreshing(true);
    await refreshPulseAggregates();
    await load();
    setRefreshing(false);
  }

  if (state.tag === 'loading') return <div className="flex items-center justify-center h-dvh"><Loader2 size={32} className="animate-spin text-cyan-400" /></div>;

  if (state.tag === 'error') {
    return (
      <div className="max-w-md mx-auto px-5 py-10 text-center">
        <p className="text-sm text-red-400 mb-3">{state.msg}</p>
        <button onClick={handleRefresh} disabled={refreshing}
          className="px-4 py-2 rounded-lg text-[11px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
          {refreshing ? 'Atualizando...' : 'Recalcular agregados'}
        </button>
      </div>
    );
  }

  if (state.tag === 'masked') {
    return (
      <div className="max-w-md mx-auto px-5 py-10">
        <button onClick={() => router.push(`/admin/empresas/${empresaId}/pulso`)}
          className="text-[10px] text-cyan-400 hover:underline mb-4">← Voltar</button>
        <AnonymityGuardMessage n={state.n} threshold={state.threshold} />
      </div>
    );
  }

  const d = state.data;

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 sm:px-6" style={{ minHeight: '100dvh' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/empresas/${empresaId}/pulso`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Activity size={20} className="text-cyan-400" /> {d.ciclo.nome}
            </h1>
            <p className="text-xs text-gray-500">Dashboard agregado · status: {d.ciclo.status}</p>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold text-cyan-400 border border-cyan-400/30 hover:bg-cyan-400/10 transition-all disabled:opacity-50">
          {refreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Atualizar
        </button>
      </div>

      {/* Filtros de grupo */}
      <div className="mb-5 rounded-xl border border-white/[0.06] p-4" style={{ background: '#0F2A4A' }}>
        <p className="text-xs font-bold text-white flex items-center gap-1.5 mb-3"><Filter size={12} /> Recorte</p>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={groupType === 'company' && groupKey === 'all'}
            onClick={() => { setGroupType('company'); setGroupKey('all'); }}
            label="Empresa toda"
            n={d.grupos_disponiveis.find(g => g.group_type === 'company')?.n || 0}
          />
          {d.grupos_disponiveis.filter(g => g.group_type !== 'company').map(g => (
            <FilterChip
              key={`${g.group_type}|${g.group_key}`}
              active={groupType === g.group_type && groupKey === g.group_key}
              onClick={() => { setGroupType(g.group_type); setGroupKey(g.group_key); }}
              label={`${g.group_type === 'area' ? 'Área' : 'Cargo'}: ${g.group_key}`}
              n={g.n}
            />
          ))}
        </div>
        <p className="text-[9px] text-gray-500 mt-2">
          Apenas recortes com 7+ respondentes são listados (preserva anonimato).
        </p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-5">
        <PulseScoreCard
          label="Índice Geral"
          value={(d.indice_geral.t2 ?? d.indice_geral.t0 ?? 0).toFixed(2)}
          delta={d.indice_geral.delta}
          color={d.classificacao?.color as any || 'cyan'}
          hint={d.classificacao?.label}
        />
        <PulseScoreCard label="Respondentes T0" value={d.n_t0} color="white" hint={`${d.taxa_conclusao_t0}% conclusão`} />
        <PulseScoreCard label="Respondentes T2" value={d.n_t2} color="white" hint={`${d.taxa_conclusao_t2}% conclusão`} />
        <PulseScoreCard label="Δ Geral" value={d.indice_geral.delta != null ? (d.indice_geral.delta > 0 ? `+${d.indice_geral.delta.toFixed(2)}` : d.indice_geral.delta.toFixed(2)) : '—'}
          color={d.indice_geral.delta != null && d.indice_geral.delta > 0 ? 'green' : d.indice_geral.delta != null && d.indice_geral.delta < 0 ? 'red' : 'white'} />
        <PulseScoreCard label="Mais forte" value={d.dimensao_forte ? (d.dimensao_forte.t2 ?? d.dimensao_forte.t0 ?? 0).toFixed(2) : '—'}
          color="green" hint={d.dimensao_forte?.dimension_name} />
        <PulseScoreCard label="Mais crítica" value={d.dimensao_critica ? (d.dimensao_critica.t2 ?? d.dimensao_critica.t0 ?? 0).toFixed(2) : '—'}
          color="amber" hint={d.dimensao_critica?.dimension_name} />
      </div>

      {/* Gráfico por dimensão */}
      <div className="mb-5 rounded-xl border border-white/[0.06] p-5" style={{ background: '#0F2A4A' }}>
        <p className="text-xs font-bold text-white mb-4 flex items-center gap-1.5">
          <TrendingUp size={12} className="text-cyan-400" /> Médias por dimensão
        </p>
        <PulseDimensionChart dimensions={d.dimensions} showT2={d.n_t2 > 0} />
      </div>

      {/* Tabela com delta */}
      <div className="mb-5">
        <p className="text-xs font-bold text-white mb-3 flex items-center gap-1.5">
          <Users size={12} className="text-cyan-400" /> Leitura por dimensão
        </p>
        <PulseDeltaTable dimensions={d.dimensions} />
      </div>

      {/* Sinais da jornada */}
      {signals && signals.length > 0 && (
        <div className="mb-5">
          <PulseSignalsCard signals={signals} />
        </div>
      )}

      {/* Triangulação */}
      {triang && (
        <div className="mb-5">
          <TriangulationSummary data={triang} />
        </div>
      )}

      {/* Recomendações */}
      {triang && triang.recommendations.length > 0 && (
        <div className="mb-5">
          <RecommendationsList items={triang.recommendations} />
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label, n }: any) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold transition-all ${
        active
          ? 'bg-cyan-400 text-[#0F2B54]'
          : 'text-gray-400 border border-white/10 hover:border-cyan-400/40 hover:text-cyan-300'
      }`}>
      <span>{label}</span>
      <span className={`text-[9px] ${active ? 'text-[#0F2B54]/70' : 'text-gray-500'}`}>n={n}</span>
    </button>
  );
}
