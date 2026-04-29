import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, Network, TrendingUp, TrendingDown } from 'lucide-react';

import {
  getMunicipio, getRedeStats, getRedeRanking, getRedePorInse,
  type RedeEscolaRanking,
} from '@/lib/radar/queries';
import { registrarEvento } from '@/lib/radar/eventos';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { CitarButton } from '../../_components/citar-button';
import { FaleConosco } from '../../_components/fale-conosco';

export const dynamic = 'force-dynamic';

const ETAPA_LABEL: Record<string, string> = {
  '5_EF': '5º ano EF',
  '9_EF': '9º ano EF',
  '3_EM': '3º ano EM',
};

export async function generateMetadata({ params }: { params: Promise<{ ibge: string }> }): Promise<Metadata> {
  const { ibge } = await params;
  const m = await getMunicipio(ibge);
  if (!m) return { title: 'Rede não encontrada' };
  return {
    title: `Rede de ${m.nome}/${m.uf} — análise interna`,
    description: `Distribuição, top/bottom escolas, INSE e variabilidade da rede de ensino em ${m.nome}/${m.uf}.`,
    alternates: { canonical: `https://radar.vertho.ai/rede/${ibge}` },
  };
}

export default async function RedeMunicipalPage({ params }: { params: Promise<{ ibge: string }> }) {
  const { ibge } = await params;
  const m = await getMunicipio(ibge);
  if (!m) return notFound();

  registrarEvento('view_municipio', { scopeType: 'municipio', scopeId: ibge, extra: { action: 'view_rede' } }).catch(() => {});

  const [stats, ranking, porInse] = await Promise.all([
    getRedeStats(ibge),
    getRedeRanking(ibge, 5),
    getRedePorInse(ibge),
  ]);

  const topAll = ranking.filter((r) => r.posicao === 'top');
  const bottomAll = ranking.filter((r) => r.posicao === 'bottom').reverse(); // mostrar do pior pro último-pior

  // Em redes pequenas, top 5 + bottom 5 sobrepõem (mesma escola em ambos).
  // Limita k = floor(N/2) pra garantir conjuntos disjuntos. Se N <= 3, esconde.
  const distinctInep = new Set([
    ...topAll.map((r) => r.codigo_inep),
    ...bottomAll.map((r) => r.codigo_inep),
  ]);
  const qtdEscolasRanking = stats?.qtd_escolas ?? distinctInep.size;
  const k = qtdEscolasRanking <= 3 ? 0 : Math.min(5, Math.floor(qtdEscolasRanking / 2));
  const topInepSet = new Set(topAll.slice(0, k).map((r) => r.codigo_inep));
  const top = topAll.slice(0, k);
  const bottom = bottomAll.filter((r) => !topInepSet.has(r.codigo_inep)).slice(0, k);

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
        <Link href={`/radar/municipio/${ibge}`}
          className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4">
          <ArrowLeft size={12} /> Voltar para {m.nome}
        </Link>

        {/* Hero */}
        <header className="relative overflow-hidden mb-12 rounded-3xl p-8 md:p-12"
          style={{
            background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
          <div aria-hidden className="pointer-events-none absolute"
            style={{
              right: -140, top: -120, width: 480, height: 480,
              border: '60px solid rgba(52,197,204,0.06)', borderRadius: '50%',
            }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4 text-[11px] uppercase tracking-[0.12em] font-bold"
              style={{ color: '#9ae2e6' }}>
              <Network size={14} />
              <span>Rede municipal</span>
            </div>
            <h1 className="text-white mb-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontWeight: 600,
                fontSize: 'clamp(28px, 4.5vw, 52px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}>
              {m.nome}, <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>{m.uf}</em>
            </h1>
            <p className="text-white/65 leading-relaxed mb-2" style={{ fontSize: 17, maxWidth: 720 }}>
              Análise da dinâmica interna da rede: dispersão, top/bottom escolas e
              distribuição por contexto socioeconômico (INSE).
            </p>
            {stats && (
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/55">
                <span><strong className="text-white/85">{stats.qtd_escolas}</strong> escolas com Saeb</span>
                <span>Etapa de referência: <strong className="text-white/85">{ETAPA_LABEL[stats.etapa] || stats.etapa}</strong></span>
              </div>
            )}
          </div>
        </header>

        {!stats || stats.qtd_escolas < 3 ? (
          <div className="rounded-2xl p-8 border border-white/[0.08] text-center"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-white/65">
              Rede com menos de 3 escolas no Saeb. Precisa de mais escolas pra análise estatística.
            </p>
          </div>
        ) : (
          <>
            {/* DISTRIBUIÇÃO */}
            <DistribuicaoSection stats={stats} />

            {/* TOP / BOTTOM */}
            <TopBottomSection top={top} bottom={bottom} stats={stats} />

            {/* POR INSE */}
            {porInse.length > 0 && <PorInseSection porInse={porInse} stats={stats} />}
          </>
        )}

        <div className="flex flex-col items-center gap-3 mb-6 mt-12">
          <p className="text-[11px] text-white/35 text-center max-w-[640px] mx-auto leading-relaxed">
            Análise gerada a partir de dados públicos do INEP (Saeb e Ideb). Ranking interno
            da rede usa Saeb LP+Mat médio na etapa com mais escolas.
          </p>
          <CitarButton scopeType="municipio" scopeId={ibge} scopeLabel={`Rede de ${m.nome}/${m.uf}`} />
        </div>
      </div>

      <RadarFooter />
      <FaleConosco scopeType="rede" scopeId={ibge} scopeName={m.nome} scopeUf={m.uf} />
    </main>
  );
}

function DistribuicaoSection({ stats }: { stats: NonNullable<Awaited<ReturnType<typeof getRedeStats>>> }) {
  const cv = stats.saeb_lp_avg && stats.saeb_lp_stddev
    ? (stats.saeb_lp_stddev / stats.saeb_lp_avg) * 100 : null;
  const tipoRede =
    cv == null ? { label: '—', cor: 'rgba(255,255,255,0.5)', narrativa: '' } :
    cv < 8     ? { label: 'rede consistente', cor: '#86efac',
                   narrativa: 'As escolas vão juntas — sinal de gestão e formação relativamente uniformes.' } :
    cv < 15    ? { label: 'rede moderada', cor: '#FCD34D',
                   narrativa: 'Há diferenças relevantes entre as escolas. Vale identificar o que as separa.' } :
                 { label: 'rede heterogênea', cor: '#fca5a5',
                   narrativa: 'Disparidade alta — algumas escolas indo bem, outras muito mal. A rede não está se nivelando.' };

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Distribuição
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Quão homogênea é a rede?
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Estatísticas Saeb {ETAPA_LABEL[stats.etapa] || stats.etapa} entre as {stats.qtd_escolas} escolas
        avaliadas. Coeficiente de variação (CV%) sintetiza a homogeneidade.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <DimensaoStats
          titulo="Língua Portuguesa"
          avg={stats.saeb_lp_avg} stddev={stats.saeb_lp_stddev}
          min={stats.saeb_lp_min} max={stats.saeb_lp_max}
          p25={stats.saeb_lp_p25} p75={stats.saeb_lp_p75}
        />
        <DimensaoStats
          titulo="Matemática"
          avg={stats.saeb_mat_avg} stddev={stats.saeb_mat_stddev}
          min={stats.saeb_mat_min} max={stats.saeb_mat_max}
          p25={stats.saeb_mat_p25} p75={stats.saeb_mat_p75}
        />
      </div>

      {stats.ideb_avg != null && (
        <div className="rounded-2xl p-5 border border-white/[0.08] grid grid-cols-2 md:grid-cols-4 gap-4 mb-4"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <KV label="Ideb médio" value={stats.ideb_avg.toFixed(2)} />
          <KV label="Desvio-padrão" value={`±${(stats.ideb_stddev ?? 0).toFixed(2)}`} />
          <KV label="Mín" value={(stats.ideb_min ?? 0).toFixed(1)} />
          <KV label="Máx" value={(stats.ideb_max ?? 0).toFixed(1)} />
        </div>
      )}

      <div className="rounded-xl px-4 py-3 text-[14px] leading-relaxed"
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderLeft: `3px solid ${tipoRede.cor}`,
          color: 'rgba(255,255,255,0.75)',
        }}>
        <strong className="text-white/90">Leitura: </strong>
        <span style={{ color: tipoRede.cor, fontWeight: 700 }}>{tipoRede.label}.</span>{' '}
        {tipoRede.narrativa}
      </div>
    </section>
  );
}

