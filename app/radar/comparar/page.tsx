import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, GitCompare } from 'lucide-react';
import { getEscolasCompactas, getMunicipiosCompactos } from '@/lib/radar/queries';
import { RadarHeader, RadarFooter } from '../_components/radar-header';
import { CompararPicker, type CompararModo } from './_picker';
import { CompararTabela } from './_tabela';
import { CompararTabelaCidades } from './_tabela-cidades';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Comparar escolas ou cidades',
  description:
    'Compare lado a lado até 4 escolas (Saeb, Censo, INSE) ou 4 cidades (ICA, Ideb, Saeb da rede, FUNDEB, VAAR).',
  alternates: { canonical: 'https://radar.vertho.ai/comparar' },
};

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; escolas?: string; ibges?: string }>;
}) {
  const sp = await searchParams;
  const modo: CompararModo = sp.modo === 'cidades' ? 'cidades' : 'escolas';

  let codigos: string[] = [];
  if (modo === 'escolas') {
    codigos = (sp.escolas || '').split(',').filter((c) => /^\d{8}$/.test(c)).slice(0, 4);
  } else {
    codigos = (sp.ibges || '').split(',').filter((c) => /^\d{7}$/.test(c)).slice(0, 4);
  }

  const escolas = modo === 'escolas' && codigos.length > 0
    ? await getEscolasCompactas(codigos)
    : [];
  const cidades = modo === 'cidades' && codigos.length > 0
    ? await getMunicipiosCompactos(codigos)
    : [];

  const heading = modo === 'escolas' ? 'Escolas' : 'Cidades';
  const sub = modo === 'escolas'
    ? 'Selecione até 4 escolas para ver Saeb, infraestrutura do Censo Escolar e benchmarks do mesmo grupo socioeconômico.'
    : 'Selecione até 4 cidades para ver ICA, Ideb, Saeb agregado da rede, FUNDEB R$/aluno e status VAAR.';

  return (
    <main className="min-h-dvh"
      style={{
        background:
          'radial-gradient(1100px 500px at 88% -5%, rgba(52,197,204,.07), transparent 55%),' +
          'radial-gradient(900px 500px at -5% 30%, rgba(154,226,230,.06), transparent 60%),' +
          'linear-gradient(180deg,#06172C 0%,#091D35 50%,#0a1f3a 100%)',
      }}>
      <RadarHeader />

      <div className="max-w-[1200px] mx-auto px-6 pt-6 pb-16">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white mb-4">
          <ArrowLeft size={12} /> Voltar
        </Link>

        {/* Hero */}
        <header className="relative overflow-hidden mb-10 rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, rgba(8,26,55,0.6) 0%, rgba(15,43,84,0.4) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            padding: 'clamp(28px, 4vw, 48px)',
          }}>
          <div aria-hidden className="pointer-events-none absolute"
            style={{
              right: -140, top: -120, width: 480, height: 480,
              border: '60px solid rgba(52,197,204,0.06)', borderRadius: '50%',
            }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4 text-[11px] uppercase tracking-[0.12em] font-bold"
              style={{ color: '#9ae2e6' }}>
              <GitCompare size={14} />
              <span>Comparativo</span>
            </div>

            <h1 className="text-white mb-4"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontWeight: 600,
                fontSize: 'clamp(32px, 5vw, 52px)',
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
              }}>
              {heading} <em style={{ color: '#34c5cc', fontStyle: 'italic' }}>lado a lado</em>
            </h1>

            <p className="text-white/65 leading-relaxed mb-3" style={{ fontSize: 17, maxWidth: 720 }}>
              {sub}
            </p>
            {(escolas.length > 0 || cidades.length > 0) && (
              <p className="text-white/45 text-sm">
                {modo === 'escolas' ? escolas.length : cidades.length}{' '}
                {modo === 'escolas'
                  ? (escolas.length === 1 ? 'escola selecionada' : 'escolas selecionadas')
                  : (cidades.length === 1 ? 'cidade selecionada' : 'cidades selecionadas')} ·
                <span className="ml-1">compartilhe a comparação pela URL</span>
              </p>
            )}
          </div>
        </header>

        <CompararPicker
          codigosAtuais={codigos}
          modo={modo}
          itensSelecionados={
            modo === 'escolas'
              ? escolas.map((e) => ({ id: e.codigo_inep, nome: e.nome, uf: e.uf }))
              : cidades.map((c) => ({ id: c.ibge, nome: c.nome, uf: c.uf }))
          }
        />

        {modo === 'escolas' && escolas.length > 0 && (
          <div className="mt-8">
            <CompararTabela escolas={escolas} />
          </div>
        )}
        {modo === 'cidades' && cidades.length > 0 && (
          <div className="mt-8">
            <CompararTabelaCidades cidades={cidades} />
          </div>
        )}
        {((modo === 'escolas' && escolas.length === 0) ||
          (modo === 'cidades' && cidades.length === 0)) && (
          <div className="rounded-2xl p-12 text-center border border-white/[0.08] mt-8"
            style={{ background: 'rgba(255,255,255,0.03)' }}>
            <p className="text-white/85 mb-3"
              style={{
                fontFamily: 'var(--font-serif, "Instrument Serif", serif)',
                fontSize: 22, fontWeight: 600,
              }}>
              Adicione 2 ou mais {modo === 'escolas' ? 'escolas' : 'cidades'}
            </p>
            <p className="text-sm text-white/55 max-w-[420px] mx-auto leading-relaxed">
              Clique em &quot;{modo === 'escolas' ? 'Adicionar escola' : 'Adicionar cidade'}&quot; acima e
              busque por nome ou código {modo === 'escolas' ? 'INEP de 8 dígitos' : 'IBGE de 7 dígitos'}.
            </p>
          </div>
        )}

        <p className="text-[11px] text-white/35 text-center mt-12 mb-2 max-w-[640px] mx-auto leading-relaxed">
          {modo === 'escolas'
            ? 'Comparações sem ajuste de contexto socioeconômico. Para análise mais justa, considere também o INSE do grupo.'
            : 'Comparações entre cidades sem ajuste de porte ou contexto regional. Para análise mais justa, considere a microrregião IBGE.'}
          {' Ver '}
          <Link href="/radar/metodologia" className="text-cyan-400 hover:underline">metodologia</Link>.
        </p>
      </div>

      <RadarFooter />
    </main>
  );
}
