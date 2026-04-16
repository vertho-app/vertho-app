'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { loadEvolutionReportsEmpresa } from '@/actions/evolution-report';

const CONV = {
  evolucao_confirmada: { label: 'Confirmada', cor: 'emerald' },
  evolucao_parcial: { label: 'Parcial', cor: 'amber' },
  estagnacao: { label: 'Estagnação', cor: 'gray' },
  regressao: { label: 'Regressão', cor: 'red' },
};

export default function EvolucaoAdminPage() {
  const router = useRouter();
  const [empresaId, setEmpresaId] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setEmpresaId(new URLSearchParams(window.location.search).get('empresa'));
  }, []);

  useEffect(() => {
    (async () => {
      if (!empresaId) { setLoading(false); return; }
      setLoading(true);
      const r = await loadEvolutionReportsEmpresa(empresaId);
      setData(r);
      setLoading(false);
    })();
  }, [empresaId]);

  if (loading) return <Center>Carregando...</Center>;
  if (!empresaId) return <Center>Passe ?empresa={'{id}'} na URL</Center>;
  if (!data?.success || data.total === 0) {
    return (
      <Wrapper>
        <Header router={router} total={0} />
        <div className="text-center py-16 text-gray-500 text-sm">
          Nenhuma temporada concluída nessa empresa ainda.<br />
          Aguarde os colaboradores finalizarem as semanas 13-14.
        </div>
      </Wrapper>
    );
  }

  const competencias = Object.keys(data.por_competencia);

  return (
    <Wrapper>
      <Header router={router} total={data.total} />

      {/* Resumo geral (agregado) */}
      <ResumoGeral porCompetencia={data.por_competencia} />

      {/* Por competência + descritor */}
      <div className="space-y-4">
        {competencias.map(comp => (
          <CompetenciaCard key={comp}
            nome={comp}
            descritores={data.por_competencia[comp]}
            expanded={expanded === comp}
            onToggle={() => setExpanded(expanded === comp ? null : comp)} />
        ))}
      </div>

      {/* Lista de colabs */}
      <div className="mt-8">
        <h2 className="text-sm uppercase text-gray-400 mb-3">Colaboradores avaliados ({data.trilhas.length})</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {data.trilhas.map(t => (
            <ColabRow key={t.id} t={t} />
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1426] to-[#0a0e1a] text-white">
      <div className="max-w-6xl mx-auto p-6">{children}</div>
    </div>
  );
}

function Center({ children }) {
  return <Wrapper><div className="text-center py-16 text-gray-400 text-sm">{children}</div></Wrapper>;
}

function Header({ router, total }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button onClick={() => router.back()} className="p-2 rounded-lg bg-white/5 hover:bg-white/10">
        <ArrowLeft size={18} />
      </button>
      <div className="flex-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp size={22} className="text-cyan-400" />
          Evolução — Temporadas Concluídas
        </h1>
        <p className="text-xs text-gray-400">{total} colaboradores com Evolution Report</p>
      </div>
    </div>
  );
}

function ResumoGeral({ porCompetencia }: { porCompetencia: any }) {
  const stats: Record<string, number> = { evolucao_confirmada: 0, evolucao_parcial: 0, estagnacao: 0, regressao: 0 };
  for (const comp of Object.values(porCompetencia) as any[]) {
    for (const d of Object.values(comp) as any[]) {
      for (const k of Object.keys(stats)) stats[k] += d[k] || 0;
    }
  }
  const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0) || 1;

  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {Object.entries(CONV).map(([k, c]: [string, any]) => (
        <div key={k} className={`rounded-xl p-4 bg-${c.cor}-500/10 border border-${c.cor}-500/20`}>
          <div className={`text-2xl font-bold text-${c.cor}-400`}>{stats[k]}</div>
          <div className="text-xs text-gray-400 mt-1">{c.label}</div>
          <div className="text-[10px] text-gray-500">{Math.round(stats[k] / total * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function CompetenciaCard({ nome, descritores, expanded, onToggle }: { nome?: any; descritores: any; expanded?: any; onToggle?: any }) {
  const descs = Object.entries(descritores) as [string, any][];
  const totalAvaliacoes = descs.reduce((sum: number, [, d]: [string, any]) => sum + (d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao + d.regressao), 0);

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-cyan-400">{nome}</div>
          <div className="text-[11px] text-gray-500">{descs.length} descritores · {totalAvaliacoes} avaliações</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2">
          {descs.map(([desc, d]: [string, any]) => {
            const total = d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao + d.regressao;
            return (
              <div key={desc} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">{desc}</span>
                  {d.media_pre != null && d.media_pos != null && (
                    <span className="text-[10px] text-gray-400">
                      Média: {d.media_pre.toFixed(1)} → <span className="text-cyan-400 font-bold">{d.media_pos.toFixed(1)}</span>
                    </span>
                  )}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => {
                    const pct = total > 0 ? (d[k] / total * 100) : 0;
                    return <div key={k} className={`bg-${c.cor}-500`} style={{ width: `${pct}%` }} title={`${c.label}: ${d[k]}`} />;
                  })}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => (
                    <span key={k} className={`text-${c.cor}-400`}>{c.label}: {d[k]}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColabRow({ t }) {
  const resumo = t.evolution_report?.resumo || {};
  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-bold text-white">{t.colab?.nome_completo || '—'}</div>
        <span className="text-[10px] text-gray-500">{new Date(t.evolution_generated_at).toLocaleDateString('pt-BR')}</span>
      </div>
      <div className="text-[11px] text-gray-400 mb-2">{t.colab?.cargo} · {t.competencia_foco}</div>
      <div className="flex gap-2 text-[10px]">
        <span className="text-emerald-400">✓ {resumo.confirmadas || 0}</span>
        <span className="text-amber-400">~ {resumo.parciais || 0}</span>
        <span className="text-gray-400">= {resumo.estagnacoes || 0}</span>
        <span className="text-red-400">↓ {resumo.regressoes || 0}</span>
      </div>
    </div>
  );
}
