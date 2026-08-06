import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';

import { getEstadoStats, getRankingMunicipiosUf, getDocentesUf } from '@/lib/radar/queries';
import { registrarEvento } from '@/lib/radar/eventos';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { FaleConosco } from '../../_components/fale-conosco';
import { HeroEstado } from '../../_components/hero-estado';
import { DocentesAgregadoSection } from '../../_components/docentes-card';

export const dynamic = 'force-dynamic';

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

export async function generateMetadata({ params }: { params: Promise<{ uf: string }> }): Promise<Metadata> {
  const { uf } = await params;
  const ufUp = uf.toUpperCase();
  const nomeUf = UF_NAMES[ufUp] || ufUp;
  const title = `${nomeUf} (${ufUp}) — Ranking estadual de escolas`;
  const description = `Indicadores Saeb e ICA por município em ${nomeUf}. Ranking estadual baseado em dados oficiais INEP.`;
  return {
    title,
    description,
    alternates: { canonical: `https://radar.vertho.ai/estado/${ufUp}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function EstadoPage({ params }: { params: Promise<{ uf: string }> }) {
  const { uf: ufRaw } = await params;
  const uf = ufRaw.toUpperCase();
  if (!UF_NAMES[uf]) return notFound();

  const stats = await getEstadoStats(uf);
  if (!stats) return notFound();

  registrarEvento('view_estado', { scopeType: 'estado', scopeId: uf }).catch(() => {});

  const [ranking, docentes] = await Promise.all([
    getRankingMunicipiosUf(uf),
    getDocentesUf(uf),
  ]);

  // Ordena: melhor (menor % N0-1) → pior
  const rankSaeb = [...ranking]
    .filter((r) => r.pctNivel01Avg != null)
    .sort((a, b) => (a.pctNivel01Avg || 0) - (b.pctNivel01Avg || 0));

  const rankIca = [...ranking]
    .filter((r) => r.icaTaxa != null)
    .sort((a, b) => (b.icaTaxa || 0) - (a.icaTaxa || 0));

  const ufNome = UF_NAMES[uf];

  // Médias agregadas para o hero
  const icaVals = rankIca.map((r) => r.icaTaxa!).filter((v) => v > 0);
  const icaMedio = icaVals.length ? icaVals.reduce((s, v) => s + v, 0) / icaVals.length : null;
  const n01Vals = rankSaeb.map((r) => r.pctNivel01Avg!).filter((v) => v != null);
  const pctN01Medio = n01Vals.length ? n01Vals.reduce((s, v) => s + v, 0) / n01Vals.length : null;

  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <div className="max-w-[1200px] mx-auto px-6 pt-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4">
          <ArrowLeft size={12} /> Voltar
        </Link>

        <HeroEstado
          uf={uf}
          ufNome={ufNome}
          totalEscolas={stats.totalEscolas}
          totalMunicipios={stats.totalMunicipios}
          totalSnapshots={stats.totalSnapshots}
          totalMicrorregioes={stats.microrregioes.length}
          icaMedio={icaMedio}
          pctN01Medio={pctN01Medio}
        />

        {/* Microrregiões */}
        {stats.microrregioes.length > 0 && (
          <section className="mb-12">
            <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
              Microrregiões
            </p>
            <h2 className="text-white mb-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}>
              Microrregiões cobertas em {ufNome}
            </h2>
            <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
              Subdivisões IBGE que agrupam municípios contíguos com perfil socioeconômico similar.
              {' '}A microrregião é a unidade de comparação primária no Radar.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {stats.microrregioes.map((m) => (
                <div key={m.nome}
                  className="rounded-2xl p-4 border border-white/[0.08]"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-sm font-bold text-white truncate">{m.nome}</p>
                  <p className="text-[11px] text-white/45 font-mono mt-1">
                    {m.total.toLocaleString('pt-BR')} escolas
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Corpo docente do estado (Censo Escolar) */}
        {docentes && <DocentesAgregadoSection agg={docentes} escopo="estado" nome={ufNome} />}

        {/* Ranking Saeb (melhor → pior) */}
        {rankSaeb.length > 0 && (
          <section className="mb-12">
            <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
              Ranking Saeb · melhores
            </p>
            <h2 className="text-white mb-3 flex items-center gap-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}>
              <TrendingDown size={26} style={{ color: '#86efac' }} />
              Municípios com menor concentração nos níveis 0-1
            </h2>
            <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
              Quanto menor o percentual de alunos nos níveis insuficientes (0 e 1) do Saeb,
              melhor a situação pedagógica da rede municipal.
            </p>
            <RankingTable rows={rankSaeb.slice(0, 10)} kind="saeb" trend="up" />
          </section>
        )}

        {rankSaeb.length > 5 && (
          <section className="mb-12">
            <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
              Ranking Saeb · gap pedagógico
            </p>
            <h2 className="text-white mb-3 flex items-center gap-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}>
              <TrendingUp size={26} style={{ color: '#fca5a5' }} />
              Municípios com maior concentração nos níveis 0-1
            </h2>
            <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
              Onde a maior parte dos alunos está saindo do ciclo sem domínio mínimo
              das habilidades esperadas. Prioridade de intervenção pedagógica.
            </p>
            <RankingTable rows={[...rankSaeb].reverse().slice(0, 10)} kind="saeb" trend="down" />
          </section>
        )}

        {/* Ranking ICA */}
        {rankIca.length > 0 && (
          <section className="mb-12">
            <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
              Ranking ICA
            </p>
            <h2 className="text-white mb-3 flex items-center gap-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}>
              <TrendingUp size={26} style={{ color: '#34c5cc' }} />
              Municípios com maior taxa de alfabetização
            </h2>
            <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
              Indicador Criança Alfabetizada — percentual de alunos no 2º ano EF que demonstram
              domínio das habilidades esperadas. Maior é melhor.
            </p>
            <RankingTable rows={rankIca.slice(0, 10)} kind="ica" trend="up" />
          </section>
        )}

        <p className="text-[11px] text-white/35 text-center mt-12 mb-6 max-w-[640px] mx-auto leading-relaxed">
          Rankings baseados em médias agregadas das escolas com dados oficiais publicados.
          Comparações entre municípios sem ajuste de contexto socioeconômico — para análise
          mais justa, ver{' '}
          <Link href="/radar/metodologia" className="text-cyan-400 hover:underline">metodologia</Link>.
        </p>
      </div>

      <RadarFooter />
      <FaleConosco scopeType="estado" scopeUf={uf} scopeName={UF_NAMES[uf]} />
    </main>
  );
}

type RankingRow = {
  ibge: string;
  nome: string;
  totalEscolas: number;
  pctNivel01Avg: number | null;
  taxaParticipacaoAvg: number | null;
  formacaoDocenteAvg: number | null;
  icaTaxa: number | null;
  icaAno: number | null;
};

function RankingTable({ rows, kind, trend }: { rows: RankingRow[]; kind: 'saeb' | 'ica'; trend: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] text-white/40 uppercase tracking-[0.15em] font-mono border-b border-white/[0.06]">
            <th className="px-4 py-3 w-10">#</th>
            <th className="px-4 py-3">Município</th>
            <th className="px-4 py-3 text-right">Escolas</th>
            {kind === 'saeb' ? (
              <>
                <th className="px-4 py-3 text-right">% N0-1</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Participação</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Form. docente</th>
              </>
            ) : (
              <>
                <th className="px-4 py-3 text-right">ICA</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Ano</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ibge} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.04] transition-colors">
              <td className="px-4 py-3 text-white/40 font-mono text-[11px]">{i + 1}</td>
              <td className="px-4 py-3">
                <Link href={`/radar/municipio/${r.ibge}`} className="text-white hover:text-cyan-400 font-medium">
                  {r.nome || r.ibge}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-white/55 font-mono text-[11px]">{r.totalEscolas}</td>
              {kind === 'saeb' ? (
                <>
                  <td className="px-4 py-3 text-right font-mono font-bold"
                    style={{ color: trend === 'up' ? '#86efac' : '#fca5a5' }}>
                    {r.pctNivel01Avg != null ? `${r.pctNivel01Avg.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white/55 font-mono text-[11px] hidden md:table-cell">
                    {r.taxaParticipacaoAvg != null ? `${r.taxaParticipacaoAvg.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white/55 font-mono text-[11px] hidden md:table-cell">
                    {r.formacaoDocenteAvg != null ? `${r.formacaoDocenteAvg.toFixed(1)}%` : '—'}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3 text-right font-mono font-bold" style={{ color: '#34c5cc' }}>
                    {r.icaTaxa != null ? `${r.icaTaxa.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-white/45 font-mono text-[11px] hidden md:table-cell">
                    {r.icaAno || '—'}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
