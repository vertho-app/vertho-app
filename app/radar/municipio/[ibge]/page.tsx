import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';

import { getMunicipio, getMunicipioBenchmarks, getMunicipioVariabilidade, getDispersaoMunicipal } from '@/lib/radar/queries';
import { estimarVaar } from '@/lib/radar/vaar-estimativa';
import { calcularCondIIDerivadoMunicipio, getStatusICMSEducacional } from '@/lib/radar/vaar-derivado';
import { leituraIcaMunicipio } from '@/lib/radar/leitura-deterministica';
import { registrarEvento } from '@/lib/radar/eventos';
import { RadarHeader, RadarFooter } from '../../_components/radar-header';
import { LeadCTA } from '../../_components/lead-cta';
import { NarrativaIA, NarrativaSkeleton } from '../../_components/narrativa-ia';
import { CitarButton } from '../../_components/citar-button';
import { FundebSection } from '../../_components/fundeb-section';
import { VaarSection } from '../../_components/vaar-section';
import { BenchmarkTable } from '../../_components/benchmark-table';
import { VariabilidadeCard } from '../../_components/variabilidade-card';
import { HeroMunicipio } from '../../_components/hero-municipio';
import { AtuacaoVerthoMunicipio } from '../../_components/atuacao-vertho';
import { FaleConosco } from '../../_components/fale-conosco';

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

  registrarEvento('view_municipio', { scopeType: 'municipio', scopeId: ibge }).catch(() => {});

  const [benchmarks, variabilidade, dispersao] = await Promise.all([
    getMunicipioBenchmarks(ibge),
    getMunicipioVariabilidade(ibge),
    getDispersaoMunicipal(ibge),
  ]);

  // Estimativa VAAR — só calcula quando município não é beneficiário
  // mas recebe alguma complementação federal (VAAF/VAAT)
  const vaarEstimativa = m.vaar && m.vaar.beneficiario === false && m.receitaPrevista
    ? await estimarVaar({
        uf: m.uf,
        complementacaoVaaf: m.receitaPrevista.complementacao_vaaf,
        complementacaoVaat: m.receitaPrevista.complementacao_vaat,
      })
    : null;

  // Cálculos derivados pra cond_ii e cond_iv (transparência ao oficial FNDE)
  const condIIDerivado = m.vaar ? await calcularCondIIDerivadoMunicipio(ibge) : null;
  const statusICMS = m.vaar ? getStatusICMSEducacional(m.uf) : null;
  const microrregiao = await (async () => {
    const sb = (await import('@/lib/supabase')).createSupabaseAdmin();
    const { data } = await sb
      .from('diag_escolas')
      .select('microrregiao')
      .eq('municipio_ibge', ibge)
      .not('microrregiao', 'is', null)
      .limit(1)
      .maybeSingle();
    return (data as any)?.microrregiao || null;
  })();
  const determ = leituraIcaMunicipio(m, m.ica);
  const determRefBlock = (
    <p className="text-xs text-white/45 leading-relaxed italic border-l-2 border-white/10 pl-3">
      {determ.resumo}
    </p>
  );

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

      <div className="max-w-[1200px] mx-auto px-6 pt-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4">
          <ArrowLeft size={12} /> Buscar outro município
        </Link>

        <HeroMunicipio
          ibge={ibge}
          nome={m.nome}
          uf={m.uf}
          totalEscolas={m.totalEscolas}
          redes={m.redes}
          ica={m.ica}
          ideb={m.ideb}
          enem={m.enem}
          fundeb={m.fundeb}
          benchmarks={benchmarks}
          microrregiao={microrregiao}
        />

        <section className="mb-12 flex flex-col gap-4">
          <Suspense fallback={<NarrativaSkeleton resumoDeterm={determ.resumo} />}>
            <NarrativaIA
              scope="municipio"
              municipio={m}
              ica={m.ica}
              enem={m.enem}
              fundeb={m.fundeb}
              pddeMunicipal={m.pddeMunicipal}
              determRefBlock={determRefBlock}
            />
          </Suspense>
        </section>

        {/* Comparativo cidade vs microrregião vs UF vs Brasil */}
        {benchmarks.length > 0 && (
          <BenchmarkTable rows={benchmarks} microrregiao={microrregiao} uf={m.uf} />
        )}

        {/* Variabilidade entre escolas da rede */}
        {variabilidade && <VariabilidadeCard data={variabilidade} />}

        {/* Ideb médio das escolas */}
        {m.ideb.length > 0 && <MunicipioIdebSection ideb={m.ideb} />}

        {m.enem.length > 0 && <MunicipioEnemSection enem={m.enem} />}

        {/* FUNDEB — recursos da rede */}
        {m.fundeb && m.fundeb.length > 0 && <FundebSection fundeb={m.fundeb} />}

        {/* VAAR — habilitação para complementação por resultado */}
        {m.vaar && (
          <VaarSection
            vaar={m.vaar}
            receita={m.receitaPrevista}
            estimativa={vaarEstimativa}
            condIIDerivado={condIIDerivado}
            statusICMS={statusICMS}
          />
        )}

        {/* ICA cards */}
        {m.ica.length > 0 && (
          <section className="mb-12">
            <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
              ICA · {m.nome}
            </p>
            <h2 className="text-white mb-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 'clamp(24px, 3vw, 32px)',
                fontWeight: 600,
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}>
              Indicador Criança Alfabetizada
            </h2>
            <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
              Percentual de crianças avaliadas no 2º ano EF que demonstram domínio das
              habilidades de leitura, escrita e matemática esperadas.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {m.ica.slice(0, 9).map((i) => (
                <div key={`${i.rede}-${i.ano}`}
                  className="rounded-2xl p-5 border border-white/[0.08]"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/45 mb-2">
                    {i.ano} · {i.rede}
                  </p>
                  <p className="text-white"
                    style={{
                      fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                      fontSize: 36, fontWeight: 600, lineHeight: 1,
                    }}>
                    {(i.taxa ?? 0).toFixed(1)}<span className="text-base text-white/45 ml-1">%</span>
                  </p>
                  {i.alunos_avaliados != null && i.alunos_avaliados > 0 ? (
                    <p className="text-[11px] text-white/55 mt-2 font-mono">
                      {i.alfabetizados ?? 0} de {i.alunos_avaliados} alunos
                    </p>
                  ) : (
                    <p className="text-[11px] text-white/35 mt-2 italic">
                      total de alunos não disponível na fonte
                    </p>
                  )}
                  {i.total_estado != null && i.total_estado > 0 && (
                    <p className="text-[11px] text-white/35 mt-2 font-mono">
                      UF: {i.total_estado.toFixed(1)}% · BR: {(i.total_brasil || 0).toFixed(1)}%
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Onde a Vertho pode ajudar — frentes derivadas dos dados da rede */}
        <AtuacaoVerthoMunicipio
          ica={m.ica}
          ideb={m.ideb}
          enem={m.enem}
          vaar={m.vaar}
          redes={m.redes}
          dispersao={dispersao}
          benchmarks={benchmarks}
          uf={m.uf}
          nome={m.nome}
        />

        {/* CTA */}
        <section className="text-center py-12 mb-10 rounded-2xl border border-cyan-400/20"
          style={{ background: 'rgba(52,197,204,0.04)' }}>
          <h3 className="text-white text-xl font-bold mb-2">Quer aprofundar?</h3>
          <p className="text-sm text-white/65 mb-6 max-w-[480px] mx-auto">
            Receba um diagnóstico Vertho em PDF com plano de ação contextualizado pra {m.nome}. Gratuito.
          </p>
          <LeadCTA scopeType="municipio" scopeId={ibge} scopeLabel={`${m.nome}/${m.uf}`} />
        </section>

        <div className="flex flex-col items-center gap-3 mb-2">
          <p className="text-[11px] text-white/35 text-center max-w-[640px] mx-auto leading-relaxed">
            Análise gerada a partir de dados públicos do INEP. Valores oficiais devem ser consultados em portais governamentais.
          </p>
          <CitarButton scopeType="municipio" scopeId={ibge} scopeLabel={`${m.nome}/${m.uf}`} />
        </div>
      </div>

      <RadarFooter />
      <FaleConosco scopeType="municipio" scopeId={ibge} scopeName={m.nome} scopeUf={m.uf} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}

function MunicipioIdebSection({ ideb }: {
  ideb: Array<{
    ano: number;
    etapa: string;
    idebAvg: number | null;
    rendimentoAvg: number | null;
    notaSaebAvg: number | null;
    totalEscolas: number;
  }>;
}) {
  const byEtapa = new Map<string, typeof ideb>();
  for (const row of ideb) {
    if (!byEtapa.has(row.etapa)) byEtapa.set(row.etapa, []);
    byEtapa.get(row.etapa)!.push(row);
  }

  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        Ideb · médio da rede
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Trajetória do Ideb por etapa
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 720 }}>
        Média do Ideb das escolas do município por etapa, com indicador de rendimento e
        nota Saeb padronizada. Cobertura por edição varia conforme participação das escolas.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from(byEtapa.entries()).map(([etapa, rows]) => (
          <div key={etapa}
            className="rounded-2xl p-5 border border-white/[0.08]"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/55 mb-3">
              {etapaLabel(etapa)}
            </p>
            <div className="space-y-2.5">
              {rows
                .slice()
                .sort((a, b) => b.ano - a.ano)
                .map((row) => (
                  <div key={`${etapa}-${row.ano}`} className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-white/45 font-mono">{row.ano}</span>
                    <span className="font-mono"
                      style={{
                        fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                        fontSize: 22, fontWeight: 600, color: 'white',
                      }}>
                      {row.idebAvg != null ? row.idebAvg.toFixed(1) : '—'}
                    </span>
                    <span className="text-[10px] text-white/40 font-mono">
                      {row.totalEscolas} esc · N {row.notaSaebAvg != null ? row.notaSaebAvg.toFixed(2) : '—'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function etapaLabel(etapa: string) {
  if (etapa === '5_EF') return 'Anos iniciais';
  if (etapa === '9_EF') return 'Anos finais';
  if (etapa === '3_EM') return 'Ensino médio';
  return etapa;
}

function MunicipioEnemSection({ enem }: {
  enem: Array<{
    ano: number;
    totalEscolas: number;
    escolasCom10: number;
    participantesTotal: number;
    participantesTotalCom10: number;
    participantesMediaGeral: number;
    mediaGeralPonderada: number | null;
    mediaObjetivaPonderada: number | null;
    mediaRedacaoPonderada: number | null;
  }>;
}) {
  return (
    <section className="mb-12">
      <p className="text-[11px] tracking-[0.15em] uppercase font-bold mb-3" style={{ color: '#34c5cc' }}>
        ENEM · município
      </p>
      <h2 className="text-white mb-3"
        style={{
          fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
        }}>
        Resultado agregado das escolas
      </h2>
      <p className="text-white/60 mb-6 leading-relaxed" style={{ fontSize: 15, maxWidth: 760 }}>
        Médias ponderadas pelos participantes com nota válida nos microdados do Enem. O indicador
        “escolas com 10+” define o corte público usado no Radar para comparar o município.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {enem.map((row) => (
          <div key={row.ano}
            className="rounded-2xl p-5 border border-white/[0.08]"
            style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] tracking-[0.18em] uppercase font-bold text-white/45">
                  ENEM {row.ano}
                </p>
                <p className="text-[11px] text-white/45 font-mono mt-1">
                  {row.totalEscolas} escolas · {row.escolasCom10} com 10+ participantes
                </p>
              </div>
              <p className="text-[11px] text-white/40 font-mono">
                {row.participantesTotalCom10.toLocaleString('pt-BR')} participantes no corte
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MunicipioEnemMetric label="Média geral" value={row.mediaGeralPonderada} />
              <MunicipioEnemMetric label="Objetiva" value={row.mediaObjetivaPonderada} />
              <MunicipioEnemMetric label="Redação" value={row.mediaRedacaoPonderada} />
              <MunicipioEnemMetric label="Com média geral" value={row.participantesMediaGeral} integer />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MunicipioEnemMetric({ label, value, integer = false }: { label: string; value: number | null; integer?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <p className="text-[10px] tracking-[0.14em] uppercase font-bold text-white/40 mb-2">{label}</p>
      <p className="text-white font-mono text-xl">
        {value == null ? '—' : integer ? value.toLocaleString('pt-BR') : value.toFixed(1)}
      </p>
    </div>
  );
}
