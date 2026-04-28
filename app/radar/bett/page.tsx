import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Search, GraduationCap, MapPin, Map } from 'lucide-react';
import { RadarHeader, RadarFooter } from '../_components/radar-header';
import { RadarSearch } from '../_components/radar-search';

export const metadata: Metadata = {
  title: 'Bett 2026 — demos do Radar',
  description:
    'Páginas selecionadas do Radar Vertho pra apresentação na Bett 2026. Saeb, ICA, Censo, Ideb, FUNDEB e SARESP por escola e município.',
  alternates: { canonical: 'https://radar.vertho.ai/bett' },
};

type Demo = {
  href: string;
  badge: string;
  titulo: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; style?: any }>;
  destaque?: boolean;
};

// Códigos placeholder — substituir por reais antes do evento
const DEMOS: Demo[] = [
  {
    href: '/escola/29062519',
    badge: 'Escola · Bahia',
    titulo: 'Colégio Mirorós (Ibipeba)',
    sub: 'Saeb + ICA + Censo. Caso âncora do piloto.',
    icon: GraduationCap,
    destaque: true,
  },
  {
    href: '/escola/35000001',
    badge: 'Escola · São Paulo',
    titulo: 'Escola Estadual SP',
    sub: 'Saeb + SARESP + Censo. UF da Bett.',
    icon: GraduationCap,
  },
  {
    href: '/municipio/2912400',
    badge: 'Município · Bahia',
    titulo: 'Ibipeba (microrregião Irecê)',
    sub: 'ICA + escolas + FUNDEB. Origem do piloto.',
    icon: MapPin,
    destaque: true,
  },
  {
    href: '/municipio/3550308',
    badge: 'Município · São Paulo',
    titulo: 'São Paulo (capital)',
    sub: 'ICA + FUNDEB + 1.500+ escolas indexadas.',
    icon: MapPin,
  },
  {
    href: '/estado/BA',
    badge: 'Estado',
    titulo: 'Bahia',
    sub: 'Ranking municipal Saeb e ICA. Microrregiões cobertas.',
    icon: Map,
  },
  {
    href: '/comparar',
    badge: 'Comparativo',
    titulo: 'Lado a lado',
    sub: 'Selecione até 4 escolas e compare Saeb, infra e ICA.',
    icon: ArrowRight,
  },
];

export default function BettPage() {
  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <section className="max-w-[1100px] mx-auto px-6 pt-10 pb-6">
        <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-4" style={{ color: '#34c5cc' }}>
          Bett 2026
        </p>
        <h1 className="text-white mb-4"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontSize: 'clamp(36px, 6vw, 64px)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}>
          Saeb, Ideb, ICA, FUNDEB e SARESP <em style={{ color: '#34c5cc' }}>num só lugar</em>
        </h1>
        <p className="text-base text-white/65 leading-relaxed max-w-[680px] mb-8">
          O Radar Vertho consolida indicadores oficiais do INEP, Tesouro e Seduc-SP por escola
          e município, com leitura contextualizada por IA e relatórios sob demanda. Abaixo,
          atalhos pras demos preparadas pro evento.
        </p>

        <RadarSearch />
      </section>

      <section className="max-w-[1100px] mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DEMOS.map((d) => {
            const Icon = d.icon;
            return (
              <Link key={d.href} href={d.href}
                className="rounded-2xl p-5 border transition-all hover:bg-white/[0.04]"
                style={{
                  background: d.destaque ? 'rgba(52,197,204,0.06)' : 'rgba(255,255,255,0.03)',
                  borderColor: d.destaque ? 'rgba(52,197,204,0.22)' : 'rgba(255,255,255,0.06)',
                }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(52,197,204,0.12)' }}>
                    <Icon size={18} style={{ color: '#34c5cc' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] tracking-[0.18em] uppercase font-mono mb-1" style={{ color: '#9ae2e6' }}>
                      {d.badge}
                    </p>
                    <h3 className="text-base font-bold text-white mb-1 leading-tight">{d.titulo}</h3>
                    <p className="text-xs text-white/55 leading-relaxed">{d.sub}</p>
                  </div>
                  <ArrowRight size={14} className="text-white/35 mt-3 flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 rounded-2xl p-6 border border-white/[0.06]"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h2 className="text-white text-base font-bold mb-2">Receba diagnóstico em PDF</h2>
          <p className="text-xs text-white/60 mb-4 leading-relaxed">
            Em qualquer página de escola ou município, clique em "Receba diagnóstico Vertho em
            PDF". O documento (gratuito) chega no seu e-mail em segundos com leitura
            institucional, plano de ação e fontes citadas.
          </p>
          <div className="flex items-center gap-2 text-[11px] text-white/55 font-mono">
            <Search size={11} />
            <span>radar.vertho.ai · gratuito · sem cadastro pra navegar</span>
          </div>
        </div>
      </section>

      <RadarFooter />
    </main>
  );
}
