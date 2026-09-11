import Link from 'next/link';
import { ArrowRight, ExternalLink, Handshake, Radar } from 'lucide-react';

export const metadata = { title: 'Negócios · Admin por fluxo' };

const ETAPAS = [
  {
    numero: '01',
    titulo: 'Mercado',
    descricao: 'Descobrir territórios, redes e empresas aderentes ao ICP.',
    // ⛔ 31/08/2026: o Radar de empresas (e suas telas de Listas e Redes) é
    // bloco OFF-LINE — lib/blocos-offline.ts. "Mercado potencial" assume como
    // principal desta etapa: é a única das quatro que continua no ar, e uma
    // etapa sem ação principal não é etapa.
    principal: { rotulo: 'Mercado potencial', href: '/admin/vertho/mercado-potencial' },
    apoios: [],
  },
  {
    numero: '02',
    titulo: 'Contas',
    descricao: 'Qualificar a organização e reunir contexto antes da abordagem.',
    principal: { rotulo: 'Inteligência comercial', href: '/admin/comercial' },
    apoios: [{ rotulo: 'Materiais comerciais', href: '/admin/comercial/materiais' }],
  },
  {
    numero: '03',
    titulo: 'Oportunidades',
    descricao: 'Acompanhar conversas em andamento e o próximo movimento.',
    principal: { rotulo: 'Pipeline comercial', href: '/admin/comercial' },
    apoios: [{ rotulo: 'Representantes', href: '/admin/comercial/representantes' }],
  },
  {
    numero: '04',
    titulo: 'Propostas',
    descricao: 'Precificar, montar e conduzir a proposta até a decisão.',
    principal: { rotulo: 'Propostas', href: '/admin/comercial/propostas' },
    apoios: [
      { rotulo: 'Precificação comercial', href: '/admin/vertho/orcamento' },
    ],
  },
  {
    numero: '05',
    titulo: 'Carteira',
    descricao: 'Manter contas ganhas, responsáveis e remuneração comercial.',
    principal: { rotulo: 'Carteira comercial', href: '/admin/comercial/carteira' },
    apoios: [{ rotulo: 'Comissões', href: '/admin/comercial/comissoes' }],
  },
  {
    numero: '06',
    titulo: 'Handoff',
    descricao: 'Entregar o contrato para implantação sem perder contexto.',
    principal: { rotulo: 'Abrir clientes e turmas', href: '/admin-v2/clientes' },
    apoios: [],
  },
] as const;

export default function NegociosPage() {
  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b border-white/[0.08] pb-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
        <div>
          <p className="font-[family-name:var(--font-manrope)] text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--cyan)]">Fluxo comercial</p>
          <h1 className="mt-2 max-w-[790px] text-[clamp(30px,4vw,50px)] font-semibold leading-[0.98] tracking-[-0.045em]">
            Do mercado ao <span className="font-[family-name:var(--font-serif)] font-normal italic text-[var(--cyan-soft)]">handoff</span>
          </h1>
          <p className="mt-4 max-w-[70ch] text-[13.5px] leading-relaxed text-[var(--ink-dim)]">
            As ferramentas comerciais continuam especializadas; esta página organiza quando cada uma entra no trabalho e qual é a próxima passagem.
          </p>
        </div>
        <div className="flex items-start gap-3 border-l border-[#34c5cc35] pl-4">
          <Handshake size={18} className="mt-0.5 shrink-0 text-[var(--cyan)]" />
          <div>
            <p className="text-[12px] font-semibold">A chegada é a operação</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--ink-faint)]">Uma venda ganha desemboca diretamente em Empresa → Fundação → Turmas.</p>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Radar size={14} className="text-[var(--cyan)]" />
        <p className="font-[family-name:var(--font-manrope)] text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-faint)]">Trilho de negócios</p>
      </div>

      <ol className="overflow-hidden rounded-[16px] border border-white/[0.08] bg-[var(--navy-card)]">
        {ETAPAS.map((etapa, index) => (
          <li key={etapa.titulo} className="group relative grid gap-4 border-b border-white/[0.06] px-4 py-4 last:border-b-0 sm:grid-cols-[48px_minmax(0,1fr)_minmax(220px,0.7fr)] sm:items-center sm:px-5">
            <div className="relative self-stretch">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-[#34c5cc45] bg-[#34c5cc0c] font-[family-name:var(--font-manrope)] text-[9px] font-bold text-[var(--cyan)]">{etapa.numero}</span>
              {index < ETAPAS.length - 1 && <span aria-hidden className="absolute bottom-[-17px] left-[15px] top-8 hidden w-px bg-[#34c5cc24] sm:block" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{etapa.titulo}</h2>
              <p className="mt-1 max-w-[62ch] text-[11.5px] leading-relaxed text-[var(--ink-faint)]">{etapa.descricao}</p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <Link href={etapa.principal.href} className="inline-flex items-center gap-2 rounded-[9px] border border-[#34c5cc3d] bg-[#34c5cc0b] px-3 py-2 text-[11px] font-semibold text-[var(--cyan)] transition-colors hover:bg-[#34c5cc16]">
                {etapa.principal.rotulo} {etapa.titulo === 'Handoff' ? <ArrowRight size={11} /> : <ExternalLink size={11} />}
              </Link>
              {etapa.apoios.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 sm:justify-end">
                  {etapa.apoios.map((apoio) => (
                    <Link key={apoio.href} href={apoio.href} className="text-[10px] text-[var(--ink-faint)] transition-colors hover:text-[var(--cyan)] hover:underline">{apoio.rotulo}</Link>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
