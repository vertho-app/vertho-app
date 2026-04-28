import Link from 'next/link';
import { RadarHeader, RadarFooter } from './_components/radar-header';

export default function NotFound() {
  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />
      <section className="max-w-[640px] mx-auto px-6 py-24 text-center">
        <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
          404
        </p>
        <h1 className="text-white mb-4"
          style={{
            fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
            fontSize: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.1,
          }}>
          Página não encontrada
        </h1>
        <p className="text-sm text-white/60 mb-8 leading-relaxed">
          A escola ou município que você procura ainda pode não estar indexado no Radar. Tente
          buscar na home ou volte mais tarde — novos dados são importados periodicamente.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #34c5cc, #0D9488)' }}>
          Voltar à busca
        </Link>
      </section>
      <RadarFooter />
    </main>
  );
}
