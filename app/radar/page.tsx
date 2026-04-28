import Link from 'next/link';
import { createSupabaseAdmin } from '@/lib/supabase';
import { loadRadarCountStats } from '@/lib/radar/stats';
import { RadarSearch } from './_components/radar-search';

export const dynamic = 'force-dynamic';

async function getStats() {
  const sb = createSupabaseAdmin();
  const stats = await loadRadarCountStats(sb);
  return {
    escolas: stats.escolas,
    municipios: stats.municipios,
    saeb: stats.saeb,
  };
}

export default async function RadarHomePage() {
  const stats = await getStats().catch(() => ({ escolas: 0, municipios: 0, saeb: 0 }));

  return (
    <main
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}
    >
      <header className="max-w-[1100px] mx-auto px-6 pt-8 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-vertho.png" alt="Vertho" style={{ height: 22, opacity: 0.85 }} />
          <span
            className="text-[10px] font-bold tracking-[0.25em] uppercase"
            style={{ color: '#34c5cc' }}
          >
            Radar
          </span>
        </div>
        <nav className="flex items-center gap-5 text-xs text-white/60">
          <Link href="/metodologia" className="hover:text-white">Metodologia</Link>
          <a href="https://vertho.ai" className="hover:text-white">vertho.ai</a>
        </nav>
      </header>

      <section className="max-w-[900px] mx-auto px-6 pt-16 pb-20 text-center">
        <p
          className="text-[10px] font-bold tracking-[0.3em] uppercase mb-5"
          style={{ color: '#34c5cc' }}
        >
          Diagnóstico público da educação
        </p>
        <h1
          className="text-white"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontSize: 'clamp(36px, 6vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: 18,
          }}
        >
          Aprendizagem, infraestrutura e repasses da sua{' '}
          <em style={{ color: '#34c5cc' }}>escola</em>{' '}
          em um só lugar
        </h1>
        <p className="text-base text-white/65 leading-relaxed max-w-[680px] mx-auto mb-10">
          Saeb, Ideb, ICA e SARESP cruzados com Censo Escolar e repasses do FUNDEB e
          PDDE — dados oficiais do INEP, FNDE e Tesouro organizados por escola e
          município, com leitura contextualizada e fontes citadas. Gratuito, sem
          cadastro pra navegar.
        </p>

        <RadarSearch />

        <div className="mt-10 flex items-center justify-center gap-8 text-[11px] text-white/40 font-mono">
          <span>{stats.escolas.toLocaleString('pt-BR')} escolas</span>
          <span>·</span>
          <span>{stats.municipios.toLocaleString('pt-BR')} municípios</span>
          <span>·</span>
          <span>{stats.saeb.toLocaleString('pt-BR')} séries Saeb</span>
        </div>
      </section>

      <section className="max-w-[1100px] mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: 'Aprendizagem',
              text: 'Saeb, Ideb e ICA em todo o Brasil, com SARESP por escola em São Paulo. Distribuição por nível de proficiência e benchmarks regionais.',
            },
            {
              title: 'Infraestrutura',
              text: 'Censo Escolar com 213 indicadores: dependências, equipamentos, acessibilidade e dimensões de qualidade do prédio escolar.',
            },
            {
              title: 'Repasses',
              text: 'FUNDEB e complementação da União por município e PDDE por escola, com séries históricas e fontes oficiais do FNDE e Tesouro.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl p-5 border border-white/[0.06]"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <p
                className="text-[10px] font-bold tracking-[0.18em] uppercase mb-2"
                style={{ color: '#34c5cc' }}
              >
                {card.title}
              </p>
              <p className="text-sm text-white/70 leading-relaxed">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/[0.06]">
        <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-[10px] text-white/35 uppercase tracking-[0.1em]">
          <span>© Vertho Mentor IA — radar.vertho.ai</span>
          <span>Dados oficiais INEP · MEC</span>
        </div>
      </footer>
    </main>
  );
}
