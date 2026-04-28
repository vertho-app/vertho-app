import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getEscolasCompactas } from '@/lib/radar/queries';
import { RadarHeader, RadarFooter } from '../_components/radar-header';
import { CompararPicker } from './_picker';
import { CompararTabela } from './_tabela';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Comparar escolas',
  description:
    'Compare lado a lado até 4 escolas com indicadores oficiais Saeb, ICA e Censo Escolar.',
  alternates: { canonical: 'https://radar.vertho.ai/comparar' },
};

export default async function CompararPage({ searchParams }: { searchParams: Promise<{ escolas?: string }> }) {
  const sp = await searchParams;
  const codes = (sp.escolas || '').split(',').filter((c) => /^\d{8}$/.test(c)).slice(0, 4);
  const escolas = codes.length > 0 ? await getEscolasCompactas(codes) : [];

  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <div className="max-w-[1100px] mx-auto px-6 pb-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-6">
          <ArrowLeft size={12} /> Voltar
        </Link>

        <section className="mb-8">
          <p className="text-[10px] font-bold tracking-[0.25em] uppercase mb-3" style={{ color: '#34c5cc' }}>
            Comparativo
          </p>
          <h1 className="text-white mb-3"
            style={{
              fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
              fontSize: 'clamp(32px, 5vw, 48px)',
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}>
            Escolas <em style={{ color: '#34c5cc' }}>lado a lado</em>
          </h1>
          <p className="text-sm text-white/60 max-w-[640px] leading-relaxed">
            Selecione até 4 escolas para ver Saeb, infra do Censo e benchmarks do
            mesmo grupo. Compartilhe a comparação pela URL.
          </p>
        </section>

        <CompararPicker codigosAtuais={codes} />

        {escolas.length > 0 ? (
          <CompararTabela escolas={escolas} />
        ) : (
          <div className="rounded-2xl p-10 text-center border border-white/[0.06]"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <p className="text-sm text-white/50 mb-2">Adicione 2 ou mais escolas pra ver o comparativo.</p>
            <p className="text-xs text-white/35">
              Clique em "Adicionar escola" acima e busque por nome ou código INEP.
            </p>
          </div>
        )}

        <p className="text-[11px] text-white/35 text-center mt-12 mb-2 max-w-[640px] mx-auto leading-relaxed">
          Comparações sem ajuste de contexto socioeconômico. Para análise mais justa,
          considere também o INSE do grupo. Ver{' '}
          <Link href="/metodologia" className="text-cyan-400 hover:underline">metodologia</Link>.
        </p>
      </div>

      <RadarFooter />
    </main>
  );
}
