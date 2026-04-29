import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { getEscola, getEscolaBenchmarks, getEscolaInfraSaeb, getParesCidade, getIcaMunicipioRecente } from '@/lib/radar/queries';
import { leituraSaebEscola } from '@/lib/radar/leitura-deterministica';
import { registrarEvento } from '@/lib/radar/eventos';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { SaebCard } from '../../_components/indicator-card';
import { LeadCTA } from '../../_components/lead-cta';
import { NarrativaIA, NarrativaSkeleton } from '../../_components/narrativa-ia';
import { InfraSection } from '../../_components/infra-card';
import { CitarButton } from '../../_components/citar-button';
import { SarespSection } from '../../_components/saresp-section';
import { PddeSection } from '../../_components/pdde-section';
import { EscolaBenchmarkTable } from '../../_components/escola-benchmark-table';
import { InfraSaebCard } from '../../_components/infra-saeb-card';
import { HeroEscola } from '../../_components/hero-escola';
import { ParesCidadeSection } from '../../_components/pares-cidade';
import { AlfabetizacaoSaebCard } from '../../_components/alfabetizacao-saeb-card';
import { IdebTimelineChart } from '../../_components/ideb-timeline-chart';
import { SaebHistoryChart } from '../../_components/saeb-history-chart';
import { DestaquesAtencao } from '../../_components/destaques-atencao';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ inep: string }> }): Promise<Metadata> {
  const { inep } = await params;
  const r = await getEscola(inep);
  if (!r?.escola) return { title: 'Escola não encontrada' };
  const e = r.escola;
  const title = `${e.nome} (${e.codigo_inep}) — ${e.municipio}/${e.uf}`;
  const description = `Indicadores Saeb e ICA da escola ${e.nome} em ${e.municipio}/${e.uf}. Diagnóstico público com fontes oficiais INEP.`;
  return {
    title,
    description,
    alternates: { canonical: `https://radar.vertho.ai/escola/${inep}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function EscolaPage({ params }: { params: Promise<{ inep: string }> }) {
  const { inep } = await params;
  const r = await getEscola(inep);
  if (!r?.escola) return notFound();
  const escola = r.escola;
  const saeb = r.saeb;
  const censo = r.censo;
  const ideb = r.ideb;
  const enem = r.enem || [];
  const saresp = r.saresp || [];
  const pdde = r.pdde || [];

  const [benchmarks, infraSaeb, paresCidade, icaMunicipio] = await Promise.all([
    getEscolaBenchmarks(escola.codigo_inep),
    getEscolaInfraSaeb(escola.codigo_inep),
    getParesCidade(escola.codigo_inep, 10),
    escola.municipio_ibge ? getIcaMunicipioRecente(escola.municipio_ibge) : Promise.resolve(null),
  ]);

  // Tracking best-effort (não bloqueia render)
  registrarEvento('view_escola', { scopeType: 'escola', scopeId: escola.codigo_inep }).catch(() => {});

  const determ = leituraSaebEscola(escola, saeb);
  const determRefBlock = (
    <p className="text-xs text-white/45 leading-relaxed italic border-l-2 border-white/10 pl-3">
      {determ.resumo}
    </p>
  );

  // schema.org structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: escola.nome,
    identifier: escola.codigo_inep,
    address: {
      '@type': 'PostalAddress',
      addressLocality: escola.municipio,
      addressRegion: escola.uf,
      addressCountry: 'BR',
    },
    url: `https://radar.vertho.ai/escola/${inep}`,
  };

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
          <ArrowLeft size={12} /> Buscar outra escola
        </Link>

        {/* Hero (handoff vh3) */}
        <HeroEscola
          escola={escola}
          saeb={saeb}
          ideb={ideb}
          benchmarks={benchmarks}
        />

        {/* Leitura IA + determinística (Suspense pra UX progressiva) */}
        <section className="mb-12 flex flex-col gap-4">
          <Suspense fallback={<NarrativaSkeleton resumoDeterm={determ.resumo} />}>
            <NarrativaIA
              scope="escola"
              escola={escola}
              saeb={saeb}
              censo={censo}
              ideb={ideb}
              saresp={saresp}
              pdde={pdde}
              determRefBlock={determRefBlock}
            />
          </Suspense>
        </section>

        {/* Destaques e Pontos de Atenção (gerados automaticamente) */}
        <DestaquesAtencao
          censo={censo}
          saeb={saeb}
          ideb={ideb}
          benchmarks={benchmarks}
          infraSaeb={infraSaeb.resumo}
        />

        {/* Comparativo escola vs microrregião / estado (com barras) */}
        {benchmarks.length > 0 && (
          <EscolaBenchmarkTable
            rows={benchmarks}
            microrregiao={escola.microrregiao}
            uf={escola.uf}
          />
        )}

        {/* Cruzamento Infra × Saeb (quadrante editorial) */}
        <InfraSaebCard resumo={infraSaeb.resumo} breakdown={infraSaeb.breakdown} />

        {/* Pares INSE na mesma cidade (lista nominal) */}
        <ParesCidadeSection
          pares={paresCidade}
          municipio={escola.municipio}
          inseGrupo={escola.inse_grupo}
        />

        {/* Cruzamento ICA × Saeb 5º EF (continuidade) */}
        <AlfabetizacaoSaebCard
          ica={icaMunicipio}
          saeb={saeb}
          municipio={escola.municipio}
        />

        {/* Infra (Censo Escolar) */}
        {censo && <InfraSection censo={censo} />}

        {/* Ideb timeline (chart SVG) */}
        {ideb.length > 0 && (
          <IdebTimelineChart
            ideb={ideb}
            microIdeb={
              benchmarks.find((b) => b.scope === 'microrregiao')?.ideb_9ef ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.ideb_5ef ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.ideb_3em ?? null
            }
          />
        )}

        {enem.length > 0 && <EnemEscolaSection enem={enem} />}

        {/* Saeb história (chart SVG) */}
        {saeb.length > 0 && (
          <SaebHistoryChart
            saeb={saeb}
            microLp={
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_9ef_lp ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_5ef_lp ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_3em_lp ?? null
            }
            microMat={
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_9ef_mat ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_5ef_mat ??
              benchmarks.find((b) => b.scope === 'microrregiao')?.saeb_3em_mat ?? null
            }
          />
        )}

        {/* SARESP — só pra escolas SP */}
        {escola.uf === 'SP' && saresp.length > 0 && <SarespSection saresp={saresp} />}

        {/* PDDE — recursos federais diretos */}
        {pdde.length > 0 && <PddeSection pdde={pdde} />}

        {/* Saeb cards */}
        {saeb.length > 0 ? (
          <section className="mb-10">
            <h2 className="text-white text-xl font-bold mb-4">Saeb por etapa</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {saeb.map((s, i) => <SaebCard key={i} snapshot={s} />)}
            </div>
          </section>
        ) : (
          <section className="mb-10 rounded-2xl p-8 text-center border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-sm text-white/55">Ainda não há resultados Saeb publicados nesta plataforma para esta escola.</p>
          </section>
        )}

        {/* CTA Lead */}
        <section className="text-center py-12 mb-10 rounded-2xl border border-cyan-400/20"
          style={{ background: 'rgba(52,197,204,0.04)' }}>
          <h3 className="text-white text-xl font-bold mb-2">Quer aprofundar?</h3>
          <p className="text-sm text-white/65 mb-6 max-w-[480px] mx-auto">
            Receba um diagnóstico Vertho em PDF com plano de ação contextualizado pra esta escola. Gratuito.
          </p>
          <LeadCTA scopeType="escola" scopeId={escola.codigo_inep} scopeLabel={escola.nome} />
        </section>

        {/* Disclaimer + citar */}
        <div className="flex flex-col items-center gap-3 mb-2">
          <p className="text-[11px] text-white/35 text-center max-w-[640px] mx-auto leading-relaxed">
            Análise gerada a partir de dados públicos do INEP. Valores oficiais devem ser consultados em portais governamentais.
          </p>
          <CitarButton scopeType="escola" scopeId={escola.codigo_inep} scopeLabel={escola.nome} />
        </div>
      </div>

      <RadarFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}

function EnemEscolaSection({ enem }: {
  enem: Array<{
    ano: number;
    participantes_total: number;
    participantes_com_objetiva: number;
    participantes_com_redacao: number;
    participantes_com_media_geral: number;
    media_cn: number | null;
    media_ch: number | null;
    media_lc: number | null;
    media_mt: number | null;
    media_redacao: number | null;
    media_objetiva: number | null;
    media_geral: number | null;
    dependencia_adm: string | null;
    localizacao: string | null;
  }>;
}) {
  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        ENEM · escola
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Desempenho agregado por escola
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 760 }}>
        Média das notas dos participantes associados a esta escola nos microdados do Enem. Escolas com menos de 10 participantes
        exigem leitura cautelosa.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {enem.map((row) => {
          const amostraPequena = row.participantes_total < 10;
          return (
            <div key={row.ano}
              className="rounded-2xl p-5 border border-white/[0.08]"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/45">
                    ENEM {row.ano}
                  </p>
                  <p className="text-[11px] text-white/45 font-mono mt-1">
                    {row.dependencia_adm || 'rede n/d'} · {row.localizacao || 'localização n/d'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40 font-mono">
                    {row.participantes_total} participantes
                  </p>
                  {amostraPequena && (
                    <p className="text-[10px] text-amber-300/90 font-mono">
                      amostra pequena
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric label="Média geral" value={row.media_geral} />
                <Metric label="Objetiva" value={row.media_objetiva} />
                <Metric label="Redação" value={row.media_redacao} />
                <Metric label="CN" value={row.media_cn} />
                <Metric label="CH" value={row.media_ch} />
                <Metric label="LC" value={row.media_lc} />
                <Metric label="MT" value={row.media_mt} />
                <Metric label="Obj. completas" value={row.participantes_com_objetiva} integer />
                <Metric label="Média geral vál." value={row.participantes_com_media_geral} integer />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value, integer = false }: { label: string; value: number | null; integer?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-[10px] tracking-[0.14em] uppercase font-bold text-white/40 mb-2">{label}</p>
      <p className="text-white font-mono text-xl">
        {value == null ? '—' : integer ? value.toLocaleString('pt-BR') : value.toFixed(1)}
      </p>
    </div>
  );
}
