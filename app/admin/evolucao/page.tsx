'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import { loadEvolutionReportsEmpresa } from '@/actions/evolution-report';
import BackButton from '@/components/back-button';
import AdminPageHeader from '@/components/admin/page-header';
import { useEmpresaContexto } from '@/app/admin/_shell/useEmpresaContexto';

/**
 * Os vereditos que a régua PRODUZ (`lib/season-engine/convergencia.ts`).
 *
 * 🔴 `regressao` saiu daqui em 14/09/2026. O veredito foi removido da régua em
 * 01/09 por decisão do dono do produto (ninguém desaprende uma competência:
 * queda entre o diagnóstico e o fechamento é variação do instrumento, e entra
 * em "Estável"), mas a tela seguiu mostrando o card e a coluna. `Medido:` 234
 * descritores com veredito em toda a base, ZERO com `regressao`. Era um número
 * que não podia sair de 0, ocupando um quarto do resumo.
 */
const CONV = {
  evolucao_confirmada: { cor: 'emerald' },
  evolucao_parcial: { cor: 'amber' },
  estagnacao: { cor: 'gray' },
};

export default function EvolucaoAdminPage() {
  const t = useTranslations('AdminEvolution');
  // Contexto de empresa unificado (path → ?empresa= → filtro do header)
  const { empresaId } = useEmpresaContexto();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    (async () => {
      if (!empresaId) { setLoading(false); return; }
      setLoading(true);
      const r = await loadEvolutionReportsEmpresa(empresaId);
      setData(r);
      setLoading(false);
    })();
  }, [empresaId]);

  if (loading) return <Center>{t('loading')}</Center>;
  if (!empresaId) return <Center>{t('missingCompanyParam')}</Center>;
  if (!data?.success || data.total === 0) {
    return (
      <Wrapper>
        <Header total={0} />
        <div className="text-center py-16 text-gray-500 text-sm">
          {t('empty.title')}<br />
          {t('empty.description')}
        </div>
      </Wrapper>
    );
  }

  const competencias = Object.keys(data.por_competencia);

  return (
    <Wrapper>
      <Header total={data.total} />

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
      <h2 className="text-sm uppercase text-gray-400 mb-3">{t('evaluatedCollaborators', { count: data.trilhas.length })}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {data.trilhas.map(t => (
            <ColabRow key={t.id} trilha={t} />
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

function Wrapper({ children }) {
  return (
    <div className="min-h-full text-white">
      <div className="max-w-6xl mx-auto p-6">{children}</div>
    </div>
  );
}

function Center({ children }) {
  return <Wrapper><div className="text-center py-16 text-gray-400 text-sm">{children}</div></Wrapper>;
}

function Header({ total }) {
  const t = useTranslations('AdminEvolution');
  return (
    <>
      <BackButton />
      <AdminPageHeader icon={TrendingUp} title={t('title')} subtitle={t('subtitle', { count: total })} />
    </>
  );
}

function ResumoGeral({ porCompetencia }: { porCompetencia: any }) {
  const t = useTranslations('AdminEvolution');
  const stats: Record<string, number> = Object.fromEntries(Object.keys(CONV).map((k) => [k, 0]));
  for (const comp of Object.values(porCompetencia) as any[]) {
    for (const d of Object.values(comp) as any[]) {
      for (const k of Object.keys(stats)) stats[k] += d[k] || 0;
    }
  }
  const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0) || 1;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {Object.entries(CONV).map(([k, c]: [string, any]) => (
        <div key={k} className={`rounded-xl p-4 bg-${c.cor}-500/10 border border-${c.cor}-500/20`}>
          <div className={`text-2xl font-bold text-${c.cor}-400`}>{stats[k]}</div>
          <div className="text-xs text-gray-400 mt-1">{t(`statuses.${k}`)}</div>
          <div className="text-[10px] text-gray-500">{Math.round(stats[k] / total * 100)}%</div>
        </div>
      ))}
    </div>
  );
}

function CompetenciaCard({ nome, descritores, expanded, onToggle }: { nome?: any; descritores: any; expanded?: any; onToggle?: any }) {
  const t = useTranslations('AdminEvolution');
  const descs = Object.entries(descritores) as [string, any][];
  const totalAvaliacoes = descs.reduce((sum: number, [, d]: [string, any]) => sum + (d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao), 0);

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div className="flex-1 text-left">
          <div className="text-sm font-bold text-cyan-400">{nome}</div>
          <div className="text-[11px] text-gray-500">{t('descriptorSummary', { descriptors: descs.length, evaluations: totalAvaliacoes })}</div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/5 space-y-2">
          {descs.map(([desc, d]: [string, any]) => {
            const total = d.evolucao_confirmada + d.evolucao_parcial + d.estagnacao;
            return (
              <div key={desc} className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">{desc}</span>
                  {d.media_pre != null && d.media_pos != null && (
                    <span className="text-[10px] text-gray-400">
                      {t('average')}: {d.media_pre.toFixed(1)} → <span className="text-cyan-400 font-bold">{d.media_pos.toFixed(1)}</span>
                    </span>
                  )}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => {
                    const pct = total > 0 ? (d[k] / total * 100) : 0;
                    return <div key={k} className={`bg-${c.cor}-500`} style={{ width: `${pct}%` }} title={`${t(`statuses.${k}`)}: ${d[k]}`} />;
                  })}
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-gray-500">
                  {Object.entries(CONV).map(([k, c]: [string, any]) => (
                    <span key={k} className={`text-${c.cor}-400`}>{t(`statuses.${k}`)}: {d[k]}</span>
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

function ColabRow({ trilha }) {
  const locale = useLocale();
  const t = useTranslations('AdminEvolution');
  const resumo = trilha.evolution_report?.resumo || {};
  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/10">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-bold text-white">{trilha.colab?.nome_completo || '—'}</div>
        <span className="text-[10px] text-gray-500">{new Date(trilha.evolution_generated_at).toLocaleDateString(locale)}</span>
      </div>
      <div className="text-[11px] text-gray-400 mb-2">{trilha.colab?.cargo} · {trilha.competencia_foco}</div>
      {/* Símbolo sozinho não se explica, e o card é a primeira coisa que se lê
          nesta tela: o rótulo do veredito vai ao lado, com a palavra da régua. */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        <span className="text-emerald-400">✓ {resumo.confirmadas || 0} {t('statuses.evolucao_confirmada')}</span>
        <span className="text-amber-400">~ {resumo.parciais || 0} {t('statuses.evolucao_parcial')}</span>
        <span className="text-gray-400">= {resumo.estagnacoes || 0} {t('statuses.estagnacao')}</span>
      </div>
    </div>
  );
}
