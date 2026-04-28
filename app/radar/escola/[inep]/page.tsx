import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, MapPin, Building2, Users, Calendar } from 'lucide-react';

import { getEscola } from '@/lib/radar/queries';
import { leituraSaebEscola, ETAPA_LABELS, DISC_LABELS } from '@/lib/radar/leitura-deterministica';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { SaebCard } from '../../_components/indicator-card';
import { LeadCTA } from '../../_components/lead-cta';
import { NarrativaIA, NarrativaSkeleton } from '../../_components/narrativa-ia';
import { InfraSection } from '../../_components/infra-card';
import { CitarButton } from '../../_components/citar-button';

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

      <div className="max-w-[1100px] mx-auto px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-6">
          <ArrowLeft size={12} /> Buscar outra escola
        </Link>

        {/* Hero */}
        <section className="mb-10">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Escola · INEP {escola.codigo_inep}
          </p>
          <h1 className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(28px, 4vw, 44px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}>
            {escola.nome}
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/55 font-mono">
            <span className="flex items-center gap-1.5">
              <MapPin size={12} style={{ color: '#34c5cc' }} />
              <Link href={escola.municipio_ibge ? `/municipio/${escola.municipio_ibge}` : '/'} className="hover:text-white">
                {escola.municipio}/{escola.uf}
              </Link>
            </span>
            {escola.rede && (
              <span className="flex items-center gap-1.5">
                <Building2 size={12} style={{ color: '#34c5cc' }} />
                {escola.rede}
              </span>
            )}
            {escola.zona && (
              <span className="flex items-center gap-1.5">
                <Users size={12} style={{ color: '#34c5cc' }} />
                Zona {escola.zona.toLowerCase()}
              </span>
            )}
            {escola.ano_referencia && (
              <span className="flex items-center gap-1.5">
                <Calendar size={12} style={{ color: '#34c5cc' }} />
                Ref. {escola.ano_referencia}
              </span>
            )}
            {escola.inse_grupo != null && (
              <span className="text-white/40">INSE Grupo {escola.inse_grupo}</span>
            )}
          </div>
        </section>

        {/* Leitura IA + determinística (Suspense pra UX progressiva) */}
        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Suspense fallback={<NarrativaSkeleton resumoDeterm={determ.resumo} />}>
            <NarrativaIA scope="escola" escola={escola} saeb={saeb} determRefBlock={determRefBlock} />
          </Suspense>
        </section>

        {/* Infra (Censo Escolar) */}
        {censo && <InfraSection censo={censo} />}

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

