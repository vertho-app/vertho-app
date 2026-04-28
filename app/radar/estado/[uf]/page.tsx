import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, GraduationCap, Building2, MapPin, TrendingDown, TrendingUp } from 'lucide-react';

import { getEstadoStats, getRankingMunicipiosUf } from '@/lib/radar/queries';
import { registrarEvento } from '@/lib/radar/eventos';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';

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

  const ranking = await getRankingMunicipiosUf(uf);

  // Ordena: melhor (menor % N0-1) → pior
  const rankSaeb = [...ranking]
    .filter((r) => r.pctNivel01Avg != null)
    .sort((a, b) => (a.pctNivel01Avg || 0) - (b.pctNivel01Avg || 0));

  const rankIca = [...ranking]
    .filter((r) => r.icaTaxa != null)
    .sort((a, b) => (b.icaTaxa || 0) - (a.icaTaxa || 0));

  const ufNome = UF_NAMES[uf];

  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <div className="max-w-[1100px] mx-auto px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-6">
          <ArrowLeft size={12} /> Voltar
        </Link>

        {/* Hero */}
        <section className="mb-10">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Estado · {uf}
          </p>
          <h1 className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(36px, 6vw, 56px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}>
            <em style={{ color: '#34c5cc' }}>{ufNome}</em>
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/55 font-mono">
            <span className="flex items-center gap-1.5">
              <GraduationCap size={12} style={{ color: '#34c5cc' }} />
              {stats.totalEscolas.toLocaleString('pt-BR')} escolas
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin size={12} style={{ color: '#34c5cc' }} />
              {stats.totalMunicipios.toLocaleString('pt-BR')} municípios
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 size={12} style={{ color: '#34c5cc' }} />
              {stats.totalSnapshots.toLocaleString('pt-BR')} snapshots Saeb
            </span>
          </div>
        </section>

        {/* Microrregiões */}
        {stats.microrregioes.length > 0 && (
          <section className="mb-10">
            <h2 className="text-white text-xl font-bold mb-4">Microrregiões cobertas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {stats.microrregioes.map((m) => (
                <div key={m.nome}
                  className="rounded-2xl p-4 border border-white/[0.06]"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-sm font-bold text-white truncate">{m.nome}</p>
                  <p className="text-[11px] text-white/45 font-mono mt-1">{m.total} escolas</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ranking Saeb (melhor → pior) */}
        {rankSaeb.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <TrendingDown size={18} style={{ color: '#34D399' }} />
                Melhores em Saeb (% nos níveis 0-1)
              </h2>
              <span className="text-[10px] tracking-wider uppercase font-mono text-white/40">menor = melhor</span>
            </div>
            <RankingTable rows={rankSaeb.slice(0, 10)} kind="saeb" trend="up" />
          </section>
        )}

        {rankSaeb.length > 5 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <TrendingUp size={18} style={{ color: '#F97354' }} />
                Maior gap pedagógico em Saeb
              </h2>
              <span className="text-[10px] tracking-wider uppercase font-mono text-white/40">% N0-1 alto</span>
            </div>
            <RankingTable rows={[...rankSaeb].reverse().slice(0, 10)} kind="saeb" trend="down" />
          </section>
        )}

        {/* Ranking ICA */}
        {rankIca.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold flex items-center gap-2">
                <TrendingUp size={18} style={{ color: '#34c5cc' }} />
                Maior taxa ICA (Indicador Criança Alfabetizada)
              </h2>
              <span className="text-[10px] tracking-wider uppercase font-mono text-white/40">maior = melhor</span>
            </div>
            <RankingTable rows={rankIca.slice(0, 10)} kind="ica" trend="up" />
          </section>
        )}

        <p className="text-[11px] text-white/35 text-center mb-2 max-w-[640px] mx-auto leading-relaxed">
          Rankings baseados em médias agregadas das escolas com dados oficiais publicados.
          Comparações entre municípios sem ajuste de contexto socioeconômico — pra análise mais
          justa, ver <Link href="/metodologia" className="text-cyan-400 hover:underline">metodologia</Link>.
        </p>
      </div>

      <RadarFooter />
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
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[9px] text-white/40 uppercase tracking-widest border-b border-white/[0.04]">
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
            <tr key={r.ibge} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.025] transition-colors">
              <td className="px-4 py-3 text-white/40 font-mono text-[11px]">{i + 1}</td>
              <td className="px-4 py-3">
                <Link href={`/municipio/${r.ibge}`} className="text-white hover:text-cyan-400 font-medium">
                  {r.nome || r.ibge}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-white/55 font-mono text-[11px]">{r.totalEscolas}</td>
              {kind === 'saeb' ? (
                <>
                  <td className="px-4 py-3 text-right font-mono font-bold"
                    style={{ color: trend === 'up' ? '#34D399' : '#F97354' }}>
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