function DimensaoStats({
  titulo, avg, stddev, min, max, p25, p75,
}: {
  titulo: string;
  avg: number | null; stddev: number | null;
  min: number | null; max: number | null;
  p25: number | null; p75: number | null;
}) {
  const cv = avg && stddev ? (stddev / avg) * 100 : null;
  const cvCor = cv == null ? 'rgba(255,255,255,0.5)' :
    cv < 8 ? '#86efac' : cv < 15 ? '#FCD34D' : '#fca5a5';

  return (
    <div className="rounded-2xl p-5 border border-white/[0.08]"
      style={{ background: 'rgba(255,255,255,0.04)' }}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-white font-bold">{titulo}</h3>
        {cv != null && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: cvCor === '#fca5a5' ? 'rgba(220,38,38,0.18)' :
                          cvCor === '#FCD34D' ? 'rgba(245,158,11,0.18)' :
                          cvCor === '#86efac' ? 'rgba(34,197,94,0.18)' :
                          'rgba(255,255,255,0.08)',
              color: cvCor,
            }}>
            CV {cv.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <KV label="Média" value={avg != null ? avg.toFixed(0) : '—'} />
        <KV label="Desvio" value={stddev != null ? `±${stddev.toFixed(1)}` : '—'} />
      </div>
      {/* Box-plot esquemático: min — p25 — p75 — max */}
      {min != null && max != null && p25 != null && p75 != null && (
        <div className="mt-3">
          <div className="relative h-3">
            {/* Linha total min-max */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[2px]"
              style={{ background: 'rgba(255,255,255,0.15)' }} />
            {/* Caixa interquartil p25-p75 */}
            {(() => {
              const total = max - min;
              const left = ((p25 - min) / total) * 100;
              const width = ((p75 - p25) / total) * 100;
              return (
                <div className="absolute top-0 bottom-0 rounded"
                  style={{ left: `${left}%`, width: `${width}%`, background: 'rgba(52,197,204,0.4)' }} />
              );
            })()}
            {/* Linha média */}
            {avg != null && (
              <div className="absolute top-0 bottom-0 w-[2px]"
                style={{ left: `${((avg - min) / (max - min)) * 100}%`, background: '#fca5a5' }} />
            )}
          </div>
          <div className="flex justify-between text-[10px] font-mono text-white/45 mt-2">
            <span>min {min.toFixed(0)}</span>
            <span>q25 {p25.toFixed(0)}</span>
            <span className="text-[#fca5a5]">μ {avg != null ? avg.toFixed(0) : '—'}</span>
            <span>q75 {p75.toFixed(0)}</span>
            <span>max {max.toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-[0.15em] uppercase font-bold text-white/40 mb-1">{label}</p>
      <p className="text-white"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 22, fontWeight: 600, lineHeight: 1,
        }}>
        {value}
      </p>
    </div>
  );
}

function TopBottomSection({
  top, bottom, stats,
}: {
  top: RedeEscolaRanking[];
  bottom: RedeEscolaRanking[];
  stats: NonNullable<Awaited<ReturnType<typeof getRedeStats>>>;
}) {
  if (!top.length && !bottom.length) return null;
  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Extremos da Rede
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Quem é referência e quem precisa de atenção
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Top {top.length} e bottom {bottom.length} ordenadas pelo Saeb médio (LP + Mat) na etapa
        de referência. Compare INSE pra entender se as melhores são escolas privilegiadas ou
        casos de gestão excepcional.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingList
          titulo="Top da rede"
          items={top}
          icon={<TrendingUp size={16} />}
          color="#86efac"
          bg="rgba(22,163,74,0.08)"
          border="rgba(22,163,74,0.25)"
        />
        <RankingList
          titulo="Bottom da rede"
          items={bottom}
          icon={<TrendingDown size={16} />}
          color="#fca5a5"
          bg="rgba(220,38,38,0.08)"
          border="rgba(220,38,38,0.3)"
        />
      </div>
    </section>
  );
}

function RankingList({
  titulo, items, icon, color, bg, border,
}: {
  titulo: string;
  items: RedeEscolaRanking[];
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl p-6 border" style={{ background: bg, borderColor: border }}>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}25`, color }}>
          {icon}
        </div>
        <p className="text-[11px] tracking-[0.12em] uppercase font-bold" style={{ color }}>
          {titulo}
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((it) => (
          <li key={it.codigo_inep}>
            <Link href={`/radar/escola/${it.codigo_inep}`}
              className="flex items-center justify-between gap-3 hover:opacity-90 transition-opacity">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-mono" style={{ color }}>#{it.rank_total}</span>
                  <span className="text-sm text-white truncate">{it.nome}</span>
                </div>
                <p className="text-[11px] text-white/45 mt-0.5">
                  {it.rede || '—'}
                  {it.inse_grupo != null && <> · INSE {it.inse_grupo}</>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono"
                  style={{
                    fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                    fontSize: 18, fontWeight: 600, color,
                  }}>
                  {it.saeb_geral != null ? it.saeb_geral.toFixed(0) : '—'}
                </p>
                <p className="text-[10px] text-white/40 font-mono">
                  Ideb {it.ideb != null ? it.ideb.toFixed(1) : '—'}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PorInseSection({
  porInse, stats,
}: {
  porInse: { inse_grupo: number; qtd_escolas: number; saeb_lp_avg: number | null; saeb_mat_avg: number | null; ideb_avg: number | null }[];
  stats: NonNullable<Awaited<ReturnType<typeof getRedeStats>>>;
}) {
  const totalEscolas = porInse.reduce((s, x) => s + x.qtd_escolas, 0);
  const maxSaeb = Math.max(...porInse.map((x) =>
    Math.max(x.saeb_lp_avg ?? 0, x.saeb_mat_avg ?? 0)
  ));

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Recorte por INSE
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Como o resultado varia por contexto socioeconômico
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        INSE 1 (mais alto) → INSE 6 (mais baixo). Numa rede equitativa, a média de Saeb varia
        pouco entre os grupos; numa rede com viés social, a diferença é grande.
      </p>

      <div className="rounded-2xl border border-white/[0.08] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="grid grid-cols-12 gap-3 px-5 py-3 border-b border-white/[0.08]
                        text-[10px] tracking-[0.15em] uppercase font-mono text-white/40">
          <div className="col-span-2">INSE</div>
          <div className="col-span-2 text-right">Escolas</div>
          <div className="col-span-3 text-right">Saeb LP</div>
          <div className="col-span-3 text-right">Saeb Mat</div>
          <div className="col-span-2 text-right">Ideb</div>
        </div>
        {porInse.map((p) => (
          <div key={p.inse_grupo} className="grid grid-cols-12 gap-3 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-b-0">
            <div className="col-span-2">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold"
                style={{
                  background: 'rgba(154,226,230,0.15)',
                  color: '#9ae2e6',
                  border: '1px solid rgba(154,226,230,0.3)',
                }}>
                Grupo {p.inse_grupo}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-white/85 font-mono font-bold">{p.qtd_escolas}</p>
              <p className="text-[10px] text-white/40 font-mono">
                {((p.qtd_escolas / totalEscolas) * 100).toFixed(0)}% da rede
              </p>
            </div>
            <div className="col-span-3">
              <BarRow value={p.saeb_lp_avg} max={maxSaeb} color="#34c5cc" />
            </div>
            <div className="col-span-3">
              <BarRow value={p.saeb_mat_avg} max={maxSaeb} color="#fca5a5" />
            </div>
            <div className="col-span-2 text-right">
              <p style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 18, fontWeight: 600, color: 'white',
              }}>
                {p.ideb_avg != null ? p.ideb_avg.toFixed(1) : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-white/40 mt-3">
        Fonte: INEP — Saeb · Ideb · INSE. Etapa de referência: {ETAPA_LABEL[stats.etapa] || stats.etapa}.
      </p>
    </section>
  );
}

function BarRow({ value, max, color }: { value: number | null; max: number; color: string }) {
  if (value == null) return <span className="text-white/35 text-sm font-mono">—</span>;
  const pct = max > 0 ? Math.max(5, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-white/85 font-mono text-sm font-bold shrink-0 min-w-[40px] text-right">
        {value.toFixed(0)}
      </span>
    </div>
  );
}
