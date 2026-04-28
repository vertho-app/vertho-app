import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, MapPin, GraduationCap } from 'lucide-react';

import { getMunicipio, getEscolasMunicipio } from '@/lib/radar/queries';
import { leituraIcaMunicipio } from '@/lib/radar/leitura-deterministica';
import { getNarrativaMunicipio } from '@/lib/radar/ia-narrativa';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { LeadCTA } from '../../_components/lead-cta';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ ibge: string }> }): Promise<Metadata> {
  const { ibge } = await params;
  const m = await getMunicipio(ibge);
  if (!m) return { title: 'Município não encontrado' };
  const title = `${m.nome}/${m.uf} — Saeb, Ideb e ICA do município`;
  const description = `Indicadores oficiais INEP por escola em ${m.nome}/${m.uf}. ${m.totalEscolas} escolas e séries históricas do ICA municipal.`;
  return {
    title,
    description,
    alternates: { canonical: `https://radar.vertho.ai/municipio/${ibge}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function MunicipioPage({ params }: { params: Promise<{ ibge: string }> }) {
  const { ibge } = await params;
  const m = await getMunicipio(ibge);
  if (!m) return notFound();

  const escolas = await getEscolasMunicipio(ibge);
  const determ = leituraIcaMunicipio(m, m.ica);
  const ia = await getNarrativaMunicipio(m, m.ica);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: m.nome,
    identifier: ibge,
    address: { '@type': 'PostalAddress', addressLocality: m.nome, addressRegion: m.uf, addressCountry: 'BR' },
    url: `https://radar.vertho.ai/municipio/${ibge}`,
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
          <ArrowLeft size={12} /> Buscar outro município
        </Link>

        <section className="mb-10">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Município · IBGE {ibge}
          </p>
          <h1 className="text-white mb-4"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(32px, 5vw, 52px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}>
            {m.nome}, <em style={{ color: '#34c5cc' }}>{m.uf}</em>
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/55 font-mono">
            <span className="flex items-center gap-1.5">
              <GraduationCap size={12} style={{ color: '#34c5cc' }} />
              {m.totalEscolas} escolas no Radar
            </span>
            {Object.entries(m.redes).slice(0, 4).map(([rede, n]) => (
              <span key={rede} className="text-white/40">{rede}: {n}</span>
            ))}
          </div>
        </section>

        <section className="mb-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#34c5cc' }}>
              Leitura
            </p>
            <p className="text-sm text-white/80 leading-relaxed mb-3">{ia.resumo}</p>
            <p className="text-xs text-white/45 leading-relaxed italic border-l-2 border-white/10 pl-3">
              {determ.resumo}
            </p>
          </div>
          <div className="space-y-3">
            {ia.pontos_atencao.length > 0 && (
              <Bloco titulo="Pontos de Atenção" cor="#F97354" itens={ia.pontos_atencao} />
            )}
            {ia.pontos_destaque.length > 0 && (
              <Bloco titulo="Destaques" cor="#34D399" itens={ia.pontos_destaque} />
            )}
          </div>
        </section>

        {/* ICA cards */}
        {m.ica.length > 0 && (
          <section className="mb-10">
            <h2 className="text-white text-xl font-bold mb-4">Indicador Criança Alfabetizada (ICA)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {m.ica.slice(0, 9).map((i) => (
                <div key={`${i.rede}-${i.ano}`}
                  className="rounded-2xl p-4 border border-white/[0.06]"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <p className="text-[9px] uppercase tracking-wider font-mono text-white/40">
                    {i.ano} · {i.rede}
                  </p>
                  <p className="text-3xl font-bold text-white mt-2 font-mono">{(i.taxa ?? 0).toFixed(1)}<span className="text-base text-white/45">%</span></p>
                  <p className="text-[10px] text-white/45 mt-1 font-mono">
                    {i.alfabetizados ?? 0} de {i.alunos_avaliados ?? 0} alunos
                  </p>
                  {i.total_estado != null && (
                    <p className="text-[10px] text-white/35 mt-2">UF: {i.total_estado.toFixed(1)}% · BR: {(i.total_brasil || 0).toFixed(1)}%</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lista de escolas */}
        {escolas.length > 0 && (
          <section className="mb-10">
            <h2 className="text-white text-xl font-bold mb-4">Escolas em {m.nome}</h2>
            <div className="rounded-2xl border border-white/[0.06] overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)' }}>
              {escolas.map((e) => (
                <Link key={e.codigo_inep} href={`/escola/${e.codigo_inep}`}
                  className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{e.nome}</p>
                    <p className="text-[11px] text-white/40 font-mono">INEP {e.codigo_inep} · {e.rede || 'rede n/d'}</p>
                  </div>
                  <span className="text-xs text-cyan-400 ml-3">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Perguntas */}
        {ia.perguntas_pedagogicas.length > 0 && (
          <section className="mb-10 rounded-2xl p-5 border border-white/[0.06]"
            style={{ background: 'rgba(154,226,230,0.04)' }}>
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-3" style={{ color: '#9ae2e6' }}>
              Perguntas para discussão na secretaria
            </p>
            <ul className="space-y-2">
              {ia.perguntas_pedagogicas.map((q, i) => (
                <li key={i} className="text-sm text-white/75 leading-relaxed">
                  <span className="text-cyan-400 mr-2">→</span>{q}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <section className="text-center py-12 mb-10 rounded-2xl border border-cyan-400/20"
          style={{ background: 'rgba(52,197,204,0.04)' }}>
          <h3 className="text-white text-xl font-bold mb-2">Quer aprofundar?</h3>
          <p className="text-sm text-white/65 mb-6 max-w-[480px] mx-auto">
            Receba um diagnóstico Vertho em PDF com plano de ação contextualizado pra {m.nome}. Gratuito.
          </p>
          <LeadCTA scopeType="municipio" scopeId={ibge} scopeLabel={`${m.nome}/${m.uf}`} />
        </section>

        <p className="text-[11px] text-white/35 text-center mb-2 max-w-[640px] mx-auto leading-relaxed">
          Análise gerada a partir de dados públicos do INEP. Valores oficiais devem ser consultados em portais governamentais.
        </p>
      </div>

      <RadarFooter />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}

function Bloco({ titulo, cor, itens }: { titulo: string; cor: string; itens: string[] }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
      <p className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2" style={{ color: cor }}>
        {titulo}
      </p>
      <ul className="space-y-1.5">
        {itens.map((t, i) => (
          <li key={i} className="text-xs text-white/70 leading-relaxed">{t}</li>
        ))}
      </ul>
    </div>
  );
}
